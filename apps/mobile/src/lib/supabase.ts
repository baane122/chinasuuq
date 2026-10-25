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
    // AsyncStorage, not SecureStore: a Supabase session JSON regularly exceeds
    // SecureStore's ~2 KB per-item limit, and a silently-truncated write means
    // every protected screen mass-logs-out on the next cold start.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // RN has no URL to detect from; leaving this true only hid the real bug by
    // making us believe the SDK was consuming the emailed link itself.
    detectSessionInUrl: false,
    // GoTrue v2 email links carry ?code= and must be exchanged with PKCE.
    flowType: "pkce",
  },
  // Increase timeout for network resilience
  global: {
    headers: { "x-timeout": "30000" }, // 30 second timeout
  },
});

// The pure URL parsing lives in ./auth-url.ts so it can be exercised in Node
// without constructing this client (see scripts/verify-auth-url.mjs). Re-exported
// here because every caller already reaches for it through this module.
import {
  APP_DEEP_LINK_PREFIX,
  VERIFY_REDIRECT,
  RECOVERY_REDIRECT,
  parseAuthUrl,
  type AuthRedirectKind,
  type AuthUrlTicket,
} from "./auth-url";

export { APP_DEEP_LINK_PREFIX, VERIFY_REDIRECT, RECOVERY_REDIRECT, parseAuthUrl };
export type { AuthRedirectKind, AuthUrlTicket };

export interface ConsumeAuthUrlResult {
  /** True when a live session now exists. */
  ok: boolean;
  kind: AuthRedirectKind;
  /** False when the URL was not an auth link — caller should route it normally. */
  wasAuthUrl: boolean;
  /** Human-readable, already suitable for showing to a customer. */
  error?: string;
}

/**
 * Turn an emailed deep link into a signed-in session.
 *
 * Failure here is the single most expensive one in the app: the customer has
 * already left the app, opened their mail, tapped a link, and come back. If we
 * cannot consume the link they are stranded between two screens with no idea
 * why, so every branch returns a message written for that person rather than a
 * stack trace.
 */
export async function consumeAuthUrl(rawUrl: string): Promise<ConsumeAuthUrlResult> {
  const ticket = parseAuthUrl(rawUrl);
  if (!ticket) {
    return { ok: false, kind: "unknown", wasAuthUrl: false };
  }
  if (ticket.error) {
    return {
      ok: false,
      kind: ticket.kind,
      wasAuthUrl: true,
      error: "That link no longer works. It may already have been used.",
    };
  }
  try {
    if (ticket.code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(ticket.code);
      if (error) {
        console.warn("[auth] exchangeCodeForSession failed:", error.code ?? "-", error.message);
        return {
          ok: false,
          kind: ticket.kind,
          wasAuthUrl: true,
          error:
            "We could not complete the sign-in from that link. Please open the link on this phone, or request a new one.",
        };
      }
      return { ok: !!data.session, kind: ticket.kind, wasAuthUrl: true };
    }
    if (ticket.accessToken && ticket.refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: ticket.accessToken,
        refresh_token: ticket.refreshToken,
      });
      if (error) {
        console.warn("[auth] legacy setSession failed:", error.message);
        return {
          ok: false,
          kind: ticket.kind,
          wasAuthUrl: true,
          error: "That sign-in link has expired. Please request a new one.",
        };
      }
      return { ok: !!data.session, kind: ticket.kind, wasAuthUrl: true };
    }
    return {
      ok: false,
      kind: ticket.kind,
      wasAuthUrl: true,
      error: "That link is missing its sign-in details. Please request a new one.",
    };
  } catch (e: any) {
    console.warn("[auth] consumeAuthUrl threw:", e?.message ?? e);
    return {
      ok: false,
      kind: ticket.kind,
      wasAuthUrl: true,
      error: "Connection problem while completing sign-in. Please try again.",
    };
  }
}

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
