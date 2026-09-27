-- ============================================================
-- ChinaSuuq — Migration: give source_products the few columns the
--             live project still lacks, without touching what it has
-- 2026-09-25
--
-- WHY THIS EXISTS, AND WHY IT IS NOT 202609250004.
-- Probing the live project (athkmrvsaijwgsyvwrbp) on 2026-09-25 showed that its
-- source_products is NOT the table this repo's history describes. 202408010004
-- builds an importer-shaped catalog — marketplace_id FK, source_id, source_title,
-- source_price, in_stock, `status product_status` — and 202609250004 adds the
-- curated display columns on top of it. Live has the curated half only:
--
--   marketplace marketplace_type NOT NULL, source_product_id text NOT NULL,
--   source_url text NOT NULL, title_original text NOT NULL, title_english,
--   title_somali, description_{original,english,somali}, images text[],
--   category_id uuid, attributes jsonb, moq int NOT NULL DEFAULT 1,
--   price_cny_min/max numeric(10,2) NOT NULL DEFAULT 0, domestic_shipping_cny,
--   stock_status stock_status NOT NULL DEFAULT 'in_stock', supplier_rating,
--   sales_count, weight_kg, is_restricted, is_verified, acquisition_method,
--   data_confidence, last_synced_at, video_url, seller_name, source_seller_id
--
-- with no source_title, no in_stock, no marketplace_id, and no `status`.
--
-- That single missing `status` is why the catalog screens are blank on a project
-- that is otherwise wired correctly: PostgREST rejects a filter on an unknown
-- column for the WHOLE request (42703), so
--
--   .from("source_products").select("*").eq("status", "active")
--
-- — which both apps issue — never returned a row list at all. The same is true
-- of `category` (mobile's Product type carries it as a string; live only has the
-- category_id FK) and `price_usd_estimated` (mobile renders it; live computes
-- nothing). The table being empty made this invisible rather than absent.
--
-- So this file adds exactly those three, idempotently, and derives nothing: no
-- backfill from columns that may not exist, no trigger between two stock
-- vocabularies, no ALTER against a constraint this project never had. Every
-- statement is ADD COLUMN IF NOT EXISTS, so it is a no-op on a generation that
-- already has the column — which is what makes it safe to run against BOTH the
-- live shape and the repo's importer shape (where 202609250004 already added
-- `category`/`price_usd_estimated` and 202408010004 declared `status`).
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   `in_stock` BOOLEAN. cart-validate and the KPI reader can gate on
--   stock_status, which live already has as NOT NULL and which says low_stock —
--   something a boolean cannot. Adding a second stock vocabulary would let the
--   two disagree on every write; 202609250004's trigger only exists because that
--   generation has both.
-- ============================================================

-- Draft / live / archived. TEXT, not a new enum: live's other flags are enums
-- created by 202408010003-style migrations this project may not have applied, and
-- a CHECK gives the same typo protection without depending on one.
--
-- DEFAULT 'active' is the one judgement call here, and it is the safe direction:
-- a row nobody has triaged should be buyable rather than silently hidden, because
-- a hidden catalog reads as "the marketplace is broken" while a visible one reads
-- as "this product is wrong", which is the fixable complaint. Staff set
-- draft/archived explicitly from the admin form.
DO $$ BEGIN
    ALTER TABLE public.source_products
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.source_products
      ADD CONSTRAINT source_products_status_check
      CHECK (status IN ('draft','active','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Denormalised category name. Live's real relationship is category_id →
-- categories(name_en); this column exists so a list query does not need a join
-- per row, and it is filled by the admin form and the enricher. When it is NULL
-- the clients fall back to the joined name, so a stale value here can only ever
-- cost a join, never hide a product.
DO $$ BEGIN
    ALTER TABLE public.source_products
      ADD COLUMN IF NOT EXISTS category TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- USD at import time. This is a STORED ESTIMATE, and the column stays nullable
-- on purpose: unlike the mobile reader's display-time conversion it records what
-- a person or model believed the price was, so it must never be silently
-- recomputed by a migration with today's rate.
DO $$ BEGIN
    ALTER TABLE public.source_products
      ADD COLUMN IF NOT EXISTS price_usd_estimated NUMERIC(12,2);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Both apps list with `status = 'active'` and then sort/filter on stock, so the
-- pair is indexed together. marketplace is left out: the enum is low-cardinality
-- and the planner gets more from (status, stock_status) on a catalog that is
-- still mostly one marketplace.
--
-- Guarded, because stock_status is this table's other optional vocabulary — a
-- generation that has neither the curated column nor a reason to sort by it must
-- still migrate, and CREATE INDEX names its columns at parse time.
DO $$
DECLARE v_ok boolean;
BEGIN
    SELECT count(*) = 2 INTO v_ok
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'source_products'
       AND column_name IN ('status','stock_status');

    IF NOT v_ok THEN
        RAISE NOTICE 'ChinaSuuq: source_products has no stock_status — status/stock index skipped';
        RETURN;
    END IF;

    CREATE INDEX IF NOT EXISTS idx_source_products_status_stock
      ON public.source_products(status, stock_status);
END $$;

-- ============================================================
-- VERIFY AFTER APPLYING:
--   SELECT column_name, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'source_products'
--      AND column_name IN ('status','category','price_usd_estimated');   -- 3 rows
--   SELECT count(*) FROM source_products WHERE status = 'active';        -- no error
--   -- and the request that was silently failing:
--   GET /rest/v1/source_products?select=*&status=eq.active&limit=1       -- 200, []
-- No data was written by this file, so on the current empty catalog every
-- existing row count is unchanged.
-- ============================================================
