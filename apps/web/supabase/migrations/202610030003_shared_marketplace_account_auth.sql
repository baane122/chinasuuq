-- ============================================================
-- ChinaSuuq — Migration 202610030003: harden get_shared_marketplace_account
-- 2026-10-03 (audit §2 Marketplaces / §5 fix 2 "CRITICAL shared-credential
-- leak"; §6 J)
--
-- WHAT 202609240001 SHIPPED: a SECURITY DEFINER SQL function granted to
-- ANON that returns the shared marketplace login (username + plaintext
-- password from password_encrypted) for anyone who asks, plus a seeded
-- credential ('15277078888' / 'a123456', L39–46). It also hardcoded
-- `null::text as cookies` (L24) even though the admin cookie editor writes
-- a real cookies column on LIVE (audit §2: "the RPC … nulls the cookies →
-- cookie injection can silently no-op").
--
-- NEW CONTRACT (per the audit compromise — mobile keeps working for staff,
-- anon is locked out):
--  * SECURITY DEFINER is kept (the table's own RLS, 202408010013 L29–42,
--    would otherwise leak the same rows to every authenticated customer
--    anyway; this function is the choke point).
--  * REVOKE from anon + PUBLIC. GRANT stays to authenticated (the admin web
--    and staff mobile sessions call it with a user JWT) and service_role —
--    "customers may execute but get zero rows" is enforced INSIDE the
--    function: the caller must hold a verified user session whose
--    profiles.role is staff/super_admin (plus 'admin' for the pre-
--    202609210001 enum, which no longer exists on live — harmless).
--  * Returns exactly the row shape mobile already expects
--    (apps/mobile/src/lib/supabase.ts L33–41: id, marketplace, username,
--    password, cookies?, is_active, last_refreshed_at). NOT edited here.
--  * The cookies defect is fixed at runtime: if the live table has a
--    cookies column (it does per the admin editor; 202408010013 does not)
--    its value is returned cast to text ("name=val; name2=val2" per
--    mobile's cookieInjectScript); otherwise NULL, same as before.
--    ASSUMPTION (labelled): live cookies column is text or text-castable.
--
-- MOBILE IMPACT — STATED ON PURPOSE: guest (logged-out) WebView auto-login
-- via this RPC STOPS WORKING. That is the intended product decision: guests
-- browse the PUBLIC marketplace; LOGGED-IN customers keep the invisible
-- auto-login through the cookies-only RPC in 202610030006
-- (get_marketplace_session), which never returns username/password.
-- Staff log into the marketplace in-app and sync the session cookie.
-- Guests already have a fallback — getMarketplaceAccount() returns null and
-- the login-wall banner shows (audit §1 row 4).
--
-- The seeded plaintext credential is REMOVED: it was inserted only by
-- 202609240001 L39–46 and is exactly identifiable; it must not remain in
-- any table now that anon can no longer read it (it is still in migration
-- history — rotate it on the real 1$ Dollar Store account too).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_shared_marketplace_account(p_marketplace text)
RETURNS TABLE (
  id uuid,
  marketplace text,
  username text,
  password text,
  cookies text,
  is_active boolean,
  last_refreshed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    -- (a) Anon and any caller without a verified user session: zero rows.
    -- auth.jwt()/auth.uid() read the request JWT set by the Supabase gateway.
    IF auth.uid() IS NULL
       OR COALESCE(auth.jwt() ->> 'role', '') <> 'authenticated' THEN
        RETURN;
    END IF;

    -- (b) Customers (and anything that is not staff) also get zero rows.
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role::text IN ('staff', 'super_admin', 'admin')
    ) THEN
        RETURN;
    END IF;

    -- (c) Staff: the live shape, cookies included when the column exists
    -- (dynamic so this migration applies to 202408010013's table too).
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'marketplace_accounts'
          AND column_name = 'cookies'
    ) THEN
        RETURN QUERY EXECUTE
            'SELECT a.id, a.marketplace_type::text, a.username, a.password_encrypted, '
            || 'a.cookies::text, a.is_active, a.updated_at '
            || 'FROM public.marketplace_accounts a '
            || 'WHERE a.marketplace_type = $1 AND a.is_active = true AND a.is_shared = true '
            || 'ORDER BY a.created_at DESC LIMIT 1'
            USING p_marketplace;
    ELSE
        RETURN QUERY
            SELECT a.id, a.marketplace_type::text, a.username, a.password_encrypted,
                   NULL::text, a.is_active, a.updated_at
            FROM public.marketplace_accounts a
            WHERE a.marketplace_type = p_marketplace
              AND a.is_active = true
              AND a.is_shared = true
            ORDER BY a.created_at DESC
            LIMIT 1;
    END IF;
END
$fn$;

-- The old definition was granted to anon; take that away explicitly (and
-- PUBLIC as defence in depth), then (re)grant the sessions that legitimately
-- call it. Customers keep EXECUTE because Postgres roles cannot name
-- "non-customer authenticated"; the customer-facing result is zero rows via
-- the profile check above.
REVOKE ALL ON FUNCTION public.get_shared_marketplace_account(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shared_marketplace_account(text) TO authenticated, service_role;

-- Strip the seeded plaintext credential (username/password pair from
-- 202609240001 L39–46) WITHOUT deleting the row: the shared-account row is
-- now the cookie store for the session-bridging model (migration
-- 202610030006), so it must survive. Staff who legitimately need the
-- password use the staff-gated RPC above; the plaintext pair that a
-- migration seeded for nobody in particular is gone. NOTE: rotate the real
-- 1$ Dollar Store account password too — it lives in migration history.
UPDATE public.marketplace_accounts
SET password_encrypted = NULL,
    updated_at = now()
WHERE marketplace_type = 'dollarstore'
  AND username = '15277078888'
  AND password_encrypted = 'a123456';
