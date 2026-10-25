-- ─── Mission Control catalog writes: staff-only RLS policies ─────────────
-- WHY THIS EXISTS (measured, not assumed, 2026-10-16 against production):
--
-- The 2026-10-04 lockdown (202610040003_rls_lockdown.sql) closed public READ
-- leaks. Read became: anon may SELECT `source_products` and `categories`. It did
-- not (re)create any WRITE policy for staff on those tables, and RLS is deny by
-- default once a table is row-secured — so an UPDATE or INSERT from a signed-in
-- staff account is refused with `new row violates row-level security policy`,
-- which PostgREST reports as 403/401 and the admin screens show as a failed save.
--
-- That is the whole reason the Products console and the Trending shelf cannot
-- save: every catalog write in Mission Control goes browser-side with the staff
-- JWT (this project has `output: "export"`, so there is no server to hold a
-- service key — verified: no service-role client exists in any bundle), and the
-- policy that would allow it was not there.
--
-- WHAT IS LIVE (verified through PostgREST with the service role, read-only):
--   * public.is_staff_or_admin()  — EXISTS. SECURITY DEFINER, returns true only
--     for an `authenticated` session whose profiles.role is staff / super_admin /
--     legacy admin. Anon, service_role and customers get FALSE. (So probing it
--     over the REST API always answers false — that is the helper working, not a
--     bug, and it is why this file cannot be verified by an API call.)
--   * public.is_admin()           — DOES NOT EXIST. `is_super_admin()` does.
--     Nothing here assumes otherwise.
--   * public.permissions          — EXISTS, 90 rows, columns (id, role,
--     permission, granted_by, created_at). It is a role→permission MATRIX
--     (super_admin / operations_director / staff × view, create, edit, approve,
--     verify_payment, refund, pay_supplier, manage_exchange_rate, export,
--     view_finance, view_sensitive_customer_data, archive) and it carries NO
--     user_id. It grants capabilities to ROLES, not to people, so it cannot be
--     used as a row-security predicate. `admin_permissions`, `role_permissions`,
--     `admin_roles` and `admin_grants` do not exist in the schema cache at all.
--     Therefore the row-level boundary in this project is exactly one question:
--     is this session a staff session? — which is what is_staff_or_admin() answers.
--
-- WHAT THIS FILE DOES: adds the four write policies, staff-only, to the catalog
-- tables Mission Control edits. It ADDS; it never drops a policy it did not
-- create, so the public READ behaviour established on 2026-10-04 is untouched.
-- Customers and anon still cannot write: every WITH CHECK is is_staff_or_admin().
--
-- REPEATABLE: DROP POLICY IF EXISTS then CREATE POLICY on fixed names, wrapped in
-- existence guards, so running it twice, or on a project where a table is absent,
-- is safe. Run it in the Supabase dashboard SQL editor (the Management API token
-- for this project is expired, so no code path can apply DDL).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.source_products',          -- titles, prices, images, status, category, _curation
    'public.source_product_variants',  -- colour/size/model options shown on the product screen
    'public.categories',               -- the browse shelf: name_en/name_so/slug/icon/sort_order
    'public.product_translations'      -- the English/Somali copy the apps display
  ]
  LOOP
    CONTINUE WHEN to_regclass(t) IS NULL;

    -- INSERT: staff may add. WITH CHECK only — a new row has no previous version.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', '_cs_staff_catalog_insert', t);
    EXECUTE format($f$CREATE POLICY "_cs_staff_catalog_insert" ON %s
      FOR INSERT TO authenticated
      WITH CHECK (public.is_staff_or_admin())$f$, t);

    -- UPDATE: staff may read the row they are replacing AND write the new one.
    -- Both halves use the same predicate; a policy whose USING differs from its
    -- WITH CHECK would let a staff member rewrite rows they cannot see.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', '_cs_staff_catalog_update', t);
    EXECUTE format($f$CREATE POLICY "_cs_staff_catalog_update" ON %s
      FOR UPDATE TO authenticated
      USING (public.is_staff_or_admin())
      WITH CHECK (public.is_staff_or_admin())$f$, t);

    -- DELETE: staff may remove.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', '_cs_staff_catalog_delete', t);
    EXECUTE format($f$CREATE POLICY "_cs_staff_catalog_delete" ON %s
      FOR DELETE TO authenticated
      USING (public.is_staff_or_admin())$f$, t);

    -- Backstop for the bulk toolbar, which sends DELETE ... WHERE id IN (...):
    -- that is still a DELETE command, covered above. No extra policy needed; it is
    -- stated here because a FOR ALL policy would have to be dropped by name, and
    -- if a project already carries a differently-named blanket staff policy the
    -- three above simply add to it — PostgREST ORs permissive policies.
    RAISE NOTICE 'catalog staff-write policies applied to %', t;
  END LOOP;
END $$;

-- ─── Also: the trending shelf needs no new policy ────────────────────────
-- Staff picks are stored inside `source_products.attributes` under the reserved
-- `_curation` key (see 202610161301_category_wiring.sql for why there is no
-- is_featured column), so pinning, reordering and unpinning are UPDATEs on
-- source_products — covered by the policy above. Product events are written by
-- the SECURITY DEFINER `record_product_event()` RPC, which is deliberately not
-- touched here: guests must keep being able to record views and carts.

-- ─── VERIFY (prints in the dashboard after applying) ────────────────────
-- Expect three rows per table that exists, cmd I/U/D, roles {authenticated}.
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('source_products', 'source_product_variants', 'categories', 'product_translations')
ORDER BY tablename, cmd;

-- And the reads must NOT have changed: every one of these tables keeps its
-- pre-existing SELECT policy, which is why SELECT below still lists the old ones.
SELECT tablename, count(*) FILTER (WHERE cmd = 'SELECT') AS select_policies,
         count(*) FILTER (WHERE cmd IN ('INSERT','UPDATE','DELETE')) AS write_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('source_products', 'source_product_variants', 'categories', 'product_translations')
GROUP BY tablename
ORDER BY tablename;
