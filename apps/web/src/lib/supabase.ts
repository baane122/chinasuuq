import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // Increase timeout for network resilience
  global: {
    headers: { "x-timeout": "30000" }, // 30 second timeout
  },
});

// For admin operations requiring service role
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceRoleKey) {
  console.warn("Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Admin operations may fail.");
}

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey || supabaseAnonKey,
  { 
    auth: { 
      autoRefreshToken: false, 
      persistSession: false 
    },
    global: {
      headers: { "x-timeout": "30000" },
    },
  }
);

// Server-side helper with cookies
export function createServerClient(cookies: { get: (name: string) => { value: string } | undefined }) {
  const { createServerClient: createSSRClient } = require("@supabase/ssr");
  return createSSRClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          // Server action cookie setting
        },
        remove(name: string, options: Record<string, unknown>) {
          // Server action cookie removal
        },
      },
    }
  );
}
