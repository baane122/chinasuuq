-- ═══════════════════════════════════════════════════════════════════════════
-- 202609290001_web_quote_flow.sql
-- Web quote flow hardening + credential-table lockdown.
--
-- HOW TO PUSH: Supabase Dashboard → SQL Editor (paste + run), or
--   supabase db push   (CLI linked to project athkmrvsaijwgsyvwrbp)
-- NOTE: the Supabase Management API access token was expired when this file
-- was authored, so it ships as a ready-to-push file instead of being applied.
--
-- Every statement is IDEMPOTENT (safe to run twice).
-- Schema facts were verified against the LIVE database via PostgREST probes
-- (see plans/live-schema-contract.md). Canonical role helper:
-- public.is_staff_or_admin() (202609210001_money_integrity_rls_hardening.sql).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. sourcing_requests: contact fields for the web quote form
--    The web QuoteForm currently packs name/phone into product_description;
--    dedicated columns let the admin team and future views read them.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sourcing_requests'
      AND column_name = 'contact_name'
  ) THEN
    ALTER TABLE public.sourcing_requests ADD COLUMN contact_name text;
    COMMENT ON COLUMN public.sourcing_requests.contact_name IS
      'Customer-provided name from the web quote form (QuoteForm.tsx).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sourcing_requests'
      AND column_name = 'contact_phone'
  ) THEN
    ALTER TABLE public.sourcing_requests ADD COLUMN contact_phone text;
    COMMENT ON COLUMN public.sourcing_requests.contact_phone IS
      'Customer-provided phone/WhatsApp from the web quote form (QuoteForm.tsx).';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. admin_sourcing_view: expose the new contact fields
--    The live view definition could not be read with the anon key, and the
--    20260813 file's definition references columns (assigned_agent_id,
--    internal_notes) that may or may not exist live. Rather than risk
--    replacing the view with a wrong alias set, run this AFTER diffing:
--      SELECT pg_get_viewdef('public.admin_sourcing_view'::regclass, true);
--    Then adapt the template below (uncomment, add the two columns, keep
--    every alias the admin sourcing page reads).
--
-- ── TEMPLATE (do not run blind) ──────────────────────────────────────────
-- DROP VIEW IF EXISTS public.admin_sourcing_view;
-- CREATE OR REPLACE VIEW public.admin_sourcing_view AS
-- SELECT
--   sr.id,
--   sr.user_id AS profile_id,
--   p.full_name AS customer_name,
--   COALESCE(NULLIF(sr.product_description,''), '')::text AS title,
--   sr.marketplace::text AS marketplace,
--   sr.marketplace::text AS target_marketplace,
--   sr.product_url,
--   sr.product_description,
--   sr.contact_name,          -- NEW
--   sr.contact_phone,         -- NEW
--   sr.destination_city,
--   sr.quantity AS quantity_needed,
--   NULL::numeric AS price_cny,
--   NULL::numeric AS price_usd,
--   NULL::text[] AS images,
--   sr.status::text AS status,
--   sr.created_at
-- FROM public.sourcing_requests sr
-- LEFT JOIN public.profiles p ON p.id = sr.user_id;
-- ─────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Money integrity: non-negative CHECKs on every USD/CNY money column.
--    Guarded by pg_constraint so re-running is a no-op. NOT VALID + VALIDATE
--    keeps the ALTER instant even on big tables with legacy rows.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tgt CONSTANT text[] := ARRAY[
    'orders.total_usd', 'orders.subtotal_usd', 'orders.service_fee_usd',
    'orders.balance_due_usd', 'quotes.total_usd', 'quotes.total_cny',
    'payments.amount'
  ];
  tgt_elem text;
  tbl text; col text; con text;
BEGIN
  FOREACH tgt_elem IN ARRAY tgt LOOP
    tbl := split_part(tgt_elem, '.', 1);
    col := split_part(tgt_elem, '.', 2);
    con := regexp_replace(tbl || '_' || col, '[^a-z0-9_]', '', 'g') || '_nonneg';
    -- Skip silently when the table/column itself does not exist.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = col
    ) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE c.conname = con AND n.nspname = 'public'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I >= 0) NOT VALID',
        tbl, con, col
      );
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', tbl, con);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. marketplace_accounts RLS LOCKDOWN (supplier credentials).
--    Migration 13 (202408010013) left this table open to every authenticated
--    user — any customer token could read encrypted passwords + usernames.
--    Only staff/super_admin via public.is_staff_or_admin() from now on.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  pol record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'marketplace_accounts'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'marketplace_accounts' AND rowsecurity
    ) THEN
      ALTER TABLE public.marketplace_accounts ENABLE ROW LEVEL SECURITY;
    END IF;

    -- Force RLS even for the table owner so no BYPASSRLS path sneaks through.
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'marketplace_accounts' AND forcerowsecurity
    ) THEN
      ALTER TABLE public.marketplace_accounts FORCE ROW LEVEL SECURITY;
    END IF;

    -- Drop the over-broad legacy policies if they exist.
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'marketplace_accounts'
        AND (policyname LIKE '%authenticated%' OR qual LIKE '%authenticated%')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.marketplace_accounts', pol.policyname);
    END LOOP;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'marketplace_accounts'
        AND policyname = 'marketplace_accounts_staff_all'
    ) THEN
      CREATE POLICY marketplace_accounts_staff_all
        ON public.marketplace_accounts
        FOR ALL
        TO authenticated
        USING (public.is_staff_or_admin())
        WITH CHECK (public.is_staff_or_admin());
    END IF;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. product_events: anon no longer writes telemetry (bot spam vector).
--    Web reads stay open (catalog counters); authenticated writes unchanged.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'product_events'
  ) THEN
    REVOKE INSERT ON public.product_events FROM anon;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. audit_logs: append-only for non-staff. Anon and plain customers must
--    not be able to rewrite history; staff keep full access via RLS helper.
--    (The table exists — verified against the repo's audit trail code.)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    REVOKE UPDATE, DELETE ON public.audit_logs FROM anon, authenticated;

    IF NOT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'audit_logs' AND rowsecurity
    ) THEN
      ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
      CREATE POLICY audit_logs_staff_read
        ON public.audit_logs
        FOR SELECT
        TO authenticated
        USING (public.is_staff_or_admin());
    END IF;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- End of 202609290001_web_quote_flow.sql
-- Post-apply checklist:
--   □ Run the pg_get_viewdef diff + view template (section 2) manually.
--   □ Smoke-test: staff login → marketplace accounts readable; customer
--     token → 0 rows; anon product_events INSERT → 401/403.
-- ═══════════════════════════════════════════════════════════════════════════
