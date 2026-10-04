-- ONE RATE, EVEN IN THE STORED COLUMN.
--
-- `source_products.price_usd_estimated` is a dollar figure somebody computed at
-- import time, so it silently drifts the moment Admin → Settings saves a new
-- rate. Verified against production just before this migration: all 15 catalog
-- rows carried a yuan figure, and all 15 dollar figures disagreed with
-- yuan / 6.66 — between 11% and 20% too high (e.g. ¥25 stamped as $4.50 when the
-- live rate gives $3.75). The app now derives the price the customer sees from
-- the yuan figure, but the admin's Products table and Mission Control still read
-- the column, so the column itself has to stop being an opinion.
--
-- This makes the yuan figure the only price a writer sets and the dollar figure
-- a stamp the database takes from the owner's rate. Whatever a client sends in
-- `price_usd_estimated` is overwritten — which is also what keeps the Products
-- editor's dollar box from becoming a second, competing rate control.
--
-- Rows with no yuan figure are left alone on purpose: a curated USD-native
-- listing (the 1$ Dollar Store) legitimately has a dollar price and no yuan, and
-- dividing it by the CNY rate would turn $5 into $0.75.
CREATE OR REPLACE FUNCTION public.source_products_stamp_usd()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_rate numeric;
BEGIN
    IF NEW.price_cny_min IS NOT NULL AND NEW.price_cny_min > 0 THEN
        SELECT (public.fx_rates() ->> 'cny_per_usd')::numeric INTO v_rate;
        IF v_rate IS NULL OR v_rate <= 0 THEN
            v_rate := 6.66;
        END IF;
        NEW.price_usd_estimated := round(NEW.price_cny_min / v_rate, 2);
    END IF;
    RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS source_products_stamp_usd ON public.source_products;
CREATE TRIGGER source_products_stamp_usd
    BEFORE INSERT OR UPDATE OF price_cny_min ON public.source_products
    FOR EACH ROW
    EXECUTE FUNCTION public.source_products_stamp_usd();

-- Bring today's catalog onto the owner's rate. Setting only the dollar column
-- does not re-fire the trigger (it watches price_cny_min), so this is a plain
-- one-time restamp.
UPDATE public.source_products
   SET price_usd_estimated = round(
         price_cny_min / COALESCE((public.fx_rates() ->> 'cny_per_usd')::numeric, 6.66),
         2
       )
 WHERE coalesce(price_cny_min, 0) > 0
   AND coalesce(price_usd_estimated, -1)
       <> round(price_cny_min / COALESCE((public.fx_rates() ->> 'cny_per_usd')::numeric, 6.66), 2);
