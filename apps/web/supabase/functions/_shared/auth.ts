// Shared caller verification for ChinaSuuq Edge Functions.
//
// SECURITY MODEL: Edge Functions hold SUPABASE_SERVICE_ROLE_KEY, which
// bypasses all RLS. Every function that touches privileged data MUST verify
// the caller's JWT and profile role BEFORE doing any privileged work.
// Anonymous callers must never be able to invoke a service-role code path.
import { createClient } from "jsr:@supabase/supabase-js@2";

export interface Caller {
  userId: string;
  role: string;
}

function bearerToken(req: Request): string {
  const h = req.headers.get("Authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

// Supabase client bound to the caller's JWT (RLS applies). Returns null when
// no bearer token is present.
export function userClient(req: Request) {
  const token = bearerToken(req);
  if (!token) return null;
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// Verifies the caller's JWT and that their profiles.role is in `allowed`.
// Returns caller info, or null when anonymous / invalid token / wrong role.
export async function requireRole(req: Request, allowed: string[]): Promise<Caller | null> {
  const client = userClient(req);
  if (!client) return null;
  const token = bearerToken(req);

  const { data: userData, error: userErr } = await client.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: profile, error: profErr } = await client
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profErr || !profile) return null;

  const role = String(profile.role ?? "");
  if (!allowed.includes(role)) return null;
  return { userId: userData.user.id, role };
}

// Admin-only shorthand.
export async function requireAdmin(req: Request): Promise<Caller | null> {
  return requireRole(req, ["admin", "super_admin"]);
}

// Staff-or-admin shorthand (internal operations data).
export async function requireStaffOrAdmin(req: Request): Promise<Caller | null> {
  return requireRole(req, ["staff", "admin", "super_admin"]);
}

// Uniform 401 response for unauthenticated / unauthorized callers.
export function unauthorized(message = "unauthorized"): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
