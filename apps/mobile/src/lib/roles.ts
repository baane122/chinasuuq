/**
 * The one place mobile names what counts as a staff account.
 *
 * This MUST stay identical to the server's `public.is_staff_or_admin()`
 * (apps/web/supabase/migrations/202610040003_rls_lockdown.sql), which is the
 * predicate every `*_admin_all` RLS policy uses. It matched on
 * `profiles.role IN ('staff','super_admin','admin')` while the app gated its
 * staff UI on only the first two — so an `admin` login could read the staff
 * tables and see an empty customer app, and staff features looked "broken"
 * for that account while working for everyone else.
 *
 * Note the coarse `profiles.role` is NOT the granular RBAC taxonomy
 * (`sourcing_agent`, `finance_manager`, …) that lives in the staff-members /
 * permissions tables; those are matched per-permission on Mission Control,
 * never here.
 */
export const STAFF_PROFILE_ROLES = ["staff", "super_admin", "admin"] as const;
export const SUPER_ADMIN_PROFILE_ROLES = ["super_admin"] as const;

export type StaffProfileRole = (typeof STAFF_PROFILE_ROLES)[number];

/** Mirrors is_staff_or_admin(): staff, super_admin and legacy admin. */
export function isStaffRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (STAFF_PROFILE_ROLES as readonly string[]).includes(role);
}

/** Mirrors is_super_admin(): destructive/admin-management surfaces only. */
export function isSuperAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (SUPER_ADMIN_PROFILE_ROLES as readonly string[]).includes(role);
}

/**
 * A role that must never be shown staff chrome, even if a stray JWT claim or a
 * stale cache says otherwise. Customers, suppliers and anon are explicit so a
 * future role added to the enum fails closed here instead of inheriting access.
 */
export const NON_STAFF_PROFILE_ROLES = ["customer", "supplier", "anonymous", "anon", "guest"] as const;

export function isKnownNonStaffRole(role: string | null | undefined): boolean {
  if (!role) return true;
  return (NON_STAFF_PROFILE_ROLES as readonly string[]).includes(role) || !isStaffRole(role);
}
