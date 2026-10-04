-- 202610040004_permissions_readable_by_staff.sql
-- Why: Mission Control shows "Permissions not configured — the role/permission
-- tables are empty" on Payments, Staff & Roles and the AI-settings tab.
-- That is not true: public.permissions holds 90 seeded (staff_role,
-- permission_type) grants. The table has ROW LEVEL SECURITY enabled and ZERO
-- policies, so every non-BYPASSRLS role (anon, authenticated) reads 0 rows.
-- The UI loader (apps/web/src/lib/admin/permissions.ts) therefore always sees
-- count = 0 and fails OPEN — the fine-grained gating never engages for anyone.
--
-- Fix: expose the grant table read-only to staff/super_admin so the UI can make
-- a real decision. No INSERT/UPDATE/DELETE policy is added — seeding stays a
-- service-role/SQL operation, which is exactly what the banner asks for.
--
-- Scope note: this is a UI affordance layer. Server RLS on the business tables
-- stays coarse (is_staff_or_admin()). With the seed now visible, the UI flips
-- from "fail open" to honouring the grant table:
--   * super_admin  -> still allowed everything (loader bypass)
--   * verify_payment -> finance_manager, finance_verifier, operations_director,
--     somalia_branch_manager, super_admin
--   * manage_roles (AI keys, deleting staff) is NOT in the seed at all, so only
--     super_admin passes — matching the ai-settings edge function, which already
--   * restricts writes to super_admin.
-- The only staff_profiles row live today is role = super_admin, so no current
-- operator loses access when this lands.

-- Idempotent.
DROP POLICY IF EXISTS permissions_staff_read ON public.permissions;

CREATE POLICY permissions_staff_read ON public.permissions
  FOR SELECT TO authenticated
  USING (public.is_staff_or_admin());

-- Keep the API gateway's cached plan fresh.
NOTIFY pgrst, 'reload schema';

-- Post-apply check (run separately; a valid staff JWT must now return 90):
--   GET /rest/v1/permissions?select=id&limit=0  -> Content-Range: 0-*/90
