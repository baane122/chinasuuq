-- ============================================================
-- ChinaSuuq — Migration: give source_products the display columns
--             both clients already speak
-- 2026-09-25
--
-- WHY THIS EXISTS. The real products table (202408010004) stores what a
-- marketplace lists: source_title, source_description, source_images,
-- source_price, in_stock, seller_rating. Both apps instead read and write a
-- CURATED view of that: title_english, images, price_cny_min, stock_status,
-- sales_count… Columns that exist in no migration. PostgREST rejects an
-- statement containing one unknown column with 42703 for the WHOLE statement,
-- so every path below has been failing, quietly, since it was written:
--
--   admin products page  insert/update  → "Failed to save product", always.
--   admin product search or(title_english.ilike…) → empty result list.
--   admin dashboard      eq('stock_status','low_stock') → count reads 0.
--   mobile curated list  eq('stock_status')+order('sales_count') → falls back
--                        to the on-device cache, so a WebView-blocked user
--                        sees nothing from the server.
--   admin_kpis()         products_in_stock names stock_status inside dynamic
--                        SQL — not checked at CREATE time — so the function
--                        installs happily and then aborts Mission Control on
--                        its first call.
--
-- And because no write ever succeeded, the table has stayed EMPTY in
-- production. That is the root cause behind "the marketplace screens don't
-- work": there was no server-side catalog to show.
--
-- 202408010014 already set the precedent ("Add missing columns for mobile
-- writes" — it is what gave this table its `marketplace` TEXT column). This
-- file finishes that job. The marketplace originals stay authoritative:
-- source_* is what the supplier lists, the new columns are the human/machine
-- curated translation of it, and nothing here overwrites a value staff set.
-- ============================================================

-- ─── 1. Curated display columns ──────────────────────────────────
ALTER TABLE public.source_products
  ADD COLUMN IF NOT EXISTS title_english         TEXT,
  ADD COLUMN IF NOT EXISTS title_somali          TEXT,
  ADD COLUMN IF NOT EXISTS title_original        TEXT,
  ADD COLUMN IF NOT EXISTS description_english   TEXT,
  ADD COLUMN IF NOT EXISTS description_somali    TEXT,
  ADD COLUMN IF NOT EXISTS description_original  TEXT,
  ADD COLUMN IF NOT EXISTS category              TEXT,
  ADD COLUMN IF NOT EXISTS images                TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS attributes            JSONB   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS price_cny_min         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS price_cny_max         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS price_usd_estimated   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS domestic_shipping_cny NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_status          TEXT,
  ADD COLUMN IF NOT EXISTS sales_count           INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_rating       NUMERIC(4,2);

-- The apps type this as a three-value union, and the low-stock counter is an
-- equality test, so a typo ('out_stock') would silently drop a product from
-- every stock screen. Same no-legacy-data reasoning as 202609250003: the table
-- is empty in production, so the constraint cannot fail on existing rows.
DO $$ BEGIN
    ALTER TABLE public.source_products
      ADD CONSTRAINT source_products_stock_status_check
      CHECK (stock_status IS NULL
             OR stock_status IN ('in_stock','low_stock','out_of_stock'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Backfill the curated view from the marketplace originals ───
-- Only NULLs/empties are filled: an admin edit must survive a re-run.
-- Guarded because the harness proves this file against generations that may
-- lack one of the source_* columns, and a plain UPDATE would abort the
-- migration over a convenience backfill.
DO $$
DECLARE
    v_src boolean;
BEGIN
    SELECT count(*) = 6 INTO v_src
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'source_products'
       AND column_name IN ('source_title','source_description','source_images',
                           'source_price','in_stock','seller_rating');

    IF NOT v_src THEN
        RAISE NOTICE 'ChinaSuuq: source_products lacks the full 202408010004 source_* set — display columns added, backfill skipped';
        RETURN;
    END IF;

    UPDATE public.source_products SET
        title_english    = COALESCE(NULLIF(title_english, ''),   NULLIF(title_original,''), source_title),
        title_original   = COALESCE(NULLIF(title_original, ''),  source_title),
        -- description_english is deliberately NOT filled from source_description
        -- (unlike the title, where one supplier-written string is the only name
        -- the card has). The original is a Chinese listing; calling it an English
        -- description would mislabel what the reader is about to see and block
        -- the translator that owns that column. ai-translate writes it.
        description_original= COALESCE(NULLIF(description_original,''), source_description),
        images           = CASE WHEN images IS NULL OR cardinality(images) = 0
                                THEN COALESCE(source_images, '{}'::text[])
                                ELSE images END,
        price_cny_min    = COALESCE(price_cny_min, source_price),
        price_cny_max    = COALESCE(price_cny_max, price_cny_min, source_price),
        -- price_usd_estimated is deliberately NOT derived. A migration has no
        -- business freezing today's exchange rate into a row: the number would
        -- be wrong the moment the rate moves and would then outlive any record
        -- of where it came from. It stays NULL until a person, the enricher, or
        -- the settings-derived reader supplies it, and the clients compute a
        -- display estimate at read time instead.
        stock_status     = COALESCE(stock_status,
                                    CASE WHEN in_stock IS FALSE THEN 'out_of_stock' ELSE 'in_stock' END),
        supplier_rating  = COALESCE(supplier_rating, seller_rating),
        sales_count      = COALESCE(sales_count, 0)
     WHERE title_english IS NULL
        OR title_original IS NULL
        OR images IS NULL OR cardinality(images) = 0
        OR price_cny_min IS NULL
        OR stock_status IS NULL;
END $$;

-- ─── 3. Let a hand-added product exist at all ───────────────────
-- The base table declared marketplace_id and source_id NOT NULL because every
-- row was an importer row. Since 202408010014 the apps link catalog rows by the
-- TEXT `marketplace` instead, and an admin-added product has neither a
-- marketplace FK row to point at nor a supplier offer id. With the constraint in
-- place Postgres answered the admin's create with 23502 ("null value in column
-- marketplace_id") — so relaxing it is what makes the form usable, not cosmetic.
--
-- The foreign key itself stays: a row that does name a marketplace must name a
-- real one. The UNIQUE(marketplace_id, source_id) importer dedupe key keeps
-- working, since Postgres treats NULLs as distinct there.
--
-- Guarded column by column, because these two only exist on the importer-shaped
-- generation this file was written for. The live project's source_products has
-- neither name (it uses source_product_id / marketplace), and an unguarded ALTER
-- against an absent column raises 42703 and aborts this whole file — the same
-- failure that took the admin save path down on every other statement here.
DO $$
DECLARE v_col text;
BEGIN
    FOREACH v_col IN ARRAY ARRAY['marketplace_id','source_id'] LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'source_products'
              AND column_name = v_col
        ) THEN
            EXECUTE format('ALTER TABLE public.source_products ALTER COLUMN %I DROP NOT NULL', v_col);
        ELSE
            RAISE NOTICE 'ChinaSuuq: source_products.% does not exist in this generation — NOT NULL relax skipped', v_col;
        END IF;
    END LOOP;
END $$;

-- ─── 4. Keep the two vocabularies from drifting apart ────────────
-- The backfill above is a one-time repair. Without this, every row an importer
-- writes AFTER this migration would carry source_title only and read as a blank
-- name on both clients — the exact symptom this file exists to end, one deploy
-- later. So on write, each curated field that is absent takes its value from the
-- marketplace original; a value a human or a model set is never touched.
--
-- Stock needs the opposite care. `in_stock` is the boolean importers write and
-- cart-validate gates on; `stock_status` is the curated three-state flag the
-- admin UI writes, which can say low_stock when a boolean cannot. So
-- stock_status wins whenever it is present (in_stock is derived from it, on
-- every write), and in_stock is only consulted to fill stock_status on insert.
-- No recursion: this trigger fires on stock_status changes and writes in_stock,
-- and nothing listens for in_stock.
CREATE OR REPLACE FUNCTION public._source_products_sync_display_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.stock_status IS NOT NULL THEN
        NEW.in_stock := (NEW.stock_status <> 'out_of_stock');
    END IF;

    IF TG_OP = 'INSERT' AND NEW.stock_status IS NULL THEN
        NEW.stock_status := CASE WHEN NEW.in_stock IS FALSE THEN 'out_of_stock' ELSE 'in_stock' END;
    END IF;

    IF coalesce(NEW.title_original, '') = '' THEN
        NEW.title_original := NEW.source_title;
    END IF;
    IF coalesce(NEW.title_english, '') = '' THEN
        NEW.title_english := coalesce(NULLIF(NEW.title_original, ''), NEW.source_title);
    END IF;
    IF coalesce(NEW.description_original, '') = '' THEN
        NEW.description_original := NEW.source_description;
    END IF;
    IF NEW.images IS NULL OR cardinality(NEW.images) = 0 THEN
        NEW.images := coalesce(NEW.source_images, '{}'::text[]);
    END IF;
    IF NEW.price_cny_min IS NULL THEN
        NEW.price_cny_min := NEW.source_price;
    END IF;
    IF NEW.price_cny_max IS NULL THEN
        NEW.price_cny_max := coalesce(NEW.price_cny_min, NEW.source_price);
    END IF;
    IF NEW.supplier_rating IS NULL THEN
        NEW.supplier_rating := NEW.seller_rating;
    END IF;
    IF NEW.sales_count IS NULL THEN
        NEW.sales_count := 0;
    END IF;
    RETURN NEW;
END $$;

DO $$
DECLARE
    v_ok boolean;
BEGIN
    -- The trigger body names every column it syncs, and plpgsql resolves those
    -- only when a row is written: installing it over a partial schema would turn
    -- a display nicety into "the catalog cannot be written to" for every insert.
    SELECT count(*) = 8 INTO v_ok
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'source_products'
       AND column_name IN ('in_stock','stock_status','source_title','source_description',
                           'source_images','source_price','seller_rating','images');

    IF NOT v_ok THEN
        RAISE NOTICE 'ChinaSuuq: source_products is missing an original or display column — display-field sync trigger skipped';
        RETURN;
    END IF;

    DROP TRIGGER IF EXISTS source_products_sync_display_fields ON public.source_products;
    CREATE TRIGGER source_products_sync_display_fields
      BEFORE INSERT OR UPDATE OF stock_status ON public.source_products
      FOR EACH ROW EXECUTE FUNCTION public._source_products_sync_display_fields();
END $$;

-- ─── 5. Indexes for the queries that use these columns ────────────
-- The mobile marketplace list and the admin low-stock counter both filter on
-- this pair; 202408010004 indexed marketplace_id, which is a different column.
CREATE INDEX IF NOT EXISTS idx_source_products_market_stock
  ON public.source_products(marketplace, stock_status);

-- Admin search is `%term%` ILIKE over four text columns, which no btree can
-- serve. Left un-indexed on purpose: the catalog is small enough that a scan
-- beats the write amplification of four trigram indexes. If it grows past a few
-- thousand rows, add `CREATE EXTENSION pg_trgm` plus an index per column here.

-- ─── 6. Locking ───────────────────────────────────────────────────
-- No new GRANTs: source_products is already anon-readable for status='active'
-- and staff-writable (202408010010), and these columns hold no secrets —
-- unlike marketplace_accounts, which is why that table needed 202609240001.

COMMENT ON COLUMN public.source_products.title_english IS
  'Curated display title. Defaults from source_title on write (trigger source_products_sync_display_fields); an explicit value is never replaced.';
COMMENT ON COLUMN public.source_products.stock_status IS
  'in_stock|low_stock|out_of_stock. Wins over the boolean in_stock, which this table keeps in sync by trigger.';
COMMENT ON COLUMN public.source_products.images IS
  'Display image URLs. source_images holds the supplier originals.';
COMMENT ON COLUMN public.source_products.price_cny_min IS
  'Curated CNY price. Defaults from source_price, which every marketplace in this catalog quotes in CNY (source_currency); a row priced in another currency must be corrected here, not trusted.';

-- ============================================================
-- VERIFY AFTER APPLYING (as staff — RLS allows the write):
--   INSERT INTO source_products(source_url, source_title, marketplace,
--                               price_cny_min, moq, stock_status, status)
--   VALUES ('https://example.com/x','测试','1688',12.5,20,'low_stock','active')
--   RETURNING id, title_english, title_original, images, price_cny_max, in_stock;
--     -- title_english/title_original must read 测试 (importer row, nothing curated)
--     -- in_stock must be TRUE: low_stock is still buyable
--   UPDATE source_products SET stock_status='out_of_stock' WHERE id='<that id>'
--     RETURNING in_stock;                         -- must flip to FALSE
--   SELECT * FROM admin_kpis() WHERE metric = 'products_in_stock';   -- must not raise
-- Deliberately no marketplace_id/source_id: they became nullable in section 3 so
-- an admin-added product can be written at all.
--
-- Proven locally by apps/web/supabase/audit/local_verify/80_catalog_contract.sql
-- on four schema generations, including a run that drops stock_status again to
-- simulate the deploy window where 202609240003 is applied but this file is not.
-- ============================================================
