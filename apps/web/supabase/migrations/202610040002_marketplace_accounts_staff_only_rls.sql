-- ============================================================
-- ChinaSuuq — Migration 202610040002: marketplace_accounts staff-only RLS
-- 2026-10-03 (product decision: marketplace login CREDENTIALS are staff-only;
-- shared logins work via COOKIES only — injected through the cookies-only RPC
-- of 202610030006 — for any logged-in user; guests browse public)
--
-- THE HOLE: 202408010013_marketplace_accounts.sql L29–30 created
--   CREATE POLICY "marketplace_accounts_select" ... USING (auth.role() = 'authenticated')
-- so ANY logged-in customer could SELECT the whole table — plaintext
-- username + password_encrypted + cookies included. 202609290001 §4 already
-- attempted this lockdown (drop "%authenticated%" policies, create
-- marketplace_accounts_staff_all via public.is_staff_or_admin()), and
-- 202610030003 tightened the RPC — but per project memory the LIVE schema can
-- diverge from repo migrations (skipped/partially-applied DO blocks, manually
-- created policies). This migration RE-ASSERTS the intended end state
-- idempotently; it is safe to run even where 202609290001 already landed.
--
-- ⚠ REVIEW BEFORE APPLYING — the live table may carry policies/roles this repo
--   does not know about. Check first with:
--     SELECT policyname, cmd, roles, qual, with_check
--       FROM pg_policies WHERE schemaname='public' AND tablename='marketplace_accounts';
--     SELECT column_name, data_type FROM information_schema.columns
--       WHERE table_schema='public' AND table_name='marketplace_accounts';
--     SELECT DISTINCT role::text FROM public.profiles;
--   This script DROPS EVERY policy on the table (except its own four
--   marketplace_accounts_staff_* policies) and recreates a staff-only set —
--   deliberate, so no over-broad live policy survives under an unknown name.
--   If the live audit shows a legitimate non-staff policy, adapt before
--   running. service_role bypasses RLS: edge functions (marketplace-session-
--   sync) and the admin server are unaffected.
--
-- Role check matches the style of 202610030003/202610030006:
--   * auth.jwt() ->> 'role' must be 'authenticated' (rejects anon/service
--     tokens presented against this policy path), AND
--   * the caller's profiles.role is staff/super_admin — 'admin' kept as a
--     dead-letter alias for the pre-202609210001 enum (harmless, mirrors
--     202610030003 L72–79). role::text cast survives enum→text drift.
--   A dedicated SECURITY DEFINER helper is used instead of inlining the
--   profiles subquery so policies never depend on the caller's SELECT rights
--   on profiles (and live can be checked without touching is_staff_or_admin,
--   whose definition has drifted across migrations).
-- ============================================================

-- ─── 1. Staff-only check helper ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_manage_marketplace_accounts()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $fn$
    SELECT COALESCE(auth.jwt() ->> 'role', '') = 'authenticated'
      AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role::text IN ('staff', 'super_admin', 'admin')
      );
$fn$;

REVOKE ALL ON FUNCTION public.can_manage_marketplace_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_marketplace_accounts() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.can_manage_marketplace_accounts() IS
  'True only for a verified user session whose profiles.role is staff/super_admin(/legacy admin). Gates marketplace_accounts RLS (credentials + cookies are staff-only).';

-- ─── 2. Re-assert RLS + staff-only policies (guarded, idempotent) ──────
DO $$
DECLARE
  pol record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'marketplace_accounts'
  ) THEN
    RAISE NOTICE 'marketplace_accounts absent — nothing to lock down';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'marketplace_accounts' AND rowsecurity
  ) THEN
    ALTER TABLE public.marketplace_accounts ENABLE ROW LEVEL SECURITY;
  END IF;

  -- Force RLS even for the table owner (no BYPASSRLS path through postgres).
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'marketplace_accounts'
      AND c.relforcerowsecurity
  ) THEN
    ALTER TABLE public.marketplace_accounts FORCE ROW LEVEL SECURITY;
  END IF;

  -- Drop every policy that is not one of the canonical staff-only four.
  -- Catches 202408010013's "marketplace_accounts_select/insert/update/delete"
  -- (auth.role()='authenticated'), 202609290001's "marketplace_accounts_staff_all",
  -- and any live policy created by hand under an unknown name.
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'marketplace_accounts'
      AND policyname NOT IN (
        'marketplace_accounts_staff_select',
        'marketplace_accounts_staff_insert',
        'marketplace_accounts_staff_update',
        'marketplace_accounts_staff_delete'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.marketplace_accounts', pol.policyname);
  END LOOP;

  DROP POLICY IF EXISTS "marketplace_accounts_staff_select" ON public.marketplace_accounts;
  CREATE POLICY "marketplace_accounts_staff_select" ON public.marketplace_accounts
    FOR SELECT TO authenticated
    USING (public.can_manage_marketplace_accounts());

  DROP POLICY IF EXISTS "marketplace_accounts_staff_insert" ON public.marketplace_accounts;
  CREATE POLICY "marketplace_accounts_staff_insert" ON public.marketplace_accounts
    FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_marketplace_accounts());

  DROP POLICY IF EXISTS "marketplace_accounts_staff_update" ON public.marketplace_accounts;
  CREATE POLICY "marketplace_accounts_staff_update" ON public.marketplace_accounts
    FOR UPDATE TO authenticated
    USING (public.can_manage_marketplace_accounts())
    WITH CHECK (public.can_manage_marketplace_accounts());

  DROP POLICY IF EXISTS "marketplace_accounts_staff_delete" ON public.marketplace_accounts;
  CREATE POLICY "marketplace_accounts_staff_delete" ON public.marketplace_accounts
    FOR DELETE TO authenticated
    USING (public.can_manage_marketplace_accounts());
END $$;

-- ─── 3. Post-apply check (run manually) ─────────────────────────────────
-- Expected: exactly the four marketplace_accounts_staff_* policies, all
-- qual/with_check mentioning can_manage_marketplace_accounts(), nothing else.
--   SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
--   WHERE tablename = 'marketplace_accounts';
