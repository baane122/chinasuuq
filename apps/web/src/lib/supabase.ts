import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
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

// ── Edge Function helper (browser → Supabase Edge Functions) ──────────────
// SECURITY: this is the ONLY sanctioned way to call Edge Functions from the
// web app. It attaches the anon `apikey` plus the signed-in user's JWT so
// functions can verify the caller's identity/role server-side. Never fetch
// `/api/...` relative paths — the site is a static export and has no server.
//
// SECURITY NOTE: there is deliberately NO service-role client here. This
// module is imported by client components; a service-role key in a browser
// bundle would hand full database control to every visitor. Privileged
// operations belong in Edge Functions, which hold SUPABASE_SERVICE_ROLE_KEY
// server-side and verify the caller's JWT + admin role before acting.
export async function edgeFetch<T = Record<string, unknown>>(
  functionName: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {}
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const url = supabaseUrl as string;
  const anon = supabaseAnonKey as string;
  const token = session?.access_token ?? anon;

  const res = await fetch(`${url}/functions/v1/${functionName}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${token}`,
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  let payload: T;
  try {
    payload = (await res.json()) as T;
  } catch {
    // Non-JSON response (e.g. gateway HTML error page)
    throw new Error(`${functionName} returned a non-JSON response (${res.status})`);
  }
  return payload;
}
