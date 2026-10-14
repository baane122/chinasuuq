// Shared caller verification for ChinaSuuq Edge Functions.
//
// SECURITY MODEL: Edge Functions hold SUPABASE_SERVICE_ROLE_KEY, which
// bypasses all RLS. Every function that touches privileged data MUST verify
// the caller's JWT and profile role BEFORE doing any privileged work.
// Anonymous callers must never be able to invoke a service-role code path.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

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
//
// WHY THE CLASSIFICATION EXISTS (audit 2026-10-14): every failure used to return
// the same opaque null, so the caller emitted 401 "unauthorized" for four very
// different situations — a real non-staff account, an expired token, a Supabase
// auth hiccup, and a profile row that RLS refused to show. In the field all four
// look identical: a staff member's tools stop working and nothing explains why
// (function_edge_logs recorded only "401"). Infra failures are now 503 so the
// client can retry, denials stay 401, and each step logs the reason.
export type GateFailure =
  | "no_token"
  | "invalid_token"
  | "auth_unavailable"
  | "no_profile"
  | "profile_unreadable"
  | "role_not_allowed";

export interface GateResult {
  caller: Caller | null;
  failure?: GateFailure;
  /** The profile's actual role when failure is "role_not_allowed". */
  role?: string;
  /** Raw database/auth error text — logged server-side, never sent to callers. */
  detail?: string;
}

export async function roleGate(req: Request, allowed: string[]): Promise<GateResult> {
  const client = userClient(req);
  if (!client) return { caller: null, failure: "no_token" };
  const token = bearerToken(req);

  const { data: userData, error: userErr } = await client.auth.getUser(token);
  if (userErr || !userData?.user) {
    // A transport/auth-service error is not "this user is unknown": telling the
    // app 401 makes it drop a perfectly good session. Only classify as infra
    // when the evidence is a network/5xx shape — otherwise a permanent auth
    // problem (revoked token, mismatched audience) would report as retryable
    // and the client would park on it forever.
    const errShape = userErr as unknown as { status?: unknown; code?: string; name?: string };
    const status = Number(errShape?.status ?? 0);
    const networkish = /fetch|network|socket|timeout|ECONN|ETIMEDOUT|ENOTFOUND/i.test(
      `${userErr?.message ?? ""} ${errShape?.code ?? ""} ${errShape?.name ?? ""}`
    );
    const infra = userErr != null && (status >= 500 || networkish);
    return {
      caller: null,
      failure: infra ? "auth_unavailable" : "invalid_token",
      detail: userErr?.message ?? "no user returned",
    };
  }

  const { data: profile, error: profErr } = await client
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profErr || !profile) {
    // PGRST116 = "0 rows" (no profile — the signup upsert never landed).
    // Anything else is a read failure the user cannot act on.
    const code = String(profErr?.code ?? "");
    return {
      caller: null,
      failure: profErr && code !== "PGRST116" ? "profile_unreadable" : "no_profile",
      detail: profErr?.message ?? "profile row missing",
    };
  }

  const role = String(profile.role ?? "");
  if (!allowed.includes(role)) {
    console.warn(`[auth] gate denied failure=role_not_allowed role=${role || "(empty)"} allowed=${allowed.join("|")}`);
    return { caller: null, failure: "role_not_allowed", role };
  }
  return { caller: { userId: userData.user.id, role } };
}

export async function requireRole(req: Request, allowed: string[]): Promise<Caller | null> {
  return (await roleGate(req, allowed)).caller;
}

/**
 * The gate plus the caller-facing response for each outcome. Use it at the top
 * of a function: `const gate = await staffGate(req); if (!gate.caller) return deny(gate);`
 * Transient infrastructure problems answer 503 (retryable, session kept);
 * genuine denials answer 401 with a stable code.
 */
export async function staffGate(req: Request): Promise<GateResult> {
  return roleGate(req, ["staff", "admin", "super_admin"]);
}

/** Log line + response for a failed gate. Never echoes DB/auth error text. */
export function deny(gate: GateResult, fn = "edge"): Response {
  const failure = gate.failure ?? "unauthorized";
  console.warn(
    `[${fn}] gate denied failure=${failure}` + (gate.role ? ` role=${gate.role}` : "") + ` detail=${gate.detail ?? "-"}`
  );
  const transient = failure === "auth_unavailable" || failure === "profile_unreadable";
  if (transient) return serviceUnavailable(failure);
  return unauthorized(failure);
}

/** Retryable: the caller's session is fine, our dependency was not. */
export function serviceUnavailable(message = "service_unavailable"): Response {
  return new Response(JSON.stringify({ ok: false, error: message, retryable: true }), {
    status: 503,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Super-admin-only shorthand. The LIVE user_role enum (after migration
// 202609210001) is (customer, staff, super_admin) — the old "admin" label does
// not exist, so the previous ["admin", "super_admin"] list could only ever
// match one real role and was a dead-list trap (same 401 class of bug as
// ai-settings' history). List exactly the live enum here.
// NOTE: no current edge function calls requireAdmin — ai-settings moved its
// writes to requireRole(req, ["super_admin"]) directly. Keep this in sync with
// that list if a caller returns.
export async function requireAdmin(req: Request): Promise<Caller | null> {
  return requireRole(req, ["super_admin"]);
}

// Staff-or-admin shorthand (internal operations data).
export async function requireStaffOrAdmin(req: Request): Promise<Caller | null> {
  return requireRole(req, ["staff", "admin", "super_admin"]);
}

// Uniform 401 response for unauthenticated / unauthorized callers.
// Carries the CORS headers (audit §3 LOW): without them a browser client sees an
// opaque "Failed to fetch" instead of the 401 body, and the real auth error is
// undiagnosable from the console.
export function unauthorized(message = "unauthorized"): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
