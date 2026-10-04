-- 202610030005 — Seed DEFAULT permission grants (live RBAC model).
--
-- LIVE truth (probed via information_schema 2026-10-03): access is a single
-- flat table permissions(role staff_role, permission permission_type) —
-- staff_profiles.role and permissions.role share the 18-value staff_role
-- enum; permission_type has 13 action labels. The table was EMPTY, which is
-- why the admin UI showed "Permissions not configured — any signed-in staff
-- member can edit AI provider keys".
--
-- This seeds a conservative default org chart. Adjust per your actual team in
-- the roles/permissions editor. Editable decisions to note:
--   * manage_roles = the UI's admin-config gate (AI provider keys, delete
--     staff). Only super_admin + operations_director hold it by default.
--   * verify_payment is granted to the finance pair, the branch manager and
--     operations_director so daily payment confirmation keeps working.
--   * refund / pay_supplier / manage_exchange_rate stay with finance +
--     leadership only.
-- Idempotent: every insert is guarded by NOT EXISTS.

insert into public.permissions (role, permission)
select r.role, p.permission
from (values
  ('super_admin'::staff_role), ('operations_director'::staff_role)
) as r(role)
cross join (values
  ('view'::permission_type), ('create'), ('edit'), ('approve'),
  ('verify_payment'), ('refund'), ('pay_supplier'), ('manage_exchange_rate'),
  ('export'), ('view_finance'), ('view_sensitive_customer_data'), ('archive')
) as p(permission)
where r.role = 'super_admin'
   or (r.role = 'operations_director' and p.permission not in ('refund'))
on conflict do nothing;

insert into public.permissions (role, permission)
select r.role, p.permission
from (values
  ('finance_manager'::staff_role)
) as r(role)
cross join (values
  ('view'::permission_type), ('edit'), ('approve'), ('verify_payment'),
  ('refund'), ('pay_supplier'), ('manage_exchange_rate'), ('export'), ('view_finance')
) as p(permission)
on conflict do nothing;

insert into public.permissions (role, permission)
select r.role, p.permission
from (values
  ('finance_verifier'::staff_role)
) as r(role)
cross join (values
  ('view'::permission_type), ('verify_payment'), ('export'), ('view_finance')
) as p(permission)
on conflict do nothing;

insert into public.permissions (role, permission)
select r.role, p.permission
from (values
  ('sourcing_manager'::staff_role), ('logistics_manager'::staff_role),
  ('warehouse_manager'::staff_role)
) as r(role)
cross join (values
  ('view'::permission_type), ('create'), ('edit'), ('approve'), ('export')
) as p(permission)
on conflict do nothing;

insert into public.permissions (role, permission)
select r.role, p.permission
from (values
  ('sourcing_agent'::staff_role), ('warehouse_operator'::staff_role),
  ('content_manager'::staff_role)
) as r(role)
cross join (values
  ('view'::permission_type), ('create'), ('edit')
) as p(permission)
on conflict do nothing;

insert into public.permissions (role, permission)
select r.role, p.permission
from (values
  ('purchasing_officer'::staff_role)
) as r(role)
cross join (values
  ('view'::permission_type), ('create'), ('edit'), ('approve'), ('pay_supplier')
) as p(permission)
on conflict do nothing;

insert into public.permissions (role, permission)
select r.role, p.permission
from (values
  ('quality_inspector'::staff_role)
) as r(role)
cross join (values
  ('view'::permission_type), ('edit'), ('approve'), ('archive')
) as p(permission)
on conflict do nothing;

insert into public.permissions (role, permission)
select r.role, p.permission
from (values
  ('somalia_branch_manager'::staff_role)
) as r(role)
cross join (values
  ('view'::permission_type), ('create'), ('edit'), ('approve'),
  ('verify_payment'), ('export'), ('view_finance'), ('view_sensitive_customer_data')
) as p(permission)
on conflict do nothing;

insert into public.permissions (role, permission)
select r.role, p.permission
from (values
  ('support_manager'::staff_role)
) as r(role)
cross join (values
  ('view'::permission_type), ('edit'), ('export'), ('view_sensitive_customer_data')
) as p(permission)
on conflict do nothing;

insert into public.permissions (role, permission)
select r.role, p.permission
from (values
  ('support_agent'::staff_role), ('delivery_operator'::staff_role)
) as r(role)
cross join (values
  ('view'::permission_type)
) as p(permission)
on conflict do nothing;

insert into public.permissions (role, permission)
select r.role, p.permission
from (values
  ('analyst'::staff_role)
) as r(role)
cross join (values
  ('view'::permission_type), ('export'), ('view_finance')
) as p(permission)
on conflict do nothing;

insert into public.permissions (role, permission)
select r.role, p.permission
from (values
  ('auditor'::staff_role)
) as r(role)
cross join (values
  ('view'::permission_type), ('export'), ('view_finance'), ('archive')
) as p(permission)
on conflict do nothing;
