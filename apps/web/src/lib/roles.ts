/**
 * The canonical "is this a staff account?" rule for the web app.
 *
 * Mirrors `public.is_staff_or_admin()` in
 * supabase/migrations/202610040003_rls_lockdown.sql, which is the predicate
 * behind every `*_admin_all` RLS policy — and its mobile twin
 * apps/mobile/src/lib/roles.ts. The three must stay in sync: the gate that
 * used to live inline in the admin layout only accepted `staff` /
 * `super_admin`, so a legacy `admin` profile passed the database policies but
 * was signed straight back out of /admin, which reads as "Mission Control
 * locks me out" rather than a role-config problem.
 *
 * The Supabase ENUM in production is the coarse `user_role`
 * (customer / staff / super_admin / legacy admin) — NOT the granular RBAC
 * taxonomy in @chinasuuq/shared (sourcing_agent, finance_manager, …), which
 * lives in the staff-members/permissions tables and is checked per-permission.
 *
 * If a migration ever widens the server helper, widen this list too.
 */
export const STAFF_PROFILE_ROLES = ["staff", "super_admin", "admin"] as const;

export function isStaffRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (STAFF_PROFILE_ROLES as readonly string[]).includes(role);
}

export function isSuperAdminRole(role: string | null | undefined): boolean {
  return role === "super_admin";
}

/**
 * Is this error a transport failure rather than a Postgres/RLS answer?
 * Used by the admin gate so a flaky connection cannot be mistaken for
 * "this user is not staff" and sign a legitimate staff member out.
 */
export function isNetworkError(error: unknown): boolean {
  const msg = String(
    (error as any)?.message ?? (error as any)?.code ?? error ?? ""
  ).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("abort") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused") ||
    msg.includes("service unreachable")
  );
}
