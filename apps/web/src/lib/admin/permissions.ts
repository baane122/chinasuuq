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
// CACHING
// The map is keyed by the signed-in user id and holds the in-flight promise, so
// N components calling useAdminPermissions() on mount share ONE round of reads
// instead of N. Call invalidatePermissions() after a role change.

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
  /** true when the permission tables returned at least one grant for someone.
   *  When false, permissions are "not configured" and we fail open. */
  configured: boolean;
  /** Set of "resource:action" strings granted to this user's roles. */
  grants: Set<string>;
  loading: boolean;
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
  grants: new Set(),
  loading: true,
  error: null,
};

const cache = new Map<string, Promise<AdminPermissions>>();

/** Resolve the caller's effective permission set. Cached per user id. */
export function loadAdminPermissions(refresh = false): Promise<AdminPermissions> {
  return (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id ?? "anon";
    if (!refresh) {
      const hit = cache.get(uid);
      if (hit) return hit;
    }
    const p = (async (): Promise<AdminPermissions> => {
      try {
        if (!uid || uid === "anon") return { ...EMPTY, loading: false };

        // 1. Role (profiles.role is the coarse gate; super_admin bypasses all).
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .maybeSingle();
        const role = String(profile?.role ?? "");
        const isSuperAdmin = role === "super_admin";

        // 2. Is the permission model populated AT ALL? A single permissions row
        //    means someone wired the tables; zero means "not configured".
        const { count: permCount } = await supabase
          .from("permissions")
          .select("id", { count: "exact", head: true });
        const configured = (permCount ?? 0) > 0;

        // Super admins are allowed everything and need no grants walk.
        if (isSuperAdmin) {
          return { role, isSuperAdmin, configured, grants: new Set(), loading: false, error: null };
        }

        // 3. staff_profiles for this auth user. staff_profiles.role is the
        //    granular 18-value staff_role enum (super_admin,
        //    operations_director, finance_verifier, …).
        const { data: staffRows } = await supabase
          .from("staff_profiles")
          .select("role, is_super_admin")
          .eq("user_id", uid);
        const rows = (staffRows ?? []) as Array<{ role?: unknown; is_super_admin?: boolean }>;
        const superProfile = rows.some(
          (s) => s.is_super_admin === true || String(s.role ?? "") === "super_admin"
        );
        if (superProfile) {
          return { role: "super_admin", isSuperAdmin: true, configured, grants: new Set(), loading: false, error: null };
        }
        const staffRole = String(rows[0]?.role ?? "");

        // 4. Grants: live permissions is a flat (role staff_role, permission
        //    permission_type) table — one query, no join tables.
        const grants = new Set<string>();
        if (staffRole) {
          const { data: perms } = await supabase
            .from("permissions")
            .select("permission")
            .eq("role", staffRole);
          for (const p of (perms ?? []) as Array<{ permission?: unknown }>) {
            if (p.permission) grants.add(String(p.permission));
          }
        }

        const result: AdminPermissions = { role: staffRole || role, isSuperAdmin: false, configured, grants, loading: false, error: null };
        cache.set(uid, Promise.resolve(result));
        return result;
      } catch (e) {
        return { ...EMPTY, loading: false, error: e instanceof Error ? e.message : "permission load failed" };
      }
    })();
    cache.set(uid, p);
    return p;
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
  // Coarse server RLS + graceful fallback: super_admin always allowed; when
  // the permissions table is empty we fail open (a banner tells the operator
  // to seed grants). Otherwise the grant must exist for the staff_role.
  if (perm.isSuperAdmin) return true;
  if (!perm.configured) return true;
  return perm.grants.has(permissionLabel);
}

/** React hook: the cached permission set for the signed-in admin. */
export function useAdminPermissions(): AdminPermissions {
  const [state, setState] = useState<AdminPermissions>(EMPTY);
  useEffect(() => {
    let alive = true;
    loadAdminPermissions().then((p) => {
      if (alive) setState(p);
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
