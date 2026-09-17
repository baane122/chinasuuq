import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// Get Supabase config from Expo Constants (loaded from app.json/app.config.js)
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || "https://athkmrvsaijwgsyvwrbp.supabase.co";
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0aGttcnZzYWlqd2dzeXZ3cmJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NjM4NDQsImV4cCI6MjEwMTIzOTg0NH0.QAT0gZBJl-ELFG8221MRZoZoTj0La9_TOXFXx-HiKbY";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing Supabase configuration. Check app.json extra.supabaseUrl and extra.supabaseAnonKey");
}

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

// ---- Marketplace account helpers ----
// Used by the WebView to auto-inject shared login cookies for
// Taobao / YiwuGo / other login-walled marketplaces.

export interface MarketplaceAccount {
  id: string;
  marketplace: string;
  username: string;
  password: string;
  cookies?: string;
  is_active: boolean;
  last_refreshed_at?: string;
}

/**
 * Fetch the active shared account for a marketplace.
 * Returns null if none found or backend is unreachable.
 */
export async function getMarketplaceAccount(
  marketplace: string
): Promise<MarketplaceAccount | null> {
  try {
    const { data, error } = await supabase
      .from("marketplace_accounts")
      .select("id, marketplace, username, password, cookies, is_active, last_refreshed_at")
      .eq("marketplace", marketplace)
      .eq("is_active", true)
      .maybeSingle();
    if (error || !data) return null;
    return data as MarketplaceAccount;
  } catch {
    return null;
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
