-- ============================================================
-- 80_catalog_contract.sql — does source_products have the columns
--                            the two clients and cart-validate name?
--
-- WHY THIS EXISTS. PostgREST rejects a statement containing one unknown column
-- with 42703 for the WHOLE statement, so a single invented column name takes
-- down an entire screen rather than one field. That is what happened: the admin
-- product form, the admin search box, the low-stock counter, the mobile
-- marketplace list and the trending card all named curated columns
-- (title_english, images, price_cny_min, stock_status, sales_count) that no
-- migration created, and the harness agreed with them because its own stub
-- invented the same columns. Every one of those paths printed PASS.
--
-- So this file checks three things a stub can fake and a schema cannot:
--   1. the columns exist in the live information_schema after the migrations,
--   2. the write path keeps the two vocabularies in step (trigger + CHECK),
--   3. the functions survive a schema WITHOUT the curated columns, because that
--      is the state of the project between the 2026-09-24 deploy and the
--      2026-09-25 one — and admin_kpis() names them inside dynamic SQL, which
--      Postgres resolves at EXECUTE, so it installs fine and then aborts the
--      whole dashboard on its first call.
--
-- Every write here happens inside one transaction that is rolled back, so the
-- suites that share this invocation see the database as they found it. That is
-- also why run.sh loads this file BEFORE 60_trending.sql: the KPI baselines
-- below count the seed products, and 60 inserts an active one of its own.
-- ============================================================

BEGIN;

-- admin_kpis() and the metrics gate require a staff session. SET LOCAL, so the
-- claim is gone when this transaction rolls back and the access suites that
-- follow still see the customer/anon state they assert on.
SELECT set_config('request.jwt.claim.sub',
                  (SELECT id::text FROM public.profiles WHERE role = 'staff' LIMIT 1), true);

-- ─── 1. the column contract, straight from information_schema ────
DO $$
DECLARE
    label    text := current_setting('cs.generation', true);
    wanted   text[] := ARRAY[
        -- named since 202408010004 — the marketplace's own vocabulary
        'id','marketplace_id','marketplace','category_id','source_id','source_url',
        'source_title','source_description','source_images','source_price',
        'source_min_quantity','seller_rating','moq','in_stock','stock_quantity',
        'status','created_at','updated_at',
        -- named by 202609250003 — how a minimum order quantity was arrived at
        'moq_source','moq_confidence','moq_raw_text','moq_reviewed_at',
        -- named by both clients and 202609250004 — the curated display view
        'title_english','title_somali','title_original',
        'description_english','description_original','description_somali',
        'category','attributes','images','price_cny_min','price_cny_max',
        'price_usd_estimated','domestic_shipping_cny','stock_status',
        'sales_count','supplier_rating'
    ];
    missing  text := '';
    c        text;
BEGIN
    FOREACH c IN ARRAY wanted LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'source_products'
               AND column_name  = c
        ) THEN
            missing := missing || ' ' || c;
        END IF;
    END LOOP;

    IF missing <> '' THEN
        RAISE NOTICE 'FAIL [%] source_products is missing:%', label, missing;
    ELSE
        RAISE NOTICE 'PASS [%] all % columns the clients name exist in the schema',
            label, array_length(wanted, 1);
    END IF;

    -- The importer dedupe key must survive the NOT NULL relaxations below, or a
    -- re-import of the same offer would duplicate the catalog row.
    IF EXISTS (SELECT 1 FROM pg_index i
                 JOIN pg_class t ON t.oid = i.indrelid
                WHERE t.relname = 'source_products' AND i.indisunique) THEN
        RAISE NOTICE 'PASS [%] UNIQUE(marketplace_id, source_id) still enforced', label;
    ELSE
        RAISE NOTICE 'FAIL [%] source_products lost its importer dedupe UNIQUE key', label;
    END IF;

    -- An admin-added product has neither a marketplace FK row nor a supplier
    -- offer id; with either still NOT NULL Postgres answered 23502 and the
    -- create button never worked.
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='source_products'
                  AND column_name='marketplace_id' AND is_nullable='NO')
       OR EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='source_products'
                  AND column_name='source_id' AND is_nullable='NO') THEN
        RAISE NOTICE 'FAIL [%] marketplace_id/source_id are still NOT NULL — the admin cannot add a product', label;
    ELSE
        RAISE NOTICE 'PASS [%] an admin-added product may omit marketplace_id and source_id', label;
    END IF;
END $$;

-- ─── 2. the backfill repaired rows that predate the migration ────
-- The seed products were inserted before 202609250004 ran, so nothing but the
-- backfill can give them a display name. A catalog row that renders as a blank
-- card on both clients is the exact defect this migration exists to end.
DO $$
DECLARE
    label   text := current_setting('cs.generation', true);
    r       record;
    fails   text := '';
BEGIN
    SELECT title_english, title_original, price_cny_min, price_cny_max,
           stock_status, images
      INTO r
      FROM public.source_products
     WHERE id = 'f0000000-0000-4000-8000-000000000001';

    IF r.title_english IS DISTINCT FROM '测试商品' THEN
        fails := fails || format(' title_english=%s', coalesce(r.title_english, 'null'));
    END IF;
    IF r.title_original IS DISTINCT FROM '测试商品' THEN
        fails := fails || format(' title_original=%s', coalesce(r.title_original, 'null'));
    END IF;
    -- 12.50 is the CNY source_price; the curated pair inherits it.
    IF r.price_cny_min IS DISTINCT FROM 12.50 OR r.price_cny_max IS DISTINCT FROM 12.50 THEN
        fails := fails || format(' price (%s,%s)', r.price_cny_min, r.price_cny_max);
    END IF;
    IF cardinality(coalesce(r.images, '{}'::text[])) <> 1
       OR r.images[1] <> 'https://cbu01.alicdn.com/img/cap.jpg' THEN
        fails := fails || format(' images=%s', coalesce(array_to_string(r.images, ','), 'null'));
    END IF;
    IF r.stock_status IS DISTINCT FROM 'in_stock' THEN
        fails := fails || format(' stock_status=%s', coalesce(r.stock_status, 'null'));
    END IF;

    -- The out-of-stock seed row is stated with the boolean only, which is all
    -- the base schema has; the curated flag must be derived from it, not left
    -- NULL, or the admin stock screen shows a sold-out lot as an unknown.
    SELECT stock_status, in_stock INTO r
      FROM public.source_products
     WHERE id = (SELECT id FROM public.source_products
                  WHERE source_title = 'Out of stock' LIMIT 1);
    IF r.stock_status IS DISTINCT FROM 'out_of_stock' THEN
        fails := fails || format(' sold-out row stock_status=%s', coalesce(r.stock_status,'null'));
    END IF;
    IF r.in_stock IS DISTINCT FROM FALSE THEN
        fails := fails || ' sold-out row lost its boolean';
    END IF;

    IF fails = '' THEN
        RAISE NOTICE 'PASS [%] backfill gave pre-existing rows a display name, price, image and stock flag', label;
    ELSE
        RAISE NOTICE 'FAIL [%] backfill:%', label, fails;
    END IF;
END $$;

-- ─── 3. the deploy window: no curated columns yet ────────────────
-- 202609240003 goes out before 202609250004, and the customer home feed and the
-- whole admin dashboard run in between. Both must degrade, not abort. SAVEPOINT
-- so the column is back for the sections that follow.
SAVEPOINT deploy_window;
DROP TRIGGER IF EXISTS source_products_sync_display_fields ON public.source_products;
ALTER TABLE public.source_products DROP COLUMN stock_status;

DO $$
DECLARE
    label text := current_setting('cs.generation', true);
    v     numeric;
BEGIN
    -- The assertion is that this returns at all. Before the fix it raised
    -- 42703 from inside dynamic SQL, and one missing metric took every card
    -- with it because the dashboard fetches them in one call.
    BEGIN
        SELECT value INTO v FROM public.admin_kpis() WHERE metric = 'products_in_stock';
        IF v <> 3 THEN
            RAISE NOTICE 'FAIL [%] products_in_stock=% without stock_status, expected 3 (A, B and 测试商品)', label, v;
        ELSE
            RAISE NOTICE 'PASS [%] admin_kpis() counts from in_stock when stock_status is absent', label;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [%] admin_kpis() aborted without stock_status: %', label, SQLERRM;
    END;

    BEGIN
        PERFORM * FROM public.fn_trending_products(7, 20);
        RAISE NOTICE 'PASS [%] trending ranking survives the missing curated columns', label;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [%] fn_trending_products without curated columns: %', label, SQLERRM;
    END;
END $$;

ROLLBACK TO deploy_window;

-- Even the base column missing must not take the dashboard down: the metric
-- then reports 0 rather than raising, which is a visible wrong number, not a
-- blank page with no explanation.
SAVEPOINT no_catalog_at_all;
DROP TRIGGER IF EXISTS source_products_sync_display_fields ON public.source_products;
ALTER TABLE public.source_products DROP COLUMN stock_status;
ALTER TABLE public.source_products DROP COLUMN in_stock;

DO $$
DECLARE
    label text := current_setting('cs.generation', true);
    v     numeric;
    n     bigint;
BEGIN
    SELECT count(*) INTO n FROM public.admin_kpis();
    SELECT value INTO v FROM public.admin_kpis() WHERE metric = 'products_in_stock';
    IF n < 8 THEN
        RAISE NOTICE 'FAIL [%] admin_kpis() returned only % metrics with no catalog stock column', label, n;
    ELSIF v <> 0 THEN
        RAISE NOTICE 'FAIL [%] products_in_stock=% with no stock column at all, expected an honest 0', label, v;
    ELSE
        RAISE NOTICE 'PASS [%] admin_kpis() reports 0 instead of aborting (% metrics still served)', label, n;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAIL [%] admin_kpis() aborted with no stock column: %', label, SQLERRM;
END $$;

ROLLBACK TO no_catalog_at_all;

-- ─── 3b. the shape the live project actually has ─────────────────
-- Probed on 2026-09-25 from athkmrvsaijwgsyvwrbp: source_products carries
-- stock_status (NOT NULL stock_status enum, DEFAULT 'in_stock') and NO in_stock
-- column at all. So the KPI must read the curated flag, not report 0 — the
-- first version of this guard treated a missing in_stock as "no catalog", which
-- on live would have zeroed the card for a sellable catalog.
SAVEPOINT live_shape;
DROP TRIGGER IF EXISTS source_products_sync_display_fields ON public.source_products;
ALTER TABLE public.source_products DROP COLUMN in_stock;

DO $$
DECLARE
    label text := current_setting('cs.generation', true);
    v     numeric;
BEGIN
    BEGIN
        SELECT value INTO v FROM public.admin_kpis() WHERE metric = 'products_in_stock';
        IF v <> 3 THEN
            RAISE NOTICE 'FAIL [%] products_in_stock=% with only stock_status, expected 3 (A, B and 测试商品)', label, v;
        ELSE
            RAISE NOTICE 'PASS [%] admin_kpis() counts from stock_status when in_stock is absent', label;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [%] admin_kpis() aborted on the live column shape: %', label, SQLERRM;
    END;

    -- low_stock must stay in the count: it is thin stock, not absent stock.
    BEGIN
        UPDATE public.source_products SET stock_status = 'low_stock'
         WHERE title_english = '测试商品';
        SELECT value INTO v FROM public.admin_kpis() WHERE metric = 'products_in_stock';
        IF v <> 3 THEN
            RAISE NOTICE 'FAIL [%] a low_stock product left products_in_stock at %', label, v;
        ELSE
            RAISE NOTICE 'PASS [%] low_stock still counts as buyable stock', label;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [%] low_stock KPI check: %', label, SQLERRM;
    END;

    -- and selling out must leave it.
    BEGIN
        UPDATE public.source_products SET stock_status = 'out_of_stock'
         WHERE title_english = '测试商品';
        SELECT value INTO v FROM public.admin_kpis() WHERE metric = 'products_in_stock';
        IF v <> 2 THEN
            RAISE NOTICE 'FAIL [%] selling out left products_in_stock at %, expected 2', label, v;
        ELSE
            RAISE NOTICE 'PASS [%] out_of_stock is excluded from products_in_stock', label;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [%] out_of_stock KPI check: %', label, SQLERRM;
    END;
END $$;

ROLLBACK TO live_shape;

-- ─── 4. the sync trigger: each vocabulary fills the other ────────
-- 4a. an importer row: source_* only, nothing curated.
DO $$
DECLARE
    label text := current_setting('cs.generation', true);
    r     record;
    fails text := '';
BEGIN
    INSERT INTO public.source_products
        (marketplace, source_url, source_title, source_description, source_images,
         source_price, seller_rating, moq, in_stock, stock_quantity, status)
    VALUES
        ('1688', 'https://detail.1688.com/offer/888000000001.html', '铁盒 24 只装',
         '工厂直销，可定制', ARRAY['https://img.1688.com/box-1.jpg'],
         8.80, 4.70, 24, TRUE, 500, 'active')
    RETURNING * INTO r;

    IF r.title_english IS DISTINCT FROM '铁盒 24 只装' THEN
        fails := fails || format(' title_english=%s', coalesce(r.title_english,'null'));
    END IF;
    IF r.title_original IS DISTINCT FROM '铁盒 24 只装' THEN
        fails := fails || format(' title_original=%s', coalesce(r.title_original,'null'));
    END IF;
    IF r.description_original IS DISTINCT FROM '工厂直销，可定制' THEN
        fails := fails || ' description_original not filled';
    END IF;
    -- description_english stays NULL, and that is the correct verdict: the
    -- supplier wrote Chinese, and a trigger cannot translate it. ai-translate and
    -- the translation cache own that column, so a row an importer wrote has no
    -- English description until one of them runs.
    IF r.description_english IS NOT NULL THEN
        fails := fails || ' description_english invented by the trigger';
    END IF;
    IF r.images IS NULL OR r.images[1] <> 'https://img.1688.com/box-1.jpg' THEN
        fails := fails || ' images not filled from source_images';
    END IF;
    IF r.price_cny_min IS DISTINCT FROM 8.80 OR r.price_cny_max IS DISTINCT FROM 8.80 THEN
        fails := fails || format(' price (%s,%s)', r.price_cny_min, r.price_cny_max);
    END IF;
    IF r.supplier_rating IS DISTINCT FROM 4.70 THEN
        fails := fails || format(' supplier_rating=%s', r.supplier_rating);
    END IF;
    IF r.sales_count IS DISTINCT FROM 0 THEN
        fails := fails || ' sales_count not defaulted to 0';
    END IF;
    -- in_stock TRUE on an import must become the curated flag, or the admin
    -- stock column renders blank for every row an importer writes.
    IF r.stock_status IS DISTINCT FROM 'in_stock' THEN
        fails := fails || format(' stock_status=%s', coalesce(r.stock_status,'null'));
    END IF;

    -- price_usd_estimated stays NULL on purpose: a trigger has no business
    -- freezing an exchange rate into a stored row.
    IF r.price_usd_estimated IS NOT NULL THEN
        fails := fails || ' price_usd_estimated was invented by the trigger';
    END IF;

    IF fails = '' THEN
        RAISE NOTICE 'PASS [%] an importer write fills every curated display field', label;
    ELSE
        RAISE NOTICE 'FAIL [%] importer row:%', label, fails;
    END IF;
END $$;

-- 4b. an admin write: curated wins, and the boolean follows it. This is the
-- payload apps/web/.../products/page.tsx sends, keys and all.
DO $$
DECLARE
    label text := current_setting('cs.generation', true);
    r     record;
    v     record;
    fails text := '';
BEGIN
    INSERT INTO public.source_products
        (id, marketplace, source_url, source_title, source_description, source_images,
         source_price, source_id, moq, status, in_stock, updated_at,
         title_english, title_somali, title_original, category,
         price_cny_min, price_cny_max, price_usd_estimated, stock_status,
         supplier_rating, sales_count, description_english, images, created_at)
    VALUES
        ('f0000000-0000-4000-8000-0000000000aa',
         '1688', 'https://detail.1688.com/offer/741276720279.html', '测试商品',
         '一件代发 10件起批', ARRAY['https://cbu01.alicdn.com/img/cap.jpg'],
         12.50, NULL, 20, 'active', TRUE, now(),
         'Test tin of clips', 'Qalab tijaabo', '测试商品', 'Office supplies',
         12.50, 15.00, 1.80, 'low_stock', 4.60, 132, 'Drop-ship from factory',
         ARRAY['https://cbu01.alicdn.com/img/cap.jpg'], now())
    RETURNING * INTO r;

    IF r.title_english IS DISTINCT FROM 'Test tin of clips' THEN
        fails := fails || ' curated title was overwritten';
    END IF;
    IF r.title_original IS DISTINCT FROM '测试商品' THEN
        fails := fails || ' curated original title was overwritten';
    END IF;
    -- low_stock is still buyable: the boolean that cart-validate gates on must
    -- say TRUE, or a "few left" product becomes unpurchasable.
    IF r.in_stock IS DISTINCT FROM TRUE THEN
        fails := fails || format(' low_stock set in_stock=%s', r.in_stock);
    END IF;
    IF r.price_cny_max IS DISTINCT FROM 15.00 THEN
        fails := fails || ' curated price range was replaced';
    END IF;

    -- 4c. stock_status is the curated flag the admin owns; in_stock follows it
    -- in both directions, which is what keeps the two screens honest.
    UPDATE public.source_products SET stock_status = 'out_of_stock'
     WHERE id = r.id RETURNING in_stock, stock_status INTO v;
    IF v.in_stock IS DISTINCT FROM FALSE THEN
        fails := fails || format(' out_of_stock left in_stock=%s', v.in_stock);
    END IF;

    UPDATE public.source_products SET stock_status = 'in_stock'
     WHERE id = r.id RETURNING in_stock INTO v;
    IF v.in_stock IS DISTINCT FROM TRUE THEN
        fails := fails || format(' in_stock did not follow stock_status back (%s)', v.in_stock);
    END IF;

    -- 4d. a curated name is a decision. Rewriting the supplier title (the next
    -- import of the same offer) must not clobber it.
    UPDATE public.source_products SET source_title = '测试商品 v2'
     WHERE id = r.id RETURNING title_english, title_original INTO v;
    IF v.title_english IS DISTINCT FROM 'Test tin of clips'
       OR v.title_original IS DISTINCT FROM '测试商品' THEN
        fails := fails || format(' human curation clobbered (%s / %s)', v.title_english, v.title_original);
    END IF;

    -- 4e. a write that names neither stock column must not fabricate one.
    UPDATE public.source_products SET moq = 25 WHERE id = r.id
     RETURNING stock_status INTO v;
    IF v.stock_status IS DISTINCT FROM 'in_stock' THEN
        fails := fails || ' an unrelated update reset stock_status';
    END IF;

    IF fails = '' THEN
        RAISE NOTICE 'PASS [%] curated writes are kept, in_stock follows stock_status both ways', label;
    ELSE
        RAISE NOTICE 'FAIL [%] admin write:%', label, fails;
    END IF;
END $$;

-- ─── 5. the CHECK constraint: a typo must not silently disappear ──
-- The stock counter is an equality test, so 'out_stock' would have made a sold
-- out product count as neither in stock nor out of stock on every screen.
DO $$
DECLARE
    label text := current_setting('cs.generation', true);
BEGIN
    BEGIN
        INSERT INTO public.source_products
            (source_url, source_title, marketplace, stock_status, status)
        VALUES ('https://example.com/typo', 'typo', '1688', 'out_stock', 'active');
        RAISE NOTICE 'FAIL [%] the CHECK let stock_status=''out_stock'' through', label;
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS [%] a misspelt stock_status is rejected, not silently dropped', label;
    WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [%] stock_status typo raised % instead of check_violation', label, SQLERRM;
    END;

    -- NULL stays legal: a row curated before the column existed is unknown, not
    -- zero, and 202609240003 must keep reading it.
    BEGIN
        INSERT INTO public.source_products
            (source_url, source_title, marketplace, stock_status, status)
        VALUES ('https://example.com/null-stock', 'null', '1688', NULL, 'active');
        RAISE NOTICE 'PASS [%] a NULL stock_status is still accepted', label;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [%] NULL stock_status refused: %', label, SQLERRM;
    END;
END $$;

-- ─── 6. the statements each client actually issues ───────────────
-- Run as text, exactly as PostgREST expands the builder calls, so a renamed
-- column fails HERE rather than on a screen with no error message. Each is
-- wrapped in a count so one scalar comes back whatever the row shape is.
DO $$
DECLARE
    label  text := current_setting('cs.generation', true);
    n      bigint;
    r      record;
    fails  text := '';
    ids    uuid[] := ARRAY['f0000000-0000-4000-8000-000000000001']::uuid[];

    q_admin_search text :=
        'SELECT count(*) FROM (SELECT * FROM public.source_products WHERE '
        || '(title_english ILIKE $1 OR title_original ILIKE $1 OR title_somali ILIKE $1 '
        || 'OR category ILIKE $1 OR source_title ILIKE $1) '
        || 'ORDER BY created_at DESC LIMIT 500) cs_q';
    q_low_stock text :=
        'SELECT count(*) FROM public.source_products WHERE status = $1 AND stock_status = $2';
    q_marketplace text :=
        'SELECT count(*) FROM (SELECT * FROM public.source_products '
        || 'WHERE marketplace = $1 LIMIT 60) cs_q';
    q_cart text :=
        'SELECT count(*) FROM (SELECT id, moq, moq_source, source_min_quantity, status, '
        || 'in_stock, stock_status, stock_quantity, price_cny_min, source_price '
        || 'FROM public.source_products WHERE id = ANY($1)) cs_q';
    q_admin_insert text :=
        'INSERT INTO public.source_products (marketplace, source_url, source_title, '
        || 'source_description, source_images, source_price, source_id, moq, status, '
        || 'in_stock, updated_at, title_english, title_somali, title_original, category, '
        || 'price_cny_min, price_cny_max, price_usd_estimated, stock_status, '
        || 'supplier_rating, sales_count, description_english, images, created_at) '
        || 'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'
        || '$20,$21,$22,$23,$24) RETURNING id';
BEGIN
    -- The admin's low-stock tile is a bare equality test, so put exactly one
    -- curated low_stock row on the table and require the count to find it.
    UPDATE public.source_products SET stock_status = 'low_stock'
     WHERE id = 'f0000000-0000-4000-8000-0000000000aa';

    BEGIN
        EXECUTE q_admin_search INTO n USING '%tin%';
        IF n <> 1 THEN fails := fails || format(' admin search found %s expected 1', n);
        ELSE RAISE NOTICE 'PASS [%] admin search predicate finds the curated row by English title', label; END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || ' admin-search(' || SQLERRM || ')';
    END;

    BEGIN
        EXECUTE q_low_stock INTO n USING 'active', 'low_stock';
        IF n <> 1 THEN fails := fails || format(' low_stock count=%s expected 1', n);
        ELSE RAISE NOTICE 'PASS [%] the low-stock head-count finds the curated row', label; END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || ' low-stock(' || SQLERRM || ')';
    END;

    BEGIN
        EXECUTE q_marketplace INTO n USING '1688';
        IF n = 0 THEN fails := fails || ' marketplace list returned nothing';
        ELSE RAISE NOTICE 'PASS [%] mobile marketplace list runs (%)', label, n; END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || ' marketplace-list(' || SQLERRM || ')';
    END;

    BEGIN
        EXECUTE q_cart INTO n USING ids;
        IF n <> 1 THEN fails := fails || format(' cart lookup returned %s expected 1', n);
        ELSE RAISE NOTICE 'PASS [%] cart-validate''s column list resolves', label; END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || ' cart-validate-select(' || SQLERRM || ')';
    END;

    BEGIN
        -- Every untyped NULL has to carry its column's type: PL/pgSQL otherwise
        -- sends it as text and Postgres refuses the numeric slot, which would
        -- read as "the admin insert is illegal" when it is only the test.
        EXECUTE q_admin_insert INTO r
            USING '1688', 'https://detail.1688.com/offer/888000000002.html', '预处理行',
                  NULL::text, ARRAY[]::text[], 5.00, NULL::text, 10, 'active', TRUE, now(),
                  'Prepared row', '', '', '', 5.00, NULL::numeric, NULL::numeric, 'in_stock',
                  NULL::numeric, 0, '', ARRAY[]::text[], now();
        RAISE NOTICE 'PASS [%] the admin insert statement is legal on this schema', label;
    EXCEPTION WHEN OTHERS THEN
        fails := fails || ' admin-insert(' || SQLERRM || ')';
    END;

    IF fails <> '' THEN RAISE NOTICE 'FAIL [%] client statements:%', label, fails; END IF;
END $$;

-- ─── 7. the dashboard and the catalog agree ──────────────────────
-- Flipping a curated flag must move the KPI. This is the loop the whole
-- migration is for: staff edit a product, the number on Mission Control changes.
-- The delta is asserted rather than a total, because sections 4-6 above added
-- catalog rows and the fixed baseline belongs in section 3.
DO $$
DECLARE
    label  text := current_setting('cs.generation', true);
    before numeric;
    after  numeric;
BEGIN
    SELECT value INTO before FROM public.admin_kpis() WHERE metric = 'products_in_stock';
    UPDATE public.source_products SET stock_status = 'out_of_stock'
     WHERE id = 'f0000000-0000-4000-8000-000000000001';
    SELECT value INTO after FROM public.admin_kpis() WHERE metric = 'products_in_stock';

    IF after <> before - 1 THEN
        RAISE NOTICE 'FAIL [%] selling out one product moved products_in_stock %→%, expected %',
            label, before, after, before - 1;
    ELSE
        RAISE NOTICE 'PASS [%] products_in_stock follows a curated stock edit (%→%)', label, before, after;
    END IF;
END $$;

-- ─── 8. the index the migration promises ─────────────────────────
DO $$
DECLARE
    label text := current_setting('cs.generation', true);
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_source_products_market_stock') THEN
        RAISE NOTICE 'PASS [%] marketplace+stock index exists', label;
    ELSE
        RAISE NOTICE 'FAIL [%] idx_source_products_market_stock was not created', label;
    END IF;
END $$;

ROLLBACK;
