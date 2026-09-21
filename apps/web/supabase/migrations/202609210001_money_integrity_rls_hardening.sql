-- ============================================================
-- ChinaSuuq — Migration 16: money integrity + RLS hardening
-- 2026-09-21
--
-- Fixes the audit's critical database findings:
--   CRITICAL  handle_new_user trusted user_metadata.role → anyone could
--             sign up as admin. Fixed: role forced to 'customer'.
--   CRITICAL  orders_update_own let CUSTOMERS edit their order's money
--             columns and payment_status (self-mark as paid). Fixed by
--             the orders_money_guard trigger.
--   CRITICAL  settings_modify allowed ANON writes (auth.uid() IS NULL).
--   CRITICAL  admin_* views ran with owner privileges and were readable
--             by anon by default → customer PII leak. Fixed:
--             security_invoker + grants + staff select policies.
--   CRITICAL  payments_insert_own let customers insert payment rows with
--             status='completed' (fake payment proof). Fixed: pending only.
--   HIGH      float money columns → normalized to numeric (no drift).
--   HIGH      missing CHECK constraints on amounts → added NOT VALID.
--
-- SAFE TO RUN MULTIPLE TIMES: every step is conditional.
-- Apply with:  supabase db push   (or psql \i this file)
-- ============================================================

-- ─── 0. Defensive helper ─────────────────────────────────────────────────
-- The 20260813 policy SQL references public.is_staff_or_admin(); the
-- canonical helper lives in the auth schema. Provide the wrapper if absent.
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$ SELECT auth.is_staff_or_admin(); $$;

-- ─── 1. CRITICAL FIX — signup privilege escalation ──────────────────────
-- The old handle_new_user copied user_metadata.role into profiles.role, so
-- signUp({ data: { role: "admin" } }) created an admin profile. Roles are
-- assigned by staff only — never from signup metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, role, status)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
        'customer',  -- NEVER trust user_metadata.role
        'active'
    );
    RETURN NEW;
END;
$$;

-- Guard: role changes require staff; super_admin grants/demotions require
-- an actual super_admin (staff could otherwise promote themselves).
CREATE OR REPLACE FUNCTION public.profiles_guard_role()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        IF NOT auth.is_staff_or_admin() THEN
            RAISE EXCEPTION 'ChinaSuuq: only staff may change profile roles';
        END IF;
        IF NEW.role = 'super_admin' AND NOT auth.is_super_admin() THEN
            RAISE EXCEPTION 'ChinaSuuq: only a super_admin can grant super_admin';
        END IF;
        IF OLD.role = 'super_admin' AND NOT auth.is_super_admin() THEN
            RAISE EXCEPTION 'ChinaSuuq: only a super_admin can demote a super_admin';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_role_guard ON public.profiles;
CREATE TRIGGER profiles_role_guard
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_role();

-- ─── 2. Normalize float money columns to numeric ─────────────────────────
-- Floats must never store money (binary rounding drift). double precision /
-- real columns that look like currency amounts become numeric(14,2);
-- exchange-rate columns become numeric(18,8). Conditional per column.
DO $$
DECLARE
    tbl  TEXT;
    col  TEXT;
BEGIN
    FOR tbl, col IN
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND c.data_type IN ('double precision', 'real')
          AND (
                c.column_name LIKE '%\_usd' ESCAPE '\'
             OR c.column_name LIKE '%\_cny' ESCAPE '\'
             OR c.column_name IN ('subtotal','total','amount','amount_paid',
                                  'amount_refunded','balance_due','service_fee',
                                  'shipping_cost','shipping_estimate','tax_amount',
                                  'insurance_amount','discount_amount','unit_price',
                                  'cost_price','total_price','unit_price_cny',
                                  'price_cny','price_usd','freight_cost')
             OR c.column_name LIKE 'price%'
             OR c.column_name LIKE 'fee%'
             OR c.column_name LIKE '%rate%'
          )
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN %I TYPE %s USING (%I::numeric)',
            tbl, col,
            CASE WHEN col LIKE '%rate%' THEN 'numeric(18,8)' ELSE 'numeric(14,2)' END,
            col
        );
        RAISE NOTICE 'money-type: %.% -> numeric', tbl, col;
    END LOOP;
END $$;

-- ─── 3. CRITICAL FIX — orders money guard ────────────────────────────────
-- Uses to_jsonb() accessors so it works with BOTH schema generations
-- (total / total_usd). JSON keys that don't exist simply read as NULL.
CREATE OR REPLACE FUNCTION public.orders_money_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    op TEXT := TG_OP;
    old_total numeric; new_total numeric;
    old_sub   numeric; new_sub   numeric;
    old_paid  numeric; new_paid  numeric;
BEGIN
    -- Resolve money values regardless of column-name generation.
    IF op = 'UPDATE' THEN
        old_total := COALESCE((to_jsonb(OLD)->>'total_usd')::numeric, (to_jsonb(OLD)->>'total')::numeric);
        old_sub   := COALESCE((to_jsonb(OLD)->>'subtotal_usd')::numeric, (to_jsonb(OLD)->>'subtotal')::numeric);
        old_paid  := COALESCE((to_jsonb(OLD)->>'amount_paid_usd')::numeric, (to_jsonb(OLD)->>'amount_paid')::numeric);
    END IF;
    new_total := COALESCE((to_jsonb(NEW)->>'total_usd')::numeric, (to_jsonb(NEW)->>'total')::numeric);
    new_sub   := COALESCE((to_jsonb(NEW)->>'subtotal_usd')::numeric, (to_jsonb(NEW)->>'subtotal')::numeric);
    new_paid  := COALESCE((to_jsonb(NEW)->>'amount_paid_usd')::numeric, (to_jsonb(NEW)->>'amount_paid')::numeric);

    IF auth.is_staff_or_admin() THEN
        RETURN NEW;  -- staff path unchanged (balance maintained by app)
    END IF;

    -- Non-staff (customers / guests):
    IF op = 'UPDATE' THEN
        IF (new_total IS DISTINCT FROM old_total)
           OR (new_sub IS DISTINCT FROM old_sub)
           OR (new_paid IS DISTINCT FROM old_paid) THEN
            RAISE EXCEPTION 'ChinaSuuq: only staff may change order amounts';
        END IF;
        IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
            RAISE EXCEPTION 'ChinaSuuq: only staff may change payment_status';
        END IF;
        IF COALESCE((to_jsonb(NEW)->>'amount_refunded_usd')::text, (to_jsonb(NEW)->>'amount_refunded')::text)
           IS DISTINCT FROM
           COALESCE((to_jsonb(OLD)->>'amount_refunded_usd')::text, (to_jsonb(OLD)->>'amount_refunded')::text) THEN
            RAISE EXCEPTION 'ChinaSuuq: only staff may change refunds';
        END IF;
    END IF;

    IF op = 'INSERT' THEN
        IF new_paid IS NOT NULL AND new_paid <> 0 THEN
            RAISE EXCEPTION 'ChinaSuuq: new orders cannot carry payments (staff record payments)';
        END IF;
        IF NEW.payment_status IS NOT NULL AND NEW.payment_status::text <> 'pending' THEN
            RAISE EXCEPTION 'ChinaSuuq: new orders must start with payment_status=pending';
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS orders_money_guard_trigger ON public.orders;
CREATE TRIGGER orders_money_guard_trigger
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_money_guard();

-- ─── 4. CHECK constraints (NOT VALID — validates new/updated rows only) ──
-- Candidate list is (table, column, predicate); each is applied only when
-- the column actually exists (migration schema vs live schema differ).
DO $$
DECLARE
    r RECORD;
    connais BOOLEAN;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('orders',         'total_usd',         'total_usd >= 0'),
            ('orders',         'total',             'total >= 0'),
            ('orders',         'subtotal_usd',      'subtotal_usd >= 0'),
            ('orders',         'subtotal',          'subtotal >= 0'),
            ('orders',         'amount_paid_usd',   'amount_paid_usd >= 0'),
            ('orders',         'amount_paid',       'amount_paid >= 0'),
            ('orders',         'service_fee_usd',   'service_fee_usd >= 0'),
            ('orders',         'service_fee',       'service_fee >= 0'),
            ('payments',       'amount',            'amount >= 0'),
            ('payments',       'amount_refunded',   'amount_refunded >= 0 AND amount_refunded <= amount'),
            ('refunds',        'amount',            'amount >= 0'),
            ('quotes',         'total_cny',         'total_cny >= 0'),
            ('quotes',         'total_usd',         'total_usd >= 0'),
            ('quotes',         'service_fee',       'service_fee >= 0'),
            ('quote_items',    'unit_price_cny',    'unit_price_cny >= 0'),
            ('order_items',    'unit_price',        'unit_price >= 0'),
            ('order_items',    'total_price',       'total_price >= 0'),
            ('products',       'price_cny',         'price_cny >= 0'),
            ('products',       'min_order_qty',     'min_order_qty > 0')
        ) AS c(table_name, col, expr)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name=r.table_name AND column_name=r.col
        ) THEN
            CONTINUE;
        END IF;
        EXECUTE format(
            'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I;
             ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s) NOT VALID;',
            r.table_name, 'ck_money_' || r.table_name || '_' || r.col,
            r.table_name, 'ck_money_' || r.table_name || '_' || r.col, r.expr
        );
        RAISE NOTICE 'check: %.% -> %', r.table_name, r.col, r.expr;
    END LOOP;
END $$;

-- ─── 5. CRITICAL FIX — payments: customers submit pending proofs only ────
DROP POLICY IF EXISTS payments_insert_own ON public.payments;
CREATE POLICY payments_insert_own ON public.payments
    FOR INSERT WITH CHECK (
        profile_id = auth.uid()
        AND (auth.is_staff_or_admin() OR status = 'pending')
    );

-- ─── 6. CRITICAL FIX — settings: no more anon writes ─────────────────────
-- settings_modify previously used (is_staff_or_admin() OR auth.uid() IS NULL),
-- which granted every anonymous visitor INSERT/UPDATE/DELETE.
DROP POLICY IF EXISTS "settings_modify" ON public.settings;
CREATE POLICY "settings_modify" ON public.settings FOR ALL
    USING (auth.is_staff_or_admin())
    WITH CHECK (auth.is_staff_or_admin());

DROP POLICY IF EXISTS "settings_select" ON public.settings;
CREATE POLICY "settings_select" ON public.settings FOR SELECT
    USING (true);  -- store settings are public by design

-- ─── 7. CRITICAL FIX — admin views: no more anon PII ─────────────────────
-- Views run with owner privileges unless security_invoker is on; Supabase
-- grants anon on public by default, so every admin_*_view was publicly
-- readable. Enforce invoker rights, revoke from anon, and make sure the
-- base tables carry a staff-select policy so invoker-mode still works.
DO $$
DECLARE
    v TEXT;
BEGIN
    FOREACH v IN ARRAY ARRAY[
        'admin_orders_view','admin_customers_view','admin_payments_view',
        'admin_sourcing_view','admin_quotes_view','admin_shipments_view',
        'admin_warehouse_view','admin_staff_view'
    ] LOOP
        IF to_regclass('public.' || v) IS NOT NULL THEN
            EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
            EXECUTE format('REVOKE ALL ON public.%I FROM anon', v);
            EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v);
            RAISE NOTICE 'view hardened: %', v;
        END IF;
    END LOOP;
END $$;

-- Base-table staff select policies (needed now that views run as invoker).
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'orders','profiles','customer_profiles','sourcing_requests',
        'quotes','shipments','warehouse_packages','staff_profiles'
    ] LOOP
        IF to_regclass('public.' || tbl) IS NOT NULL THEN
            EXECUTE format('DROP POLICY IF EXISTS staff_select_all ON public.%I', tbl);
            EXECUTE format(
                'CREATE POLICY staff_select_all ON public.%I
                 FOR SELECT TO authenticated USING (auth.is_staff_or_admin())', tbl);
            RAISE NOTICE 'staff select policy ensured on %', tbl;
        END IF;
    END LOOP;
END $$;

-- ============================================================
-- FOLLOW-UP (documented in README, needs app changes):
--  • VALIDATE the new CHECKs once data is confirmed clean:
--      ALTER TABLE orders VALIDATE CONSTRAINT ck_money_orders_total_usd; ...
--  • Guest orders (user_id IS NULL) remain readable by anon via
--    orders_select_own — replace reference-based tracking with a
--    tokenized lookup + app change, then drop that clause.
--  • quote_items.cost_price is visible to quote owners via RLS
--    (business-sensitive) — move supplier costs to supplier_options.
-- ============================================================
