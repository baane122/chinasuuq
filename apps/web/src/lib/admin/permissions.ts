// Fine-grained RBAC loader for Mission Control UI.
//
// WHY THIS EXISTS
// The LIVE database (probed via information_schema on 2026-10-03) models
// access with a single `permissions` table of (role staff_role, permission
// permission_type) rows. staff_profiles.role is the granular 18-value
// staff_role enum (super_admin, operations_director, finance_verifier, …) —
// the same enum permissions.role uses, which is what the roles/permissions
// editor page displays. NOTE: the repo migrations' staff_roles /
// role_permissions tables DO NOT exist live; never query them. No screen used
// to consult any of this — any staff member could open Payments, edit AI keys
// and delete other staff. This module reads the live model so the UI can gate
// the destructive sections.
//
// SCOPE / HONESTY
// Server-side RLS on the base tables stays COARSE: it admits every
// staff/super_admin profile (auth.is_staff_or_admin()). These checks are a UI
// affordance layered on top, not a security boundary — a determined staff user
// with a valid JWT can still call PostgREST directly. Tightening a given
// resource in the database requires a real per-permission policy (backend
// work), which is deliberately out of this client's scope.
//
// FAILED READ != EMPTY DATA
// This loader used to destructure `{ data }` / `{ count }` and ignore `error`,
// so a dropped network call or a rejected read left `permCount` null. Null read
// as "zero grants", which read as "permissions not configured", which failed
// OPEN: every signed-in staff member got AI-key editing and payment
// verification while the console showed an empty table and said nothing about
// the failure. Every read below now checks `error`, the outcome is carried on
// the result as `checksFailed` + `error`, and can() refuses to guess: an
// unknown permission set is a DENY. The documented fail-open path is kept for
// the one case that earned it — the permissions table genuinely empty (count 0,
// NO error), which still shows the "seed the grants" banner. "Nothing is
// configured" and "we could not check" are different states and now look
// different on screen.
//
// CACHING
// The map is keyed by the signed-in user id and holds the in-flight promise, so
// N components calling useAdminPermissions() on mount share ONE round of reads
// instead of N. Only a result whose reads ALL answered is retained: a failed
// check is dropped from the cache so the next mount (or perms.reload()) retries
// instead of inheriting a lockout from one bad request. Call
// invalidatePermissions() after a role change.

import { useEffect, useState } from "react";
import { supabase } from "../supabase";

export interface PermissionDecision {
  /** Which destructive section to test, e.g. "ai_keys", "delete_staff". */
  resource: string;
  action: string;
}

export interface AdminPermissions {
  /** Role from profiles (staff | super_admin | customer | …). */
  role: string;
  isSuperAdmin: boolean;
  /** true when the permissions table returned at least one grant for someone.
   *  When false AND the reads answered, permissions are "not configured" and we
   *  fail open with a banner. Never trust this alone — see `checksFailed`. */
  configured: boolean;
  /** true when one of the reads this decision depends on FAILED (network,
   *  rejected read, unusable payload). `can()` denies while it is set, so a
   *  failed check can never be mistaken for "allowed" or for "no grants". */
  checksFailed: boolean;
  /** Set of "resource:action" strings granted to this user's roles. */
  grants: Set<string>;
  loading: boolean;
  /** Why the check failed (first failure wins; all of them are joined). */
  error: string | null;
}

/** Destructive-section keys the admin UI gates on. Values are LIVE
 *  permission_type enum labels (see public.permissions): "manage_roles"
 *  unlocks admin-config sections (AI provider keys, deleting staff);
 *  "verify_payment" unlocks payment confirmation. */
export const PERMISSIONS = {
  aiKeys: { resource: "admin_config", action: "manage_roles" },
  deleteStaff: { resource: "admin_config", action: "manage_roles" },
  confirmPayments: { resource: "payments", action: "verify_payment" },
} as const satisfies Record<string, PermissionDecision>;

const EMPTY: AdminPermissions = {
  role: "unknown",
  isSuperAdmin: false,
  configured: false,
  checksFailed: false,
  grants: new Set(),
  loading: true,
  error: null,
};

const cache = new Map<string, Promise<AdminPermissions>>();
/** Reads in flight right now — shared between mounts, but never retained after
 *  they resolve as failed. */
const inflight = new Map<string, Promise<AdminPermissions>>();

/** One read's honest outcome: which step failed, and whether the permission
 *  model can be called configured. `null` payload with NO error is also a
 *  failure for a list/count — PostgREST answers `[]`/`0` for "nothing matched",
 *  so a missing body is a response we cannot read, not an empty table. */
function readProblem(step: string, error: { message?: string } | null, unusable: boolean): string | null {
  if (error) return `${step}: ${error.message || "request failed"}`;
  if (unusable) return `${step}: the server returned no usable rows`;
  return null;
}

async function readPermissions(uid: string): Promise<AdminPermissions> {
  const failures: string[] = [];
  const fail = (step: string, error: { message?: string } | null, unusable: boolean) => {
    const problem = readProblem(step, error, unusable);
    if (problem) failures.push(problem);
  };

  try {
    if (!uid || uid === "anon") return { ...EMPTY, loading: false };

    // 1. Role (profiles.role is the coarse gate; super_admin bypasses all).
    //    A missing profile row is real data (no profile), not a failed read —
    //    maybeSingle() answered without error.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", uid)
      .maybeSingle();
    fail("role lookup", profileError, false);
    const role = String(profile?.role ?? "");
    const isSuperAdmin = role === "super_admin";

    // 2. Is the permission model populated AT ALL? A single permissions row
    //    means someone wired the tables; zero means "not configured".
    const { count: permCount, error: permCountError } = await supabase
      .from("permissions")
      .select("id", { count: "exact", head: true });
    fail("permission count", permCountError, permCount === null);
    const configured = (permCount ?? 0) > 0;

    // Super admins are allowed everything and need no grants walk, so a grant
    // read that failed below does not take their access away.
    if (isSuperAdmin) {
      return finish({ role, isSuperAdmin, configured, grants: new Set(), failures });
    }

    // 3. staff_profiles for this auth user. staff_profiles.role is the
    //    granular 18-value staff_role enum (super_admin,
    //    operations_director, finance_verifier, …).
    const { data: staffRows, error: staffError } = await supabase
      .from("staff_profiles")
      .select("role, is_super_admin")
      .eq("user_id", uid);
    fail("staff role lookup", staffError, staffRows === null);
    const rows = (staffRows ?? []) as Array<{ role?: unknown; is_super_admin?: boolean }>;
    const superProfile = rows.some(
      (s) => s.is_super_admin === true || String(s.role ?? "") === "super_admin"
    );
    if (superProfile) {
      return finish({ role: "super_admin", isSuperAdmin: true, configured, grants: new Set(), failures });
    }
    const staffRole = String(rows[0]?.role ?? "");

    // 4. Grants: live permissions is a flat (role staff_role, permission
    //    permission_type) table — one query, no join tables.
    const grants = new Set<string>();
    if (staffRole) {
      const { data: perms, error: permsError } = await supabase
        .from("permissions")
        .select("permission")
        .eq("role", staffRole);
      fail("grants lookup", permsError, perms === null);
      for (const p of (perms ?? []) as Array<{ permission?: unknown }>) {
        if (p.permission) grants.add(String(p.permission));
      }
    }

    return finish({ role: staffRole || role, isSuperAdmin: false, configured, grants, failures });
  } catch (e) {
    // A throw is a failed read too — never the silent empty table it used to
    // imitate.
    failures.push(e instanceof Error ? e.message : "permission load failed");
    return { ...EMPTY, loading: false, checksFailed: true, error: failures.join("; ") };
  }
}

/** Assemble the decision, marking it untrustworthy when any read failed. */
function finish({
  role,
  isSuperAdmin,
  configured,
  grants,
  failures,
}: {
  role: string;
  isSuperAdmin: boolean;
  configured: boolean;
  grants: Set<string>;
  failures: string[];
}): AdminPermissions {
  return {
    role,
    isSuperAdmin,
    configured,
    checksFailed: failures.length > 0,
    grants,
    loading: false,
    error: failures.join("; ") || null,
  };
}

/** Resolve the caller's effective permission set. Cached per user id. */
export function loadAdminPermissions(refresh = false): Promise<AdminPermissions> {
  return (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id ?? "anon";
    if (!refresh) {
      const hit = cache.get(uid) ?? inflight.get(uid);
      if (hit) return hit;
    }
    const p = readPermissions(uid);
    inflight.set(uid, p);
    try {
      const result = await p;
      // Keep only a complete answer; a failed check must not be the answer this
      // user id gets for the rest of the session.
      if (!result.checksFailed) cache.set(uid, Promise.resolve(result));
      return result;
    } finally {
      if (inflight.get(uid) === p) inflight.delete(uid);
    }
  })();
}

export function invalidatePermissions() {
  cache.clear();
}

/** The allow/deny decision for one gated section. */
export function allowed(perm: AdminPermissions, key: keyof typeof PERMISSIONS): boolean {
  const { action } = PERMISSIONS[key];
  return can(perm, action);
}

export function can(perm: AdminPermissions, permissionLabel: string): boolean {
  // super_admin is allowed by the role read that answered, so it is not a guess.
  if (perm.isSuperAdmin) return true;
  // A failed read is NOT "no grants" and NOT "not configured": we do not know,
  // so the destructive section stays closed until the check can be made.
  if (perm.checksFailed) return false;
  // Genuinely unconfigured (permissions table empty, reads answered cleanly):
  // documented fail-open, with the banner that tells the operator to seed
  // grants. See 202610040004_permissions_readable_by_staff.sql for how "empty"
  // got conflated with "denied" before the grants became staff-readable.
  if (!perm.configured) return true;
  return perm.grants.has(permissionLabel);
}

/** Why a gated control is unavailable *because the check failed*, in the same
 *  words on every screen that gates a section — so staff read "a failed check",
 *  not "your role lacks the grant". Null when there is nothing to explain. */
export function permissionCheckFailureNotice(perm: AdminPermissions): string | null {
  if (perm.loading || !perm.checksFailed) return null;
  return (
    `The permission check could not be completed (${perm.error ?? "no response from the server"}), ` +
    `so this section stays unavailable until it can be verified — that is a failed check, not a ` +
    `missing grant. Check again, or sign out and back in if your session has expired.`
  );
}

/** React hook: the cached permission set for the signed-in admin, plus a way to
 *  re-run the reads without dropping the page (a failed check is retryable —
 *  screens use it for their "Check again" button). */
export function useAdminPermissions(): AdminPermissions & { reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AdminPermissions>(EMPTY);
  useEffect(() => {
    let alive = true;
    // attempt > 0 means the operator asked for a fresh read: bypass the cache,
    // which deliberately never held a failed answer.
    loadAdminPermissions(attempt > 0).then((p) => {
      if (alive) setState(p);
    });
    return () => {
      alive = false;
    };
  }, [attempt]);
  return { ...state, reload: () => setAttempt((n) => n + 1) };
}
