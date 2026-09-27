-- ============================================================
-- 91_live_order_items.sql — prove 202609240004 against the order
--                           tables production actually has.
--
-- WHY THIS EXISTS. 90_live_shape.sql proved the catalog half, and the same
-- probe run against the order half (project athkmrvsaijwgsyvwrbp, 2026-09-25)
-- found a second copy of the same defect: production's order_items predates
-- this migration's own vocabulary.
--
--   order_items: id, order_id, product_id, product_name, variant,
--                marketplace <ENUM(1688,taobao,yiwugo,chinasuuq,chinagoods,
--                jd,alibaba)>, source_url, quantity,
--                price_cny_snapshot NOT NULL, price_usd_snapshot NOT NULL,
--                exchange_rate_snapshot NOT NULL, created_at
--   orders:      reference/user_id/subtotal_usd/.../tracking_token — NO items
--                column at all
--   marketplaces: id,name,slug,marketplace_type,logo_url,... — NO display_name
--
-- So its CREATE VIEW named columns that do not exist (m.display_name above all,
-- since a view's list resolves at CREATE), its INSERT named eight more, and the
-- NOT NULL snapshots would have turned every provenance write into a 23502 that
-- the trigger swallows into a log line — the admin quietly seeing no order lines.
--
-- Asserted here: the file applies, the view resolves BOTH vocabularies, and a
-- live-shaped staff row reads back attributed to its app. Runs in BEGIN/ROLLBACK.
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.marketplaces CASCADE;

-- g2/g4 already declare this enum for their own orders.target_marketplace, so
-- reusing the name is the point: production's order_items.marketplace column IS
-- this type.
DO $$ BEGIN
    CREATE TYPE public.marketplace_type AS ENUM
      ('1688','taobao','yiwugo','chinasuuq','chinagoods','jd','alibaba');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.marketplaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text,
    marketplace_type text,
    logo_url text,
    description_en text,
    description_so text,
    base_url text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.order_items (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                uuid NOT NULL,
    product_id              uuid,
    product_name            text NOT NULL,
    variant                 text,
    marketplace             public.marketplace_type,
    source_url              text,
    quantity                integer NOT NULL DEFAULT 1,
    price_cny_snapshot      numeric(12,2) NOT NULL,
    price_usd_snapshot      numeric(12,2) NOT NULL,
    exchange_rate_snapshot  numeric(12,6) NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

INSERT INTO public.marketplaces (name, slug, marketplace_type, logo_url)
VALUES ('1688', '1688', 'wholesale', 'https://cdn.chinasuuq.test/1688.png');

-- The fixture order is inserted by the assertion block below, not here: the four
-- harness generations disagree on which orders columns are NOT NULL (g2/g3
-- demand order_number + profile_id, g1 names the owner user_id), and production
-- has no items column at all — which is itself one of the things under test.

\i :MIG/202609240004_order_item_provenance.sql

DO $$
DECLARE
    n         bigint;
    v_key     text;
    v_name    text;
    v_logo    text;
    v_origin  text;
    v_unit    numeric;
    v_cny     numeric;
    v_rate    numeric;
    v_variant text;
    v_total   numeric;
    v_count   integer;
    v_cols    text;
    v_vals    text;
    oid       uuid := '11111111-1111-1111-1111-111111111191'::uuid;
BEGIN
    -- ─── a fixture order, in whatever columns this generation demands ─
    -- id plus every NOT NULL column that has no default. Production's shape then
    -- carries no items key, which is the case the sync must survive.
    BEGIN
        SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
               string_agg(CASE
                     WHEN column_name = 'id'            THEN '''11111111-1111-1111-1111-111111111191''::uuid'
                     WHEN column_name ~ '_(id)$'        THEN '(SELECT id FROM public.profiles LIMIT 1)'
                     WHEN data_type ~ 'text|char'      THEN '''CS-LIVE-91'''
                     WHEN data_type ~ 'numeric|int'    THEN '1'
                     ELSE 'NULL'
                   END, ', ' ORDER BY ordinal_position)
          INTO v_cols, v_vals
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'orders'
           AND (column_name = 'id' OR (is_nullable = 'NO' AND column_default IS NULL));
        EXECUTE format('INSERT INTO public.orders (%s) VALUES (%s)', v_cols, v_vals);
        RAISE NOTICE 'PASS [live-orders] fixture order inserted with columns: %', v_cols;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [live-orders] fixture order: %', SQLERRM;
    END;

    -- ─── the view itself was the thing that could not be created ──
    SELECT count(*) INTO n FROM information_schema.views
     WHERE table_schema = 'public' AND table_name = 'admin_order_items_view';
    IF n <> 1 THEN
        RAISE NOTICE 'FAIL [live-orders] admin_order_items_view was not created';
    ELSE
        RAISE NOTICE 'PASS [live-orders] 202609240004 applies to production''s order_items';
    END IF;

    -- ─── a staff row written in the snapshot vocabulary ───────────
    -- The way this project's own admin writes it: no unit_price, no origin, no
    -- marketplace_key, prices only in the *_snapshot columns.
    BEGIN
        INSERT INTO public.order_items
            (order_id, product_name, variant, marketplace, source_url, quantity,
             price_cny_snapshot, price_usd_snapshot, exchange_rate_snapshot)
        VALUES (oid, 'Steel water bottle', '500ml black',
                '1688'::public.marketplace_type,
                'https://detail.1688.com/offer/678901122334.html', 20,
                12.50, 1.72, 7.259900);
        RAISE NOTICE 'PASS [live-orders] legacy staff line inserts after the NOT NULL relax';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [live-orders] legacy staff insert: %', SQLERRM;
    END;

    -- ─── and the view names its app, its prices and its variant ───
    BEGIN
        SELECT marketplace_key, marketplace_name, marketplace_logo, origin,
               unit_price, unit_price_cny, exchange_rate, variant_name, total_price
          INTO v_key, v_name, v_logo, v_origin, v_unit, v_cny, v_rate, v_variant, v_total
          FROM public.admin_order_items_view WHERE order_id = oid;

        IF v_key IS DISTINCT FROM '1688' OR v_origin IS DISTINCT FROM 'staff' THEN
            RAISE NOTICE 'FAIL [live-orders] key/origin = %/% (expected 1688/staff from the column default)',
                v_key, v_origin;
        ELSIF v_logo IS NULL OR v_name IS DISTINCT FROM '1688' THEN
            RAISE NOTICE 'FAIL [live-orders] the enum label did not join to marketplaces (name=%, logo=%)',
                v_name, v_logo;
        ELSE
            RAISE NOTICE 'PASS [live-orders] staff row reads back attributed to 1688 with its logo';
        END IF;

        IF v_unit IS DISTINCT FROM 1.72 THEN
            RAISE NOTICE 'FAIL [live-orders] unit_price = % (expected 1.72 from price_usd_snapshot)', v_unit;
        ELSIF v_cny IS DISTINCT FROM 12.50 THEN
            RAISE NOTICE 'FAIL [live-orders] unit_price_cny = % (expected 12.50 from price_cny_snapshot)', v_cny;
        ELSIF v_rate IS DISTINCT FROM 7.2599 THEN
            RAISE NOTICE 'FAIL [live-orders] exchange_rate = % (expected 7.2599)', v_rate;
        ELSIF v_variant IS DISTINCT FROM '500ml black' THEN
            RAISE NOTICE 'FAIL [live-orders] variant_name = % (expected the legacy `variant` value)', v_variant;
        ELSIF v_total IS DISTINCT FROM 34.40 THEN
            RAISE NOTICE 'FAIL [live-orders] total_price = % (expected 1.72 * 20 = 34.40)', v_total;
        ELSE
            RAISE NOTICE 'PASS [live-orders] price, cost, rate, variant and derived total all resolve';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [live-orders] reading the view: %', SQLERRM;
    END;

    -- ─── provenance write path on a table with no orders.items ────
    -- Production has no items column, so the only honest verdict is 0 rows and
    -- no exception. A raise here is swallowed by the trigger in production, and
    -- the admin simply never sees lines.
    BEGIN
        SELECT public.sync_order_items(oid) INTO v_count;
        IF v_count <> 0 THEN
            RAISE NOTICE 'FAIL [live-orders] sync_order_items() invented % rows from no items column', v_count;
        ELSE
            RAISE NOTICE 'PASS [live-orders] sync_order_items() no-ops on the live orders shape';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [live-orders] sync_order_items() raised on the live shape: %', SQLERRM;
    END;

    -- ─── a provenance row written the new way coexists ────────────
    BEGIN
        INSERT INTO public.order_items
            (order_id, product_name, quantity, unit_price, total_price, currency,
             marketplace_key, unit_price_cny, exchange_rate, moq_at_purchase,
             variant_name, origin, created_at, updated_at)
        VALUES (oid, 'Phone case', 50, 0.85, 42.50, 'USD', 'taobao', 6.20, 7.29, 50,
                NULL, 'api', now(), now());
        SELECT count(*) INTO n FROM public.admin_order_items_view WHERE order_id = oid;
        IF n <> 2 THEN
            RAISE NOTICE 'FAIL [live-orders] view shows % of the 2 line generations', n;
        ELSE
            RAISE NOTICE 'PASS [live-orders] snapshot rows and provenance rows both read';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [live-orders] provenance-shaped insert: %', SQLERRM;
    END;

    -- ─── every column the view names is guaranteed ────────────────
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema='public' AND table_name='order_items'
       AND column_name IN ('cost_price','is_sourced','is_purchased','is_received',
                           'is_inspected','image_url','metadata','updated_at');
    IF n <> 8 THEN
        RAISE NOTICE 'FAIL [live-orders] only % of the 8 required order_items columns exist', n;
    ELSE
        RAISE NOTICE 'PASS [live-orders] all eight view-only columns were added by the migration';
    END IF;
END $$;

ROLLBACK;
