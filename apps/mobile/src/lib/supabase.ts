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

/**
 * Fetch the ACTIVE SHARED SESSION (cookies only) for a marketplace.
 *
 * Session-cookie model: the SECURITY DEFINER RPC `get_marketplace_session`
 * returns rows of { marketplace, cookies, cookies_updated_at, health } and
 * NEVER username/password. Zero rows for guests or when no session is stored.
 * Returns null on any failure so the WebView simply shows the public site.
 */
export interface MarketplaceSession {
  cookies: string;
  cookiesUpdatedAt: string | null;
  health: string | null;
}

export async function getMarketplaceSession(
  marketplace: string
): Promise<MarketplaceSession | null> {
  try {
    const { data, error } = await supabase.rpc("get_marketplace_session", {
      p_marketplace: marketplace,
    });
    if (error || !Array.isArray(data) || data.length === 0) return null;
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
    if (!row?.cookies) return null;
    return {
      cookies: row.cookies,
      cookiesUpdatedAt: row.cookies_updated_at ?? null,
      health: row.health ?? null,
    };
  } catch {
    return null;
  }
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
