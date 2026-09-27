-- Trending ranking behaviour. Run as a separate psql invocation.
--
-- fn_trending_products is SECURITY DEFINER, so it reads source_products past
-- RLS: what it must NOT do is hand a customer a draft, an orphan, or a score
-- computed from events outside its own window. Those are the claims this file
-- tests, plus the weights the whole feature is named after.

-- A distinct caller, so the 60-second limiter is not shared with other suites.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

DO $$
DECLARE
    active   uuid := 'f0000000-0000-4000-8000-000000000001';  -- status active, 测试商品, ¥12.5
    draft    uuid := 'f0000000-0000-4000-8000-000000000002';  -- status draft
    orphan   uuid := 'f0000000-0000-4000-8000-000000000009';  -- no source_products row
    r        record;
    n        bigint;
    v_top    text;
    fails    text := '';
    limiter  boolean;
BEGIN
    DELETE FROM public.product_events;

    -- 1 view + 1 add_to_cart + 1 order = 1 + 4 + 8 = 13 at age ~0.
    IF NOT public.record_product_event(active, 'view', '1688') THEN fails := fails || ' view refused'; END IF;
    IF NOT public.record_product_event(active, 'add_to_cart', '1688') THEN fails := fails || ' atc refused'; END IF;
    IF NOT public.record_product_event(active, 'order', '1688') THEN fails := fails || ' order refused'; END IF;
    -- A different event type for the same product is a different bucket.
    IF NOT public.record_product_event(active, 'search_click', '1688') THEN fails := fails || ' click refused'; END IF;

    -- 1b: the limiter exists so a re-render cannot mint score out of nothing.
    limiter := public.record_product_event(active, 'view', '1688');
    IF limiter THEN fails := fails || ' limiter did not fire'; END IF;
    SELECT count(*) INTO n FROM public.product_events WHERE product_id = active;
    IF n <> 4 THEN fails := fails || ' expected 4 events, got ' || n; END IF;

    -- 1c: unknown types are programming errors and must raise, not swallow.
    BEGIN
        PERFORM public.record_product_event(active, 'purchase', '1688');
        fails := fails || ' unknown event type accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%unknown product event type%' THEN
            fails := fails || ' wrong error: ' || SQLERRM;
        END IF;
    END;

    -- 2 drafts must never reach a customer feed, and 3 neither may orphans.
    PERFORM public.record_product_event(draft, 'order', '1688');
    PERFORM public.record_product_event(draft, 'order', 'taobao');
    PERFORM public.record_product_event(orphan, 'order', '1688');

    -- 4 an event from outside every window must not age into the score.
    INSERT INTO public.product_events (product_id, event_type, marketplace_key, session_id)
    VALUES (active, 'order', '1688', 'stale'),
           (draft,  'order', '1688', 'stale-draft');
    UPDATE public.product_events
       SET created_at = now() - interval '100 days'
     WHERE session_id = 'stale' OR session_id = 'stale-draft';

    -- 5 weights: search_click 2, and the half-life is 3 days, so an event aged
    -- 3 days exactly contributes half its weight.
    INSERT INTO public.product_events (product_id, event_type, marketplace_key, session_id, created_at)
    VALUES (active, 'order', '1688', 'aged', now() - interval '3 days');

    SELECT count(*) INTO n FROM public.fn_trending_products(7, 20);
    IF n <> 1 THEN
        fails := fails || ' expected 1 ranked product, got ' || n;
    END IF;

    FOR r IN SELECT * FROM public.fn_trending_products(7, 20) LIMIT 1 LOOP
        IF r.product_id <> active THEN fails := fails || ' wrong product ranked'; END IF;
        -- 13 from the fresh set, + 2 for search_click(=15 total for the four
        -- fresh events), + 4 for the 3-day-old order (half of 8), + 2 for the
        -- 100-day-old order which the window drops.
        IF r.score <> 15.0 + 4.0 THEN fails := fails || ' score = ' || r.score || ', expected 19.000'; END IF;
        IF r.event_count <> 5 THEN fails := fails || ' event_count = ' || r.event_count; END IF;
        IF r.name IS DISTINCT FROM '测试商品' THEN fails := fails || ' name = ' || coalesce(r.name, '<null>'); END IF;
        IF r.marketplace IS DISTINCT FROM '1688' THEN fails := fails || ' marketplace = ' || coalesce(r.marketplace,'<null>'); END IF;
        IF r.image_url IS DISTINCT FROM 'https://cbu01.alicdn.com/img/cap.jpg' THEN
            fails := fails || ' image_url = ' || coalesce(r.image_url, '<null>');
        END IF;
        -- The card that reads this prints "$" beside price_usd and "¥" beside
        -- price_cny. This row has only source_price (1688 quotes CNY), so the
        -- honest answer is a CNY price and NO USD price: an earlier build fed
        -- source_price into price_usd and quoted ¥12.50 to the customer as $12.50.
        IF r.price_usd IS NOT NULL THEN fails := fails || ' expected no USD price, got ' || r.price_usd; END IF;
        IF r.price_cny IS DISTINCT FROM 12.50 THEN fails := fails || ' price_cny = ' || coalesce(r.price_cny::text,'<null>'); END IF;
    END LOOP;

    -- 6 window boundary: a 1-day window keeps the fresh events and drops both
    -- aged ones, so the score falls back to 15.000 with 4 events.
    FOR r IN SELECT * FROM public.fn_trending_products(1, 20) LIMIT 1 LOOP
        IF r.score <> 15.0 THEN fails := fails || ' 1-day score = ' || r.score; END IF;
        IF r.event_count <> 4 THEN fails := fails || ' 1-day events = ' || r.event_count; END IF;
    END LOOP;

    -- 7 arguments are clamped, not trusted: limit 0 would return nothing and a
    -- 9999-day window would aggregate the whole ledger.
    SELECT count(*) INTO n FROM public.fn_trending_products(9999, 0);
    IF n <> 1 THEN fails := fails || ' clamped limit returned ' || n; END IF;
    SELECT count(*) INTO n FROM public.fn_trending_products(-5, 100);
    IF n <> 1 THEN fails := fails || ' negative window returned ' || n; END IF;

    -- 8 a second active product earns less, so the order is fixed: the limiter
    -- collapses its two identical add_to_cart calls into one row (8 + 4 = 12).
    INSERT INTO public.source_products (id, marketplace, source_title, status, moq)
    VALUES ('f0000000-0000-4000-8000-000000000003', 'taobao', 'second', 'active', 1)
    ON CONFLICT (id) DO NOTHING;
    PERFORM public.record_product_event('f0000000-0000-4000-8000-000000000003', 'order', 'taobao');
    PERFORM public.record_product_event('f0000000-0000-4000-8000-000000000003', 'add_to_cart', 'taobao');
    IF public.record_product_event('f0000000-0000-4000-8000-000000000003', 'add_to_cart', 'jd') THEN
        fails := fails || ' duplicate add_to_cart was allowed through';
    END IF;
    SELECT count(*) INTO n FROM public.product_events
     WHERE product_id = 'f0000000-0000-4000-8000-000000000003';
    IF n <> 2 THEN fails := fails || ' second product events = ' || n; END IF;

    -- 9 the ranking is deterministic and ordered by score.
    SELECT name INTO v_top FROM public.fn_trending_products(7, 20) ORDER BY score DESC LIMIT 1;
    IF v_top IS DISTINCT FROM '测试商品' THEN
        fails := fails || ' top of the ranking = ' || coalesce(v_top, '<null>');
    END IF;
    SELECT count(*) INTO n FROM public.fn_trending_products(7, 20);
    IF n <> 2 THEN fails := fails || ' expected 2 ranked products, got ' || n; END IF;

    -- 10 display fields degrade instead of dropping the row: this product has
    -- no title_english and no images.
    FOR r IN SELECT * FROM public.fn_trending_products(7, 20)
             WHERE product_id = 'f0000000-0000-4000-8000-000000000003' LOOP
        IF r.name IS DISTINCT FROM 'second' THEN fails := fails || ' fallback name = ' || coalesce(r.name,'<null>'); END IF;
        IF r.image_url IS NOT NULL THEN fails := fails || ' expected no image, got ' || r.image_url; END IF;
        IF r.price_usd IS NOT NULL THEN fails := fails || ' expected null USD price, got ' || r.price_usd; END IF;
        IF r.price_cny IS NOT NULL THEN fails := fails || ' expected null CNY price, got ' || r.price_cny; END IF;
    END LOOP;

    IF fails = '' THEN
        RAISE NOTICE 'PASS [%] trending: weights, half-life, window, clamping, drafts, orphans, display fallbacks',
            current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'FAIL [%] trending:%', current_setting('cs.generation', true), fails;
    END IF;
END $$;

-- ─── reads on the ledger stay staff-only ──────────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
DO $$
DECLARE n bigint;
BEGIN
    SELECT count(*) INTO n FROM public.product_events;
    IF n = 0 THEN
        RAISE NOTICE 'PASS [%] customer reads 0 rows from the product_events ledger',
            current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'FAIL [%] customer read % product_events rows', current_setting('cs.generation', true), n;
    END IF;
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%permission denied%' THEN
        RAISE NOTICE 'PASS [%] customer refused product_events entirely', current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'FAIL [%] product_events read: %', current_setting('cs.generation', true), SQLERRM;
    END IF;
END $$;

-- A customer may still call the ranking and the writer: that is the feature.
DO $$ BEGIN
    PERFORM 1 FROM public.fn_trending_products(7, 5);
    PERFORM public.record_product_event('f0000000-0000-4000-8000-000000000001', 'view', '1688');
    RAISE NOTICE 'PASS [%] customer can use the trending + telemetry RPCs', current_setting('cs.generation', true);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAIL [%] customer RPC access broken: %', current_setting('cs.generation', true), SQLERRM;
END $$;
RESET ROLE;

-- ─── anon (logged-out browsing) must reach both as well ───────
SET ROLE anon;
DO $$ BEGIN
    IF has_function_privilege('anon', 'public.fn_trending_products(integer,integer)', 'EXECUTE') THEN
        RAISE NOTICE 'PASS [%] anon may call fn_trending_products', current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'FAIL [%] anon lost EXECUTE on fn_trending_products', current_setting('cs.generation', true);
    END IF;
    PERFORM 1 FROM public.fn_trending_products(7, 5);
    RAISE NOTICE 'PASS [%] anon trending read succeeded', current_setting('cs.generation', true);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAIL [%] anon trending read: %', current_setting('cs.generation', true), SQLERRM;
END $$;
RESET ROLE;
