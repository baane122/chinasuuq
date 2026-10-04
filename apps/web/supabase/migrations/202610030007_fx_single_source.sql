-- ============================================================
-- ChinaSuuq — Migration 202610030007: one exchange rate, one controller
-- 2026-10-03. Owner request: "1 rmb = 0.15$, 1$ = 6.6 — make only ONE place
-- in the admin that controls the exchange, and apply it in all the app screens."
--
-- THE CONTRACT (the whole codebase now follows this, in words):
--   exchange_rates.rate = how many units of `from_currency` equal ONE unit of
--   `to_currency`.  ('CNY','USD') = 6.6  →  USD = CNY / 6.6  →  1 CNY = $0.1515
--                            ('SOS','USD') = 530 → SOS = USD * 530
--   There is exactly ONE active row per pair. Every reader takes it through
--   public.fx_rates() so nobody re-implements the ordering, the bounds or the
--   upside-down guard.
--
-- WHY EACH PART IS HERE (all three were real money bugs, not tidying):
--   1. RLS: exchange_rates had ONLY `exchange_rates_admin_all`
--      (USING is_staff_or_admin()). The mobile app talks to this table with the
--      anon key / a customer JWT, so every phone read came back EMPTY and the
--      app silently converted prices with its own hardcoded 7.25 instead of the
--      rate the admin sets. That is why "the admin controls it" was untrue.
--      → a public SELECT policy over is_active rows only (a market rate is not
--        secret; inactive history stays staff-only).
--   2. Two active CNY→USD rows existed on live (6.68 and 7.0), so readers that
--      order differently picked different rates. → newest-first cleanup, then a
--      partial unique index + a BEFORE trigger that deactivates siblings, so
--      "which rate is live" has exactly one answer at the database level.
--   3. An admin can type 0.15 into a field that means 6.6 (they quote the pair
--      the other way round). The trigger flips a sub-1 value for the two pairs
--      this app owns, where a rate below 1 is never real. Without this, a
--      mistyped 0.15 makes every ¥ price 45× too cheap and we lose money on
--      every order.
--   4. `settings` row key 'exchange_rate' = {"cny_to_usd":0.15,...} is a SECOND
--      store with the OPPOSITE direction, read by nobody. It stops being a
--      source of truth here (deleted at the bottom); Admin → Settings is now
--      the UI that writes exchange_rates.
--   5. fx_service_fee_pct(): the settings row is seeded as PERCENT POINTS (5)
--      by 202609260001-era seeds and as a FRACTION (0.05) by 202610030004, and
--      submit_mobile_order multiplies by a value the phone sends. Normalize both
--      shapes into a fraction in one place so the server can decide the fee.
-- ============================================================

-- ─── 1. Public read of the live rate ─────────────────────────────
DROP POLICY IF EXISTS exchange_rates_public_read ON public.exchange_rates;
CREATE POLICY exchange_rates_public_read ON public.exchange_rates
    FOR SELECT TO anon, authenticated, service_role
    USING (is_active = true);

-- ─── 2. Exactly one active row per pair ──────────────────────────
-- Newest effective row wins; older duplicates become history.
WITH ranked AS (
    SELECT id, row_number() OVER (
        PARTITION BY from_currency, to_currency
        ORDER BY effective_from DESC, created_at DESC, id
    ) AS rn
    FROM public.exchange_rates
    WHERE is_active
)
UPDATE public.exchange_rates e
   SET is_active = false
  FROM ranked r
 WHERE e.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS exchange_rates_one_active_per_pair
    ON public.exchange_rates (from_currency, to_currency)
 WHERE is_active;

CREATE OR REPLACE FUNCTION public.exchange_rates_normalize_live_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- A quote below 1 for these pairs is always the pair typed upside down
    -- (0.15 entered where 6.6 belongs). Flip it rather than let it poison every
    -- price in the app. Any other pair is left exactly as written.
    IF NEW.rate > 0 AND NEW.rate < 1 THEN
        IF (NEW.from_currency = 'CNY' AND NEW.to_currency = 'USD')
           OR (NEW.from_currency = 'SOS' AND NEW.to_currency = 'USD') THEN
            NEW.rate := round(1.0 / NEW.rate, 6);
            NEW.reason := coalesce(NEW.reason, '') ||
                ' | stored as ' || NEW.from_currency || ' per 1 ' || NEW.to_currency;
        END IF;
    END IF;

    -- One active row per pair: keep the newest, retire its siblings. The sibling
    -- UPDATE re-enters this trigger with is_active = false, which the WHEN
    -- clause below skips, so there is no recursion.
    IF NEW.is_active THEN
        UPDATE public.exchange_rates s
           SET is_active = false
          FROM (SELECT id FROM public.exchange_rates
                  WHERE is_active AND id <> NEW.id
                    AND from_currency = NEW.from_currency
                    AND to_currency = NEW.to_currency) d
         WHERE s.id = d.id;
    END IF;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS exchange_rates_normalize_live_row ON public.exchange_rates;
CREATE TRIGGER exchange_rates_normalize_live_row
    BEFORE INSERT OR UPDATE ON public.exchange_rates
    FOR EACH ROW
    WHEN (NEW.is_active)
    EXECUTE FUNCTION public.exchange_rates_normalize_live_row();

-- ─── 3. Seed the SOS pair so the app's SOS display uses the same control ──
INSERT INTO public.exchange_rates (from_currency, to_currency, rate, reason, is_active)
SELECT 'SOS', 'USD', 530, 'Seeded by 202610030007 (fx single source)', true
 WHERE NOT EXISTS (
    SELECT 1 FROM public.exchange_rates
     WHERE from_currency = 'SOS' AND to_currency = 'USD' AND is_active
);

-- ─── 4. The single reader every client and RPC goes through ──────
-- SECURITY DEFINER so it also answers when the caller's role has no SELECT on
-- the table; it exposes one market rate and the service fee, nothing else.
-- Bounds: an out-of-range row is a typo, so it falls back to the seeded default
-- instead of being used for money.
CREATE OR REPLACE FUNCTION public.fx_rates()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
        v_cny := 6.6;
    ELSIF v_cny < 1 THEN            -- belt and braces over the trigger
        v_cny := 1.0 / v_cny;
    ELSIF v_cny < 2 OR v_cny > 20 THEN
        v_cny := 6.6;              -- implausible: refuse to bill on it
    END IF;

    IF v_sos IS NULL OR v_sos <= 0 OR v_sos < 100 OR v_sos > 5000 THEN
        v_sos := 530;
    END IF;

    -- The fee exists in two historical shapes: 5 (percent points) and 0.05
    -- (fraction). Anything above 1 is percent points.
    SELECT (CASE WHEN jsonb_typeof(value) = 'number' THEN value#>>'{}'
                 ELSE NULL END)::numeric INTO v_fee
      FROM public.settings
     WHERE key = 'service_fee_pct';

    IF v_fee IS NULL OR v_fee < 0 THEN
        v_fee := 0.05;
    ELSIF v_fee > 1 THEN
        v_fee := v_fee / 100.0;
    END IF;
    IF v_fee > 0.5 THEN            -- 50% is not a service fee, it is a typo
        v_fee := 0.05;
    END IF;

    RETURN jsonb_build_object(
        'cny_per_usd',     round(v_cny, 4),
        'usd_per_cny',     round(1.0 / v_cny, 6),
        'sos_per_usd',     round(v_sos, 2),
        'service_fee_pct', round(v_fee, 4),
        'currency_chain',  'CNY -> USD -> SOS'
    );
END $$;

CREATE OR REPLACE FUNCTION public.fx_cny_per_usd()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT (public.fx_rates() ->> 'cny_per_usd')::numeric;
$$;

CREATE OR REPLACE FUNCTION public.fx_service_fee_pct()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT (public.fx_rates() ->> 'service_fee_pct')::numeric;
$$;

REVOKE EXECUTE ON FUNCTION public.fx_rates(), public.fx_cny_per_usd(), public.fx_service_fee_pct()
    FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fx_rates(), public.fx_cny_per_usd(), public.fx_service_fee_pct()
    TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.fx_rates() IS
  'ChinaSuuq: the only exchange-rate reader. {cny_per_usd, usd_per_cny, sos_per_usd, service_fee_pct}. '
  'exchange_rates.rate means "units of from_currency per 1 to_currency"; one active row per pair.';

-- ─── 5. Retire the competing store ───────────────────────────────
-- settings key 'exchange_rate' held {"cny_to_usd":0.15,"cny_to_sos":79.5} in the
-- OPPOSITE direction and was read by no code. Keeping it invites the next
-- inversion bug.
DELETE FROM public.settings WHERE key = 'exchange_rate';
