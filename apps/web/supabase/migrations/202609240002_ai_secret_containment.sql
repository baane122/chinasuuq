-- ============================================================
-- ChinaSuuq — Migration 17: AI provider secret containment
-- 2026-09-24
--
-- CRITICAL LEAK (P0). The AI provider API key was stored in
-- public.settings under key 'ai_provider', and public.settings has
-- an RLS read policy of USING (true) — deliberately kept that way by
-- migration 202609210001 ("store settings are public by design").
-- The anon key ships inside the mobile bundle, so ANY anonymous
-- person could read the paid provider credential with:
--
--   GET {SUPABASE_URL}/rest/v1/settings?select=value&key=eq.ai_provider
--       apikey: <public anon key already in the app>
--
-- The write path was protected (ai-settings requires a super_admin
-- JWT) but the READ path was not, so the exposure is real regardless.
--
-- This migration:
--   1. moves the credential into public.ai_provider_config, which has
--      RLS enabled, NO policies, and grants revoked from anon and
--      authenticated — only service_role (edge functions) can read it;
--   2. makes public.settings unreadable for secret-shaped keys, so a
--      future secret cannot leak through the same policy;
--   3. blocks secret-shaped keys from ever being written to
--      public.settings again;
--   4. repairs app_settings RLS, which still checked profiles.role =
--      'admin' — a value dropped from the user_role enum, so those
--      policies matched nobody.
--
-- AFTER APPLYING: ROTATE THE PROVIDER API KEY. Assume the previous
-- key is compromised; containment stops future reads, it cannot undo
-- a key that was already public.
--
-- SAFE TO RUN MULTIPLE TIMES: every step is conditional.
-- ============================================================

-- ─── 1. Dedicated, non-readable secret store ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_provider_config (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    base_url TEXT NOT NULL DEFAULT '',
    api_key  TEXT NOT NULL DEFAULT '',
    model    TEXT NOT NULL DEFAULT '',
    is_configured BOOLEAN NOT NULL DEFAULT false,
    updated_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_provider_config ENABLE ROW LEVEL SECURITY;

-- Supabase auto-grants new tables to anon/authenticated; revoke it, then add
-- NO policies, so RLS denies both roles completely. service_role bypasses RLS
-- and is the only role that can read this table (edge functions only).
REVOKE ALL ON public.ai_provider_config FROM anon, authenticated, public;
GRANT ALL ON public.ai_provider_config TO service_role;

-- ─── 2. Move the existing credential out of public.settings ──────────────
INSERT INTO public.ai_provider_config (id, base_url, api_key, model, is_configured, updated_at)
SELECT
    1,
    COALESCE(s.value->>'base_url', ''),
    COALESCE(s.value->>'api_key', ''),
    COALESCE(s.value->>'model', ''),
    COALESCE((s.value->>'is_configured')::boolean, false),
    COALESCE(s.updated_at, now())
FROM public.settings s
WHERE s.key = 'ai_provider'
  AND COALESCE(s.value->>'api_key', '') <> ''
ON CONFLICT (id) DO NOTHING;

-- Only remove the public row once the private copy exists (or when it held no
-- secret at all), so a failed copy can never destroy the configuration.
DELETE FROM public.settings
WHERE key = 'ai_provider'
  AND (
    EXISTS (SELECT 1 FROM public.ai_provider_config WHERE id = 1)
    OR COALESCE((SELECT value->>'api_key' FROM public.settings WHERE key = 'ai_provider'), '') = ''
  );

-- ─── 3. public.settings: never publicly readable for secret-shaped keys ──
-- Staff keep full visibility; customers/anon get the genuinely public store
-- settings (store_name, support_email, whatsapp_number, service_fee_pct,
-- exchange_rate, ...) and nothing that looks like a credential.
DROP POLICY IF EXISTS "settings_select" ON public.settings;
CREATE POLICY "settings_select" ON public.settings FOR SELECT
    USING (
        public.is_staff_or_admin()
        OR (
            key <> 'ai_provider'
            AND key !~* '(api[_-]?key|secret|token|password|passwd|credential|private[_-]?key)'
        )
    );

-- Write guard: reject secret-shaped keys before they can land here. Applies
-- to every role, including service_role, so a future feature cannot re-create
-- this leak by upserting a credential into the public table.
CREATE OR REPLACE FUNCTION public.settings_secret_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.key = 'ai_provider'
       OR NEW.key ~* '(api[_-]?key|secret|token|password|passwd|credential|private[_-]?key)' THEN
        RAISE EXCEPTION
            'ChinaSuuq: settings key "%" may not hold a secret; use public.ai_provider_config', NEW.key;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS settings_secret_guard_trigger ON public.settings;
CREATE TRIGGER settings_secret_guard_trigger
    BEFORE INSERT OR UPDATE ON public.settings
    FOR EACH ROW EXECUTE FUNCTION public.settings_secret_guard();

-- ─── 4. Repair dead app_settings policies ───────────────────────────────
-- app_settings (migration 202608140001) gated on profiles.role = 'admin',
-- which no longer exists in the user_role enum (customer, staff, super_admin).
-- The policies therefore matched nobody, leaving the table unusable while
-- looking configured. Point them at the canonical staff check.
DO $$
BEGIN
    IF to_regclass('public.app_settings') IS NULL THEN
        RETURN;
    END IF;

    ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Admins can read settings" ON public.app_settings;
    CREATE POLICY "Admins can read settings" ON public.app_settings FOR SELECT
        TO authenticated
        USING (public.is_staff_or_admin());

    DROP POLICY IF EXISTS "Admins can update settings" ON public.app_settings;
    CREATE POLICY "Admins can update settings" ON public.app_settings FOR UPDATE
        TO authenticated
        USING (public.is_staff_or_admin())
        WITH CHECK (public.is_staff_or_admin());

    DROP POLICY IF EXISTS "Admins can insert settings" ON public.app_settings;
    CREATE POLICY "Admins can insert settings" ON public.app_settings FOR INSERT
        TO authenticated
        WITH CHECK (public.is_staff_or_admin());

    -- Nothing may read a credential table anonymously.
    REVOKE ALL ON public.app_settings FROM anon;

    RAISE NOTICE 'app_settings RLS repaired (was gated on a dropped role: admin)';
END $$;

-- ─── 5. Confirmation helpers (run by hand after applying) ───────────────
-- Should return 0 rows for anon/authenticated and 1 row for service_role:
--   SELECT count(*) FROM public.ai_provider_config;
-- Should show ai_provider ABSENT from the public table:
--   SELECT key FROM public.settings ORDER BY key;
