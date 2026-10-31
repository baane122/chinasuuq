-- 202610310011: submit_mobile_order must refuse a deactivated account
--
-- 202610310010 put `is_active_account()` on the orders INSERT policy, but
-- `submit_mobile_order` is SECURITY DEFINER — it runs as the table owner and
-- therefore does not evaluate RLS at all. Verified live: with the customer's
-- profile set to is_active=false, the RPC still returned a created order:
--   {"id": "65133724-…", "reference": "AUDIT-RPC-DEACT", "total_usd": 10.50, …}
--
-- The only place to stop this is inside the function. Rather than re-typing 200
-- lines of money-calculation logic (a rewrite nobody could review against the
-- original), the existing body is renamed to an internal implementation and a
-- thin, gated wrapper takes its public name. The implementation keeps its own
-- auth check, so both layers stay honest if the wrapper is ever bypassed.

ALTER FUNCTION public.submit_mobile_order(text, text, text, text, text, numeric, jsonb)
  RENAME TO _submit_mobile_order_impl;

REVOKE ALL ON FUNCTION public._submit_mobile_order_impl(text, text, text, text, text, numeric, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_mobile_order(
  p_reference text,
  p_shipping_method text,
  p_delivery_address text,
  p_destination_city text,
  p_notes text,
  p_service_fee_pct numeric,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ChinaSuuq: submit_mobile_order requires a signed-in customer'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_uid AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'ChinaSuuq: this account is not active'
      USING ERRCODE = '42501';
  END IF;

  RETURN public._submit_mobile_order_impl(
    p_reference, p_shipping_method, p_delivery_address,
    p_destination_city, p_notes, p_service_fee_pct, p_items
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_mobile_order(text, text, text, text, text, numeric, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_mobile_order(text, text, text, text, text, numeric, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.submit_mobile_order(text, text, text, text, text, numeric, jsonb) IS
  'Mobile checkout entry point. SECURITY DEFINER, so it must check account status itself: RLS does not run inside it.';
