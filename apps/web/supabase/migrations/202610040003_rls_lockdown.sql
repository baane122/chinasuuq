-- ============================================================
-- ChinaSuuq — Migration 202610040003: is_staff_or_admin() lockdown + policy repairs
-- 2026-10-04
--
-- THE LANDMINE (live-verified before writing this):
--   public.is_staff_or_admin() was  CREATE FUNCTION … SELECT auth.uid() IS NOT NULL;
--   i.e. "any signed-in user". 32 live policies across orders, order_items,
--   payments, quotes, shipments, sourcing_requests, customers, exchange_rates,
--   settings, staff_profiles, customer_profiles, source_products, product_events,
--   notifications, marketplace-related tables call it as their "admin" test, and
--   every `admin_*_view` is security_invoker=true — so those views expand to the
--   caller and inherit the same permissive check. Result today: a paying customer
--   with the anon key + their own JWT can read (and write) every order, payment,
--   quote, credential row and staff record in production, and the Mission Control
--   panel cannot tell staff from customers.
--
-- WHY IT IS SAFE TO TIGHTEN NOW (each point was probed live, not assumed):
--   * Live profiles.role values are exactly ('customer','staff','super_admin');
--     the enum has no 'admin' label, so 'admin' is kept only as a dead-letter
--     alias (mirrors 202610040002). Real staff keep passing.
--   * The only live SECURITY INVOKER-ish readers of the helper are the policies
--     and two orders guards (guard_order_customer_update, orders_money_guard).
--     Both guards are SECURITY DEFINER and were WRITTEN for the hardened helper:
--     they let non-staff INSERT orders with amounts as long as amount_paid stays
--     0/NULL and payment_status stays pending — which is exactly what the mobile
--     checkout sends. Customers therefore keep ordering; they simply stop being
--     treated as staff.
--   * order_items are written only through the mobile_order_submit RPC (a
--     SECURITY DEFINER function), so no INSERT policy is needed there.
--   * The web staff page edits staff_profiles.role (gated by is_super_admin()),
--     never profiles.role, so the new profiles role guard cannot lock out the
--     admin panel.
--   * `customers` (the legacy PII table, RLS OFF, anon-readable — verified with
--     an anon-key REST probe that returned real ids) has no reader in either app
--     reader in either app; both use admin_customers_view over profiles +
--     customer_profiles.
--
-- WHAT ELSE THIS MIGRATION FIXES (gaps found while mapping the same policies —
-- every one of these is a "CRUD that does not work for a role" bug):
--   support_tickets      — only a SELECT-own policy existed; customers could not
--                          file a ticket at all (mobile createSupportTicket does a
--                          direct INSERT), and staff could not read the queue.
--   support_messages     — RLS ON with ZERO policies: nobody but bypassrls roles
--                          could read or write a single message.
--   customer_profiles    — no INSERT policy while mobile updateProfile UPSERTs it.
--   quotes               — no INSERT policy for the customer while the sourcing
--                          flow submits quote requests; plus quotes_read_public
--                          leaked everyone's negotiated prices.
--   shipments            — own-read only joined shipment_packages; orders linked
--                          through shipments.order_id (202610030002) were
--                          invisible to their owner once read_public is dropped.
--   profiles             — "Users can update own profile" had NO WITH CHECK, so a
--                          customer could PATCH their own role to super_admin.
--   escalation RPCs      — _set_admin_role(uuid, user_role) (0 callers, anon-
--                          executable, SECURITY DEFINER), bypass_staff_restrictions
--                          and set_staff_role_bypass are dropped.
--   grants               — anon/authenticated hold TRUNCATE, REFERENCES, TRIGGER
--                          (and MAINTAIN on PG16) on the protected tables; revoked.
--
-- INTENTIONALLY UNCHANGED:
--   * source_products "Anyone can view products" and product_translations
--     "Anyone can view translations" — guests must browse the catalog. Price-range
--     columns being public is a known, documented trade-off; a restricted catalog
--     view is separate future work.
--   * exchange_rates_public_read (is_active) — the app needs the live FX rate.
--   * settings_select — non-secret keys stay readable (mobile reads
--     service_fee_pct); the regex already hides api_key/secret/token rows.
--   * marketplace_accounts — locked down by 202610040002 through its own
--     can_manage_marketplace_accounts() helper; untouched here.
--   * No FORCE ROW LEVEL SECURITY is added: every superuser role in this project
--     (postgres, service_role) has BYPASSRLS, and the SECURITY DEFINER helpers are
--     owned by postgres, so forcing would only complicate the definer reads.
-- ============================================================

-- ─── 1. The helper itself ───────────────────────────────────────────────
-- SECURITY DEFINER is mandatory, not cosmetic: public.profiles' own
-- staff_select_all policy calls is_staff_or_admin(), which reads profiles. As a
-- non-definer function that is infinite recursion; as the owner (postgres,
-- BYPASSRLS) the inner read is exempt. search_path is pinned to public,pg_temp
-- so nothing can shadow auth/public objects mid-call; every cross-schema
-- reference below is therefore fully qualified.
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(auth.jwt() ->> 'role', '') = 'authenticated'
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role::text IN ('staff', 'super_admin', 'admin')
    );
$fn$;

REVOKE ALL ON FUNCTION public.is_staff_or_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff_or_admin() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.is_staff_or_admin() IS
  'True only for a verified user session whose profiles.role is staff/super_admin(/legacy admin). Backs every *_admin_all policy and every security_invoker admin view. Anon, service_role and customers get false.';

-- is_super_admin() already matched on profiles.role, but had no pinned
-- search_path; re-declare it hardened and consistent with the helper above.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(auth.jwt() ->> 'role', '') = 'authenticated'
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role::text = 'super_admin'
    );
$fn$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated, service_role;

-- ─── 2. Dead escalation paths (0 callers anywhere in the repo) ──────────
DROP FUNCTION IF EXISTS public._set_admin_role(uuid, user_role);
DROP FUNCTION IF EXISTS public.bypass_staff_restrictions();
DROP FUNCTION IF EXISTS public.set_staff_role_bypass();

-- ─── 3. profiles: nobody edits their own role ──────────────────────────
-- Two layers, because a policy alone can be bypassed by whichever role the
-- auth hook runs as, and a trigger alone leaves a confusing 0-row PATCH.
CREATE OR REPLACE FUNCTION public.profile_role_write_allowed(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  -- Server-side contexts (service_role, Management API, the auth hooks) carry no
  -- end-user JWT: they are allowed, and RLS still gates who can reach the row.
  SELECT auth.uid() IS NULL
      OR public.is_super_admin()
      OR COALESCE(p_role, '') = COALESCE(
           (SELECT q.role::text FROM public.profiles q WHERE q.id = auth.uid()), ''
         );
$fn$;

REVOKE ALL ON FUNCTION public.profile_role_write_allowed(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_role_write_allowed(TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_profiles_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.uid() IS NULL OR public.is_super_admin() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'ChinaSuuq: only a super_admin session may change profiles.role';
  END IF;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'profiles absent — role guard skipped';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
  CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id AND public.profile_role_write_allowed(role::text));

  DROP TRIGGER IF EXISTS profiles_guard_role_change ON public.profiles;
  CREATE TRIGGER profiles_guard_role_change
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_role_change();
END $$;

-- ─── 4. customers: RLS was OFF and anon could read every row ───────────
DO $$
BEGIN
  IF to_regclass('public.customers') IS NULL THEN
    RAISE NOTICE 'customers absent — section skipped';
    RETURN;
  END IF;

  ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "customers_read_any" ON public.customers;
  DROP POLICY IF EXISTS "customers_read_public" ON public.customers;
  DROP POLICY IF EXISTS "customers_insert_any" ON public.customers;

  DROP POLICY IF EXISTS "customers_admin_all" ON public.customers;
  CREATE POLICY "customers_admin_all" ON public.customers
    FOR ALL TO authenticated
    USING (public.is_staff_or_admin())
    WITH CHECK (public.is_staff_or_admin());

  -- The owner may read their own legacy record (write stays staff-only).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'user_id'
  ) THEN
    DROP POLICY IF EXISTS "customers_select_own" ON public.customers;
    CREATE POLICY "customers_select_own" ON public.customers
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ─── 5. read_public leaks on tables that already have own + staff policies ─
-- Each of these was USING (true), i.e. full-table read for anon AND every signed
-- in user. Every table below keeps its own-row policy and its *_admin_all /
-- staff_select_all policy, so removing the blanket read loses nothing legitimate.
DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE NOTICE 'orders absent — leak sweep skipped';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "orders_read_public" ON public.orders;
  DROP POLICY IF EXISTS "order_items_read_public" ON public.order_items;
  DROP POLICY IF EXISTS "quotes_read_public" ON public.quotes;
  DROP POLICY IF EXISTS "shipments_read_public" ON public.shipments;
  DROP POLICY IF EXISTS "sourcing_requests_read_public" ON public.sourcing_requests;
  DROP POLICY IF EXISTS "staff_profiles_read_public" ON public.staff_profiles;
  -- Duplicate blanket read on the catalog table; the canonical
  -- "Anyone can view products" policy below stays.
  DROP POLICY IF EXISTS "source_products_read_public" ON public.source_products;
END $$;

-- ─── 6. Child tables: the same leak one level down ──────────────────────
-- quote_items / shipment_packages / warehouse_packages each had a USING (true)
-- SELECT. Two of them matter beyond their own rows: public.shipments' own-view
-- policy resolves the owner THROUGH shipment_packages, so a policy-free child
-- table would silently make every shipment invisible to its owner. Each leak is
-- therefore replaced by an ownership join, not just dropped.
DO $$
BEGIN
  IF to_regclass('public.shipment_packages') IS NOT NULL THEN
    DROP POLICY IF EXISTS "shipment_packages_read_public" ON public.shipment_packages;
    DROP POLICY IF EXISTS "shipment_packages_select_own" ON public.shipment_packages;
    CREATE POLICY "shipment_packages_select_own" ON public.shipment_packages
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = shipment_packages.order_id AND o.user_id = auth.uid()
        )
        OR public.is_staff_or_admin()
      );
  END IF;

  IF to_regclass('public.quote_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS "quote_items_read_public" ON public.quote_items;
    DROP POLICY IF EXISTS "quote_items_select_own" ON public.quote_items;
    CREATE POLICY "quote_items_select_own" ON public.quote_items
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.quotes q
          WHERE q.id = quote_items.quote_id AND q.user_id = auth.uid()
        )
        OR public.is_staff_or_admin()
      );
  END IF;

  IF to_regclass('public.warehouse_packages') IS NOT NULL THEN
    DROP POLICY IF EXISTS "warehouse_packages_read_public" ON public.warehouse_packages;
    DROP POLICY IF EXISTS "warehouse_packages_select_own" ON public.warehouse_packages;
    CREATE POLICY "warehouse_packages_select_own" ON public.warehouse_packages
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = warehouse_packages.order_id AND o.user_id = auth.uid()
        )
        OR public.is_staff_or_admin()
      );
  END IF;
END $$;

-- ─── 7. shipments: reach a shipment through shipments.order_id too ──────
DO $$
BEGIN
  IF to_regclass('public.shipments') IS NULL THEN
    RAISE NOTICE 'shipments absent — own policy skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shipments' AND column_name = 'order_id'
  ) THEN
    RAISE NOTICE 'shipments.order_id absent (202610030002 not applied live) — keeping the package-join policy only';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "Users can view own shipments" ON public.shipments;
  CREATE POLICY "Users can view own shipments" ON public.shipments
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.shipment_packages sp
        JOIN public.orders o ON o.id = sp.order_id
        WHERE sp.shipment_id = shipments.id AND o.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.orders o2
        WHERE o2.id = shipments.order_id AND o2.user_id = auth.uid()
      )
    );
END $$;

-- ─── 8. quotes: customers may file one, read their own ─────────────────
DO $$
BEGIN
  IF to_regclass('public.quotes') IS NULL THEN
    RAISE NOTICE 'quotes absent — insert policy skipped';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "quotes_insert_own" ON public.quotes;
  CREATE POLICY "quotes_insert_own" ON public.quotes
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL AND (user_id = auth.uid() OR user_id IS NULL));
END $$;

-- ─── 9. customer_profiles: mobile UPSERTs this on profile save ─────────
DO $$
BEGIN
  IF to_regclass('public.customer_profiles') IS NULL THEN
    RAISE NOTICE 'customer_profiles absent — insert policy skipped';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "customer_profiles_insert_own" ON public.customer_profiles;
  CREATE POLICY "customer_profiles_insert_own" ON public.customer_profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL AND (user_id = auth.uid() OR user_id IS NULL));
END $$;

-- ─── 10. Support desk: tickets and messages were unreachable for clients ─
DO $$
BEGIN
  IF to_regclass('public.support_tickets') IS NULL THEN
    RAISE NOTICE 'support_tickets absent — support desk policies skipped';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "support_tickets_insert_own" ON public.support_tickets;
  CREATE POLICY "support_tickets_insert_own" ON public.support_tickets
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL AND (user_id = auth.uid() OR user_id IS NULL));

  DROP POLICY IF EXISTS "support_tickets_update_own" ON public.support_tickets;
  CREATE POLICY "support_tickets_update_own" ON public.support_tickets
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

  DROP POLICY IF EXISTS "support_tickets_staff_all" ON public.support_tickets;
  CREATE POLICY "support_tickets_staff_all" ON public.support_tickets
    FOR ALL TO authenticated
    USING (public.is_staff_or_admin())
    WITH CHECK (public.is_staff_or_admin());
END $$;

DO $$
BEGIN
  IF to_regclass('public.support_messages') IS NULL THEN
    RAISE NOTICE 'support_messages absent — message policies skipped';
    RETURN;
  END IF;

  -- Participants (sender, or the ticket owner) plus staff.
  DROP POLICY IF EXISTS "support_messages_select_participants" ON public.support_messages;
  CREATE POLICY "support_messages_select_participants" ON public.support_messages
    FOR SELECT TO authenticated
    USING (
      sender_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = support_messages.ticket_id AND t.user_id = auth.uid()
      )
      OR public.is_staff_or_admin()
    );

  DROP POLICY IF EXISTS "support_messages_insert_own" ON public.support_messages;
  CREATE POLICY "support_messages_insert_own" ON public.support_messages
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL AND sender_id = auth.uid());

  DROP POLICY IF EXISTS "support_messages_update_staff" ON public.support_messages;
  CREATE POLICY "support_messages_update_staff" ON public.support_messages
    FOR UPDATE TO authenticated
    USING (public.is_staff_or_admin())
    WITH CHECK (public.is_staff_or_admin());
END $$;

-- ─── 11. Grant hygiene: drop admin-shaped privileges from API roles ─────
-- anon/authenticated keep SELECT/INSERT/UPDATE/DELETE where their policies need
-- them; TRUNCATE, REFERENCES and TRIGGER on business tables are never used by
-- PostgREST and only widen the blast radius of a leaked key.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','customers','customer_profiles','staff_profiles','orders','order_items',
    'payments','quotes','shipments','sourcing_requests','support_tickets','support_messages',
    'exchange_rates','settings','source_products','marketplace_accounts','notifications','favorites'
  ] LOOP
    BEGIN
      EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', t);
    EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
      NULL;
    END;
    -- MAINTAIN exists on PG16+ only; the ACL shows it is present here.
    BEGIN
      EXECUTE format('REVOKE MAINTAIN ON public.%I FROM anon, authenticated', t);
    EXCEPTION WHEN syntax_error THEN
      NULL;
    END;
  END LOOP;
END $$;

-- ─── 12. Post-apply checks (run manually) ───────────────────────────────
-- a) Helper is a pinned SECURITY DEFINER function and the dead RPCs are gone:
--    SELECT proname, prosecdef, proconfig FROM pg_proc p
--      JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public'
--        AND proname IN ('is_staff_or_admin','is_super_admin','_set_admin_role',
--                        'bypass_staff_restrictions','set_staff_role_bypass',
--                        'profile_role_write_allowed','guard_profiles_role_change');
-- b) No blanket read left on a private table:
--    SELECT tablename, policyname, qual FROM pg_policies
--      WHERE schemaname = 'public' AND coalesce(qual, '') IN ('true', '')
--        AND cmd IN ('SELECT', 'ALL') ORDER BY 1;
--    Expected survivors only: source_products / product_translations /
--    exchange_rates (catalog + FX are public by design).
-- c) Live behaviour, per role (staff JWT, customer JWT, anon key):
--    - staff:      GET /rest/v1/orders?select=id&limit=1        -> rows
--    - customer:   GET /rest/v1/orders?select=id&limit=1        -> []  (was: every order)
--    - customer:   GET /rest/v1/admin_orders_view?select=id     -> []
--    - customer:   PATCH /rest/v1/profiles?id=eq.<self> {"role":"super_admin"} -> error
--    - customer:   POST /rest/v1/support_tickets {user_id,<own>,subject,...}   -> 201
--    - anon:       GET /rest/v1/customers?select=id             -> 403/[] (was: real ids)
