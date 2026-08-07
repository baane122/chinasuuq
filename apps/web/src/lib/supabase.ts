import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://athkmrvsaijwgsyvwrbp.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0aGttcnZzYWlqd2dzeXZ3cmJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NjM4NDQsImV4cCI6MjEwMTIzOTg0NH0.QAT0gZBJl-ELFG8221MRZoZoTj0La9_TOXFXx-HiKbY";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// For admin operations requiring service role
export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
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
