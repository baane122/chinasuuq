-- ============================================================
-- 90_live_shape.sql — prove the migrations against the schema the
--                      production project actually has.
--
-- WHY THIS EXISTS. Generations g1–g4 all rebuild source_products from
-- 202408010004's importer shape (marketplace_id, source_id, source_title,
-- source_price, in_stock, status product_status), because that is what this
-- repo's history says the table is. Probing the live project
-- (athkmrvsaijwgsyvwrbp) on 2026-09-25 proved otherwise: production has the
-- CURATED half only —
--
--   marketplace marketplace_type NOT NULL, source_product_id text NOT NULL,
--   source_url NOT NULL, title_original NOT NULL, title_english, title_somali,
--   description_{original,english,somali}, images text[], category_id uuid,
--   attributes jsonb, moq int NOT NULL DEFAULT 1, price_cny_min/max NOT NULL
--   DEFAULT 0, domestic_shipping_cny, stock_status stock_status NOT NULL
--   DEFAULT 'in_stock', supplier_rating, sales_count, weight_kg, is_restricted,
--   is_verified, acquisition_method, data_confidence, last_synced_at, video_url,
--   seller_name, source_seller_id
--
-- and NO source_title, source_price, in_stock, marketplace_id, source_id,
-- status or category. Every catalog query both apps issue filters on `status`,
-- which on that shape is a 42703 that kills the whole request — the real reason
-- the marketplace screens show nothing.
--
-- So the four generations were proving a contract production does not
-- implement, and a passing harness told us the opposite of the truth. This file
-- is the fifth case, and the only one whose column list came from the server.
--
-- It runs inside BEGIN/ROLLBACK and re-applies the real migration files with \i,
-- so what is tested is the files, not a copy of them.
-- ============================================================

BEGIN;

-- Recreate the table the way production has it, then re-run the migrations that
-- are supposed to be compatible with it.
DROP TABLE IF EXISTS public.source_products CASCADE;

CREATE TABLE public.source_products (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace           text NOT NULL,
    source_product_id     text NOT NULL,
    source_url            text NOT NULL,
    source_seller_id      text,
    seller_name           text,
    title_original        text NOT NULL,
    title_english         text,
    title_somali          text,
    description_original  text,
    description_english   text,
    description_somali    text,
    images                text[],
    video_url             text,
    category_id           uuid,
    attributes            jsonb,
    moq                   integer NOT NULL DEFAULT 1,
    price_cny_min         numeric(10,2) NOT NULL DEFAULT 0,
    price_cny_max         numeric(10,2) NOT NULL DEFAULT 0,
    domestic_shipping_cny numeric(10,2) NOT NULL DEFAULT 0,
    stock_status          text NOT NULL DEFAULT 'in_stock',
    supplier_rating       numeric(3,2),
    sales_count           integer NOT NULL DEFAULT 0,
    weight_kg             numeric(8,3),
    is_restricted         boolean NOT NULL DEFAULT false,
    is_verified           boolean NOT NULL DEFAULT false,
    acquisition_method    text,
    data_confidence       numeric(3,2),
    last_synced_at        timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT source_products_marketplace_check CHECK
      (marketplace IN ('1688','taobao','yiwugo','chinasuuq','chinagoods','jd','alibaba')),
    CONSTRAINT source_products_stock_status_check CHECK
      (stock_status IN ('in_stock','low_stock','out_of_stock'))
);
ALTER TABLE public.source_products ENABLE ROW LEVEL SECURITY;
-- The live project also has the anon-read / staff-write policies from
-- 202408010010; the access negatives are 30_access.sql's job on this shape too,
-- and it reads the table as the staff claim this harness already set.

\i :MIG/202609250003_moq_extraction.sql
\i :MIG/202609250004_catalog_display_columns.sql
\i :MIG/202609250005_live_catalog_columns.sql

DO $$
DECLARE
    label text := current_setting('cs.generation', true) || '/live';
    v     numeric;
    n     bigint;
    v_verdict text;
    r     record;
BEGIN
    -- ─── the queries both apps actually issue ───────────────────
    -- Each of these was a 42703 on production. They are asserted by EXECUTING
    -- the statement, not by inspecting information_schema, because PostgREST
    -- rejects the whole request for one unknown column and only the statement
    -- itself reproduces that.
    BEGIN
        SELECT count(*) INTO n FROM public.source_products
         WHERE status = 'active' AND stock_status <> 'out_of_stock';
        RAISE NOTICE 'PASS [%] the marketplace list filter (status + stock_status) runs', label;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [%] status filter still broken: %', label, SQLERRM;
    END;

    -- ─── the admin save path, in the live column spelling ───────
    -- title_original and source_product_id are NOT NULL here, so a hand-added
    -- product has to supply them; that is the shape of the insert the admin
    -- products page must now send.
    BEGIN
        INSERT INTO public.source_products
            (marketplace, source_product_id, source_url, title_original, title_english,
             images, price_cny_min, price_cny_max, moq, stock_status, status, category,
             price_usd_estimated, supplier_rating, sales_count)
        VALUES ('1688', '678901122334', 'https://detail.1688.com/offer/678901122334.html',
             '不锈钢水杯 大容量', 'Steel water bottle 500ml',
             ARRAY['https://img.1688.com/a.jpg'], 12.50, 18.90, 20, 'low_stock', 'active',
             'Kitchen', 2.10, 4.60, 0);
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n <> 1 THEN
            RAISE NOTICE 'FAIL [%] admin insert reported % rows', label, n;
        ELSE
            RAISE NOTICE 'PASS [%] an admin-added product saves on the live shape', label;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [%] admin insert on the live shape: %', label, SQLERRM;
    END;

    -- ─── the dashboard's catalog card reads this catalog ────────
    -- No in_stock column exists here at all, so the KPI must fall to
    -- stock_status, and a low_stock product must still count as buyable.
    BEGIN
        SELECT value INTO v FROM public.admin_kpis() WHERE metric = 'products_in_stock';
        IF v IS DISTINCT FROM 1 THEN
            RAISE NOTICE 'FAIL [%] products_in_stock=% on the live shape, expected 1', label, v;
        ELSE
            RAISE NOTICE 'PASS [%] admin_kpis() reads stock_status (low_stock counted)', label;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [%] admin_kpis() on the live shape: %', label, SQLERRM;
    END;

    SELECT count(*) INTO n FROM public.admin_kpis();
    IF n < 17 THEN
        RAISE NOTICE 'FAIL [%] admin_kpis() served only % metrics on the live shape', label, n;
    ELSE
        RAISE NOTICE 'PASS [%] all % KPI cards served', label, n;
    END IF;

    -- ─── the MOQ gate writes and the queue drains ───────────────
    -- 'manual' is the only source that leaves the queue: 0003's own predicate
    -- keeps an 'ai' row listed until a human confirms it, so asserting a drain
    -- with an ai candidate would contradict the rule under test.
    BEGIN
        SELECT public.record_moq_candidate(id, 50, 0.85, '50件起批', 'manual')
          INTO v_verdict FROM public.source_products LIMIT 1;
        IF v_verdict <> 'written' THEN
            RAISE NOTICE 'FAIL [%] manual MOQ candidate returned %', label, v_verdict;
        END IF;
        SELECT count(*) INTO n FROM public.moq_review_queue;
        IF n <> 0 THEN
            RAISE NOTICE 'FAIL [%] moq_review_queue still lists % rows after a manual confirm', label, n;
        ELSE
            RAISE NOTICE 'PASS [%] MOQ gate writes and the queue drains on the live shape', label;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [%] MOQ path on the live shape: %', label, SQLERRM;
    END;

    -- ─── nothing was invented by the display migration ─────────
    -- 202609250004's trigger and backfill both name source_* columns. On this
    -- shape they must skip cleanly rather than abort, and skipping must not
    -- leave a curated field pointing at a column that never existed.
    BEGIN
        SELECT count(*) INTO n FROM public.source_products
         WHERE coalesce(title_english, '') = '';
        IF n <> 0 THEN
            RAISE NOTICE 'FAIL [%] % live rows have an empty curated title', label, n;
        ELSE
            RAISE NOTICE 'PASS [%] 202609250004 skipped the source_* backfill without corrupting it', label;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [%] curated title read on the live shape: %', label, SQLERRM;
    END;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgname = 'source_products_sync_display_fields') THEN
        RAISE NOTICE 'PASS [%] display-sync trigger correctly absent (no source_* to sync)', label;
    ELSE
        RAISE NOTICE 'FAIL [%] display-sync trigger installed over a catalog with no source_* columns — its next INSERT would raise', label;
    END IF;
END $$;

ROLLBACK;
