-- ============================================================
-- ChinaSuuq — Migration 202610030006: marketplace SESSION bridging
-- 2026-10-03 (user decision: "admin logs the shared account in once, keeps
-- the cookies there; mobile WebViews inherit the session — nobody but staff
-- ever sees credentials again")
--
-- MODEL
--  * credentials (username/password)  → staff only (0003 tightened RPC)
--  * session cookies                  → any LOGGED-IN ChinaSuuq user, via
--    the cookies-only RPC below; guests get zero rows and browse publicly.
--  * adding to cart already requires a ChinaSuuq login app-side, so the
--    session bridge is only ever held by identified users.
--
-- LIVE SHAPE PROBED 2026-10-03 (do not assume repo migrations):
--   marketplace_accounts(id, marketplace_type text, account_label, username,
--   password_encrypted, phone, email, notes, is_shared bool, is_active bool,
--   created_by uuid, created_at, updated_at, cookies text,
--   cookies_updated_at timestamptz, last_verified_at timestamptz, health text)
--   — one shared row: dollarstore. `cookies` is "name=val; name2=val2".
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- REVOKE/GRANT are re-runnable.
-- ============================================================

ALTER TABLE public.marketplace_accounts
    ADD COLUMN IF NOT EXISTS cookies_updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_shared
    ON public.marketplace_accounts(marketplace_type)
    WHERE is_shared = true AND is_active = true;

-- ─── The cookies-only session RPC ──────────────────────────────────────
-- SECURITY DEFINER: the table's own RLS would let every authenticated
-- customer read the whole row (including password_encrypted) — this
-- function is deliberately the ONLY door customers walk through, and it
-- cannot return more than the four columns below.
CREATE OR REPLACE FUNCTION public.get_marketplace_session(p_marketplace text)
RETURNS TABLE (
  marketplace        text,
  cookies            text,
  cookies_updated_at timestamptz,
  health             text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT a.marketplace_type::text,
           a.cookies::text,
           a.cookies_updated_at,
           a.health::text
    FROM public.marketplace_accounts a
    WHERE a.marketplace_type = p_marketplace
      AND a.is_shared = true
      AND a.is_active = true
      -- a live, non-empty session is the whole point of this RPC
      AND a.cookies IS NOT NULL AND a.cookies <> ''
      -- caller gate: verified user session only (anon → zero rows).
      -- ANY role in profiles qualifies: this is the session bridge for
      -- logged-in customers, by product decision 2026-10-03.
      AND auth.uid() IS NOT NULL
      AND COALESCE(auth.jwt() ->> 'role', '') = 'authenticated'
      AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role::text IN ('customer','staff','super_admin','admin')
      )
    LIMIT 1
$fn$;

REVOKE ALL ON FUNCTION public.get_marketplace_session(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_marketplace_session(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_marketplace_session(text) IS
  'Cookies-only marketplace session bridge for signed-in ChinaSuuq users. Never returns credentials. Guests and unknown roles get zero rows.';
