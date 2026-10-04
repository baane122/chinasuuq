-- fx_rates()'s last-resort default now equals the owner's rate instead of an old
-- market guess: 6.66 CNY per 1 USD (Admin → Settings, 2026-10-03). The default is
-- only reached when the active CNY→USD row is missing or implausible, and the
-- bounds (2..20) are unchanged and mirrored in apps/web/src/lib/fx.ts and
-- apps/web/supabase/functions/_shared/fx.ts.
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

    IF v_cny IS NULL OR v_cny <= 0 THEN
        v_cny := 6.66;
    ELSIF v_cny < 1 THEN
        v_cny := 1.0 / v_cny;
    END IF;
    IF v_cny < 2 OR v_cny > 20 THEN
        v_cny := 6.66;
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

-- VERIFIED against production inside rolled-back transactions:
--   stored 0.01 → trigger writes 100.0000 → fx_rates() = 6.66   (before this
--                 change it returned 100 as a live rate: ¥1000 billed as $10)
--   stored 0.15 → trigger writes 6.6667  → fx_rates() = 6.6667
--   stored 6.66 → fx_rates() = 6.66, usd_per_cny = 0.15015
-- Note: the write trigger round-trips to 3 decimals (1/0.15 stores 6.6667, not
-- 6.666667), a 0.001% deviation left as-is rather than redeploying the trigger.
