import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// Get Supabase config from Expo Constants (loaded from app.json/app.config.js)
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || "https://athkmrvsaijwgsyvwrbp.supabase.co";
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0aGttcnZzYWlqd2dzeXZ3cmJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NjM4NDQsImV4cCI6MjEwMTIzOTg0NH0.QAT0gZBJl-ELFG8221MRZoZoTj0La9_TOXFXx-HiKbY";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing Supabase configuration. Check app.json extra.supabaseUrl and extra.supabaseAnonKey");
}

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // Increase timeout for network resilience
  global: {
    headers: { "x-timeout": "30000" }, // 30 second timeout
  },
});

// ---- Marketplace session helpers (session-cookie model) ----
// Customer WebView paths inject ONLY the shared session cookies fetched via
// `get_marketplace_session`. Credentials are never read on mobile: the legacy
// `getMarketplaceAccount` helper (which selected username/password_encrypted
// straight off `marketplace_accounts`) has been deleted — it had zero call
// sites and no reason to exist under the session-cookie model.

export interface MarketplaceSession {
  cookies: string;
  cookiesUpdatedAt: string | null;
  health: string | null;
}

/**
 * How long a browser screen may wait to learn whether there is a shared
 * login. The client-wide header asks for 30s, which is useless here: the
 * cookies are delivered through `injectedJavaScriptBeforeContentLoaded`, and
 * a value that arrives after the document has started loading only applies
 * from the NEXT navigation. Without a time-box a hung RPC on Somali mobile
 * data meant the first page — the one the customer actually waited for —
 * silently rendered as a logged-out login wall.
 */
export const MARKETPLACE_SESSION_TIMEOUT_MS = 6000;

export interface MarketplaceSessionResult {
  /** A usable session, or null when there is none or nothing is known. */
  session: MarketplaceSession | null;
  /** The read itself failed (RPC error, timeout, throw) — NOT "no login". */
  failed: boolean;
  /** True when `failed` is true and the value served is the last-known one. */
  stale: boolean;
  error?: string;
}

/**
 * In-memory, per-app-session cache of the last session we successfully read,
 * by marketplace.
 *
 * Two jobs, neither of which touches storage: it lets a repeat visit inject
 * cookies BEFORE the document loads instead of one navigation late, and it
 * gives a failed read something honest to serve (flagged `stale`). Cookies
 * are never written to AsyncStorage or any file, and a fresh read always
 * overwrites what is here, so a session a staff member re-synced wins as
 * soon as the next read lands.
 */
const sessionCache = new Map<string, MarketplaceSession>();

/**
 * Fetch the ACTIVE SHARED SESSION (cookies only) for a marketplace, time-boxed,
 * reporting failure separately from absence.
 *
 * Session-cookie model: the SECURITY DEFINER RPC `get_marketplace_session`
 * returns rows of { marketplace, cookies, cookies_updated_at, health } and
 * NEVER username/password. Zero rows for guests or when no session is stored.
 */
export async function fetchMarketplaceSession(
  marketplace: string,
  timeoutMs: number = MARKETPLACE_SESSION_TIMEOUT_MS
): Promise<MarketplaceSessionResult> {
  const cached = sessionCache.get(marketplace) ?? null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const call = supabase.rpc("get_marketplace_session", {
      p_marketplace: marketplace,
    });
    // Mirrors src/api/translate.ts: supabase-js cannot be handed an
    // AbortSignal, so the deadline is a raced sentinel. The request keeps
    // running in the background and its late answer is simply ignored.
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const raced = await Promise.race([call, timeout]);
    if (raced === "timeout") {
      const message = `timed out after ${timeoutMs}ms`;
      console.warn(`[session] get_marketplace_session ${message} (${marketplace})`);
      return { session: cached, failed: true, stale: cached !== null, error: message };
    }
    const { data, error } = raced as { data?: unknown; error?: any };
    if (error) {
      console.warn(`[session] get_marketplace_session failed (${marketplace}):`, error?.message ?? error);
      return { session: cached, failed: true, stale: cached !== null, error: String(error?.message ?? "RPC failed") };
    }
    if (!Array.isArray(data) || data.length === 0) {
      sessionCache.delete(marketplace);
      return { session: null, failed: false, stale: false };
    }
    type Row = {
      marketplace?: string;
      cookies?: string;
      cookies_updated_at?: string | null;
      health?: string | null;
    };
    const rows = data as Row[];
    // Prefer a row for the exact marketplace, most-recently-refreshed first.
    const row =
      rows
        .filter((r) => (r.marketplace ?? "") === marketplace)
        .sort((a, b) =>
          String(b.cookies_updated_at ?? "").localeCompare(
            String(a.cookies_updated_at ?? "")
          )
        )[0] ?? rows[0];
    if (!row?.cookies) {
      sessionCache.delete(marketplace);
      return { session: null, failed: false, stale: false };
    }
    const session: MarketplaceSession = {
      cookies: row.cookies,
      cookiesUpdatedAt: row.cookies_updated_at ?? null,
      health: row.health ?? null,
    };
    sessionCache.set(marketplace, session);
    return { session, failed: false, stale: false };
  } catch (e: any) {
    console.warn(`[session] get_marketplace_session threw (${marketplace}):`, e?.message ?? e);
    return { session: cached, failed: true, stale: cached !== null, error: String(e?.message ?? "Network error") };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The last session read for this marketplace in THIS app run, or null.
 *
 * Synchronous on purpose: a WebView screen needs its
 * `injectedJavaScriptBeforeContentLoaded` value at first render, and the only
 * thing that beats a network round trip is not waiting for one. Freshness is
 * still the network's job — the read that follows always overwrites this.
 * Memory only: nothing here is written to AsyncStorage or disk.
 */
export function peekMarketplaceSession(
  marketplace: string
): MarketplaceSession | null {
  return sessionCache.get(marketplace) ?? null;
}

/**
 * Push the WebView's current cookies up to the shared session store
 * (edge function `marketplace-session-sync`, staff/super_admin only).
 * Resolves { ok } — never throws.
 */
export async function syncMarketplaceSession(
  marketplace: string,
  cookies: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke(
      "marketplace-session-sync",
      { body: { marketplace, cookies } }
    );
    if (error) return { ok: false, error: error.message };
    const res = data as { ok?: boolean; error?: string } | null;
    if (res?.ok) return { ok: true };
    return { ok: false, error: res?.error ?? "Sync was refused" };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Network error" };
  }
}

/**
 * Generate a JavaScript string that sets cookies on the current document.
 * Pass the raw `cookies` string from marketplace_accounts (format: "name=val; name2=val2").
 */
export function cookieInjectScript(cookies: string): string {
  if (!cookies) return "";
  const pairs = cookies
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);
  const js = pairs
    .map((c) => `document.cookie=${JSON.stringify(c)};`)
    .join("");
  return `(function(){${js}})();true;`;
}
