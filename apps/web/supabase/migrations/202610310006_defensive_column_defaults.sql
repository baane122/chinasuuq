-- 202610310006: schema-level defaults so a client cannot re-break these writes
--
-- Each of these columns caused a real, verified production failure during the
-- 2026-10-31 audit. In every case the *page* was fixed, but the column was left
-- with no default, so the next client (a new screen, an edge function, a curl)
-- could reproduce the same failure. These defaults move the invariant into the
-- database where it belongs. Every one is backward compatible: existing rows are
-- untouched and an explicit value still wins.

-- ── quotes: NOT NULL, no default. A quote without a reference or an expiry was
-- rejected with 23502, and the admin Quotes page never sent either one.
CREATE OR REPLACE FUNCTION public.quote_reference_default()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_suffix text := '';
  i integer;
BEGIN
  FOR i IN 1..4 LOOP
    v_suffix := v_suffix || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
  END LOOP;
  RETURN 'QT-' || to_char(now(), 'YYYYMMDD') || '-' || v_suffix;
END;
$$;

ALTER TABLE public.quotes
  ALTER COLUMN reference SET DEFAULT public.quote_reference_default(),
  ALTER COLUMN valid_until SET DEFAULT (now() + interval '14 days');

-- ── quote_items.subtotal_cny: NOT NULL with no default. The Sourcing drawer's
-- insert omitted it and every line failed with 23502. Derive it when absent.
CREATE OR REPLACE FUNCTION public.quote_items_fill_subtotal()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.subtotal_cny IS NULL THEN
    NEW.subtotal_cny := ROUND(COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price_cny, 0), 2);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_items_fill_subtotal ON public.quote_items;
CREATE TRIGGER quote_items_fill_subtotal
  BEFORE INSERT OR UPDATE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.quote_items_fill_subtotal();

-- ── shipments.total_packages: NOT NULL (already DEFAULT 0), but an explicit
-- NULL from a form bypasses the default and violates the constraint. Treat a
-- null count as "not counted yet" = 0 rather than rejecting the shipment.
CREATE OR REPLACE FUNCTION public.shipments_coerce_packages()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.total_packages IS NULL THEN
    NEW.total_packages := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shipments_coerce_packages ON public.shipments;
CREATE TRIGGER shipments_coerce_packages
  BEFORE INSERT OR UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.shipments_coerce_packages();

-- ── source_products.source_url: NOT NULL with no default. A hand-added product
-- has no supplier link, so the create failed with 23502. Store an explicit
-- manual marker instead of inventing a marketplace URL.
CREATE OR REPLACE FUNCTION public.source_products_fill_source_url()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.source_url IS NULL OR btrim(NEW.source_url) = '' THEN
    NEW.source_url := 'https://manual.chinasuuq.com/product/'
      || COALESCE(NULLIF(btrim(NEW.source_product_id), ''), 'unknown');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS source_products_fill_source_url ON public.source_products;
CREATE TRIGGER source_products_fill_source_url
  BEFORE INSERT OR UPDATE ON public.source_products
  FOR EACH ROW EXECUTE FUNCTION public.source_products_fill_source_url();
