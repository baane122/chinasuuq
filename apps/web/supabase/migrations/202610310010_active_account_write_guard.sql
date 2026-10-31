-- 202610310010: a deactivated account must not be able to write
--
-- 202610310009 revokes sessions when `is_active` flips to false, which closes
-- the account out within one token lifetime. This closes the remaining window
-- (the access token already in memory) at the database, for the writes that
-- matter: an order costs the business money, and a deactivated customer placing
-- one is the exact case the admin Delete button is supposed to prevent.
--
-- Verified before the fix (real `authenticated` claims for a deactivated
-- customer): INSERT INTO orders … RETURNING id succeeded.
--
-- Only the INSERT policy changes. Reads and updates already stop because the
-- SELECT policy needs the row to be visible and `is_active` sessions are gone;
-- and customers keep their history available to STAFF, which is what the
-- Customers page needs.

CREATE OR REPLACE FUNCTION public.is_active_account()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM public.profiles p
         WHERE p.id = auth.uid()
           AND p.is_active IS TRUE
    );
$function$;

DROP POLICY IF EXISTS orders_anon_insert ON public.orders;
CREATE POLICY orders_anon_insert ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_active_account()
  );

COMMENT ON POLICY orders_anon_insert ON public.orders IS
  'Own orders only, and only while the account is active. The old policy also '
  'allowed user_id IS NULL and anon inserts; the table-level grant for anon is '
  'gone (cart checkout requires sign-in), so neither arm was reachable.';
