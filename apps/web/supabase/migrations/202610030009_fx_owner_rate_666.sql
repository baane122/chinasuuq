-- Owner's single exchange control, 2026-10-03:
--   "1 USD = 6.66 CNY"  (so 1 CNY = $0.1502)
-- One number, one place: the admin Settings → Currency screen writes this row and
-- every screen in the app and every edge function reads it through fx_rates().
-- The shilling row is deliberately LEFT ALONE at 530 — it is not an admin control
-- any more (the owner asked for only one rate to manage); it exists so checkout
-- can still show Somali prices. Nothing else writes a rate.
UPDATE public.exchange_rates
   SET rate = 6.66,
       reason = 'Owner setting 2026-10-03: 1 USD = 6.66 CNY (1 CNY = $0.1502)',
       effective_from = now()
 WHERE is_active
   AND from_currency = 'CNY'
   AND to_currency = 'USD';

-- fx_rates() hardened: the upside-down flip was not re-bounded.
-- A row stored as 0.01 flipped to 100 and was returned as a live rate, because
-- the 2..20 plausibility check sat in the ELSE branch of the flip. Now every
-- path — stored, flipped, or absent — passes through the same band, so an
-- implausible number can never reach a price. Bounds mirror src/lib/fx.ts on
-- both clients; move them together.
CREATE OR REPLACE FUNCTION public.fx_rates()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_cny numeric;
    v_sos numeric;
    v_fee numeric;
BEGIN
    SELECT rate INTO v_cny FROM public.exchange_rates
     WHERE is_active AND from_currency = 'CNY' AND to_currency = 'USD'
     ORDER BY effective_from DESC LIMIT 1;

    SELECT rate INTO v_sos FROM public.exchange_rates
     WHERE is_active AND from_currency = 'SOS' AND to_currency = 'USD'
     ORDER BY effective_from DESC LIMIT 1;

    -- A rate typed the wrong way round (0.15 where 6.66 belongs) is flipped
    -- first, then judged. Both steps, in that order, for both pairs.
    IF v_cny IS NULL OR v_cny <= 0 THEN
        v_cny := 6.6;
    ELSIF v_cny < 1 THEN
        v_cny := 1.0 / v_cny;
    END IF;
    IF v_cny < 2 OR v_cny > 20 THEN
        v_cny := 6.6;
    END IF;

    IF v_sos IS NULL OR v_sos <= 0 THEN
        v_sos := 530;
    ELSIF v_sos < 1 THEN
        v_sos := 1.0 / v_sos;
    END IF;
    IF v_sos < 100 OR v_sos > 5000 THEN
        v_sos := 530;
    END IF;

    SELECT (CASE WHEN jsonb_typeof(value) = 'number' THEN value#>>'{}'
                 ELSE NULL END)::numeric INTO v_fee
      FROM public.settings
     WHERE key = 'service_fee_pct';

    IF v_fee IS NULL OR v_fee < 0 THEN
        v_fee := 0.05;
    ELSIF v_fee > 1 THEN
        v_fee := v_fee / 100.0;
    END IF;
    IF v_fee > 0.5 THEN
        v_fee := 0.05;
    END IF;

    RETURN jsonb_build_object(
        'cny_per_usd',     round(v_cny, 4),
        'usd_per_cny',     round(1.0 / v_cny, 6),
        'sos_per_usd',     round(v_sos, 2),
        'service_fee_pct', round(v_fee, 4),
        'currency_chain',  'CNY -> USD -> SOS'
    );
END
$function$;
