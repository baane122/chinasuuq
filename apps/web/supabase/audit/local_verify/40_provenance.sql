-- Provenance regression: does orders.items become queryable order_items rows
-- with the marketplace, MOQ and cost actually attached, without ever being able
-- to block a purchase? Run after migrations 18 + 19.
DO $$
DECLARE
    v_has boolean;
    v_id      uuid;
    v_ids     uuid[] := '{}';
    v_row     record;
    v_count   int;
    v_first   uuid;
    v_second  uuid;
    fails     int := 0;
    label     text := current_setting('cs.generation', true);
    modern    jsonb := '[{
        "id":"ci-1","product_name":"Silk scarf","quantity":504,"price_usd":8.28,
        "marketplace":"1688","source_url":"https://detail.1688.com/offer/7001.html",
        "image_url":"https://cbu01.alicdn.com/x.jpg","price_cny":60.0,
        "exchange_rate":7.25,"moq":500,"variant":"Red"
    }]'::jsonb;
BEGIN
    SELECT g.has_items INTO v_has FROM public.generation_caps g;

    -- ── a modern mobile order must land with full provenance ────
    v_id := public.insert_order(modern); v_ids := v_ids || v_id;

    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = v_id) THEN
        RAISE NOTICE 'FAIL [%] the order itself did not survive the sync trigger', label;
        fails := fails + 1;
    ELSE
        RAISE NOTICE 'PASS [%] order write succeeds regardless of provenance sync', label;
    END IF;

    SELECT count(*) INTO v_count FROM public.order_items
    WHERE order_id = v_id AND origin = 'orders_jsonb';

    IF NOT v_has THEN
        IF v_count <> 0 THEN
            RAISE NOTICE 'FAIL [%] generation without an items column produced % rows', label, v_count;
            fails := fails + 1;
        ELSE
            RAISE NOTICE 'PASS [%] no items column: sync produced nothing, and errored never', label;
        END IF;
    ELSIF v_count <> 1 THEN
        RAISE NOTICE 'FAIL [%] modern order normalised to % rows, expected 1', label, v_count;
        fails := fails + 1;
    ELSE
        SELECT * INTO v_row FROM public.order_items WHERE order_id = v_id LIMIT 1;

        IF v_row.marketplace_key IS DISTINCT FROM '1688' THEN
            RAISE NOTICE 'FAIL [%] marketplace_key=% expected 1688', label, v_row.marketplace_key; fails := fails+1;
        ELSE RAISE NOTICE 'PASS [%] marketplace_key = 1688 (the app the customer was in)', label; END IF;

        IF v_row.moq_at_purchase IS DISTINCT FROM 500 THEN
            RAISE NOTICE 'FAIL [%] moq_at_purchase=% expected 500', label, v_row.moq_at_purchase; fails := fails+1;
        ELSE RAISE NOTICE 'PASS [%] moq_at_purchase = 500 (snapshotted, not re-read from the supplier)', label; END IF;

        IF v_row.unit_price_cny IS DISTINCT FROM 60.0 THEN
            RAISE NOTICE 'FAIL [%] unit_price_cny=% expected 60', label, v_row.unit_price_cny; fails := fails+1;
        ELSE RAISE NOTICE 'PASS [%] unit_price_cny = 60.00', label; END IF;

        IF v_row.exchange_rate IS DISTINCT FROM 7.25 THEN
            RAISE NOTICE 'FAIL [%] exchange_rate=% expected 7.25', label, v_row.exchange_rate; fails := fails+1;
        ELSE RAISE NOTICE 'PASS [%] exchange_rate = 7.25 (the rate the USD figures were derived at)', label; END IF;

        IF v_row.quantity IS DISTINCT FROM 504 THEN
            RAISE NOTICE 'FAIL [%] quantity=% expected 504', label, v_row.quantity; fails := fails+1;
        ELSE RAISE NOTICE 'PASS [%] quantity = 504', label; END IF;

        IF v_row.total_price IS DISTINCT FROM 4173.12 THEN
            RAISE NOTICE 'FAIL [%] total_price=% expected 4173.12 (8.28 x 504)', label, v_row.total_price; fails := fails+1;
        ELSE RAISE NOTICE 'PASS [%] total_price = 4173.12 (unit x quantity)', label; END IF;

        IF v_row.source_url IS DISTINCT FROM 'https://detail.1688.com/offer/7001.html' THEN
            RAISE NOTICE 'FAIL [%] source_url=% expected the 1688 listing', label, v_row.source_url; fails := fails+1;
        ELSE RAISE NOTICE 'PASS [%] source_url kept (staff can reopen the exact listing)', label; END IF;

        IF v_row.variant_name IS DISTINCT FROM 'Red' THEN
            RAISE NOTICE 'FAIL [%] variant_name=% expected Red', label, v_row.variant_name; fails := fails+1;
        ELSE RAISE NOTICE 'PASS [%] variant_name = Red', label; END IF;

        -- The whole point: the admin view resolves the app name and logo.
        IF (SELECT marketplace_name FROM public.admin_order_items_view WHERE order_id = v_id) <> '1688.com' THEN
            RAISE NOTICE 'FAIL [%] admin view did not resolve the marketplace display name', label; fails := fails+1;
        ELSE
            RAISE NOTICE 'PASS [%] admin view -> 1688.com + logo + order_ref %',
                label, (SELECT order_ref FROM public.admin_order_items_view WHERE order_id = v_id);
        END IF;

        -- ── idempotency: an unrelated UPDATE re-fires the trigger ──
        SELECT id INTO v_first FROM public.order_items WHERE order_id = v_id;
        UPDATE public.orders SET status = 'confirmed' WHERE id = v_id;
        SELECT count(*) INTO v_count FROM public.order_items WHERE order_id = v_id;
        IF v_count <> 1 THEN
            RAISE NOTICE 'FAIL [%] re-sync duplicated the row (% rows)', label, v_count; fails := fails+1;
        ELSE
            SELECT id INTO v_second FROM public.order_items WHERE order_id = v_id;
            IF v_second IS DISTINCT FROM v_first THEN
                RAISE NOTICE 'FAIL [%] re-sync changed the primary key', label; fails := fails+1;
            ELSE
                RAISE NOTICE 'PASS [%] re-sync is an upsert: one row, same primary key', label;
            END IF;
        END IF;

        -- ── removing an item must remove its row, but never a staff row ──
        INSERT INTO public.order_items(order_id, product_name, unit_price, total_price)
        VALUES (v_id, 'Staff-added line', 10, 10);
        UPDATE public.orders SET items = '[]'::jsonb WHERE id = v_id;
        SELECT count(*) INTO v_count FROM public.order_items
        WHERE order_id = v_id AND origin = 'orders_jsonb';
        IF v_count <> 0 THEN
            RAISE NOTICE 'FAIL [%] % jsonb rows survived after the items were emptied', label, v_count; fails := fails+1;
        ELSE RAISE NOTICE 'PASS [%] emptied items removed only the jsonb-sourced rows', label; END IF;

        IF NOT EXISTS (SELECT 1 FROM public.order_items
                       WHERE order_id = v_id AND product_name = 'Staff-added line') THEN
            RAISE NOTICE 'FAIL [%] the sync deleted a row a staff member typed in', label; fails := fails+1;
        ELSE RAISE NOTICE 'PASS [%] staff-entered order_items rows are never touched', label; END IF;

        -- ── hostile payloads: garbage in the JSON must not break the order ──
        v_id := public.insert_order('[1, "text", {"quantity":"abc"}]'::jsonb);
        v_ids := v_ids || v_id;
        SELECT count(*) INTO v_count FROM public.order_items WHERE order_id = v_id;
        IF v_count <> 1 THEN
            RAISE NOTICE 'FAIL [%] non-array JSON elements yielded % rows, expected 1', label, v_count; fails := fails+1;
        ELSE
            SELECT * INTO v_row FROM public.order_items WHERE order_id = v_id;
            IF v_row.quantity <> 1 OR v_row.product_name <> 'Unnamed item' OR v_row.marketplace_key IS NOT NULL THEN
                RAISE NOTICE 'FAIL [%] junk item did not degrade safely: qty=% name=% mp=%',
                    label, v_row.quantity, v_row.product_name, v_row.marketplace_key;
                fails := fails + 1;
            ELSE
                RAISE NOTICE 'PASS [%] junk item degrades to qty 1 / ''Unnamed item'' / NULL marketplace', label;
            END IF;
        END IF;

        v_id := public.insert_order('{"not":"an array"}'::jsonb);
        v_ids := v_ids || v_id;
        IF EXISTS (SELECT 1 FROM public.order_items WHERE order_id = v_id) THEN
            RAISE NOTICE 'FAIL [%] a non-array items blob produced rows', label; fails := fails+1;
        ELSE
            RAISE NOTICE 'PASS [%] non-array items blob ignored, order still written', label;
        END IF;

        -- ── legacy mobile rows: no provenance keys at all ───────
        v_id := public.insert_order('[{"id":"ci-0","product_name":"Old item","quantity":2,"price_usd":5.5}]'::jsonb);
        v_ids := v_ids || v_id;
        SELECT * INTO v_row FROM public.order_items WHERE order_id = v_id;
        IF v_row.id IS NULL THEN
            RAISE NOTICE 'FAIL [%] a legacy-shaped item was dropped entirely', label; fails := fails+1;
        ELSIF v_row.marketplace_key IS NOT NULL THEN
            RAISE NOTICE 'FAIL [%] invented marketplace % for an order that never had one',
                label, v_row.marketplace_key; fails := fails+1;
        ELSE
            RAISE NOTICE 'PASS [%] legacy item kept, marketplace left NULL (Unattributed, not guessed)', label;
        END IF;
        IF v_row.total_price IS DISTINCT FROM 11.00 THEN
            RAISE NOTICE 'FAIL [%] legacy total_price=% expected 11.00', label, v_row.total_price; fails := fails+1;
        ELSE RAISE NOTICE 'PASS [%] legacy total_price = 11.00', label; END IF;
    END IF;

    -- ── pre-existing staff rows from the seed must survive migration 19 ──
    IF EXISTS (SELECT 1 FROM public.order_items WHERE origin IS NULL) THEN
        RAISE NOTICE 'FAIL [%] some order_items rows have no origin', label; fails := fails+1;
    ELSE
        RAISE NOTICE 'PASS [%] every order_items row declares an origin (backfilled rows default to staff)', label;
    END IF;

    -- Clean up by identity, never by naming an order column: which spelling
    -- exists (reference / order_number / neither) is what varies per generation.
    DELETE FROM public.order_items WHERE order_id = ANY (v_ids);
    DELETE FROM public.orders WHERE id = ANY (v_ids);

    IF fails = 0 THEN
        RAISE NOTICE '>>> [%] ALL PROVENANCE CHECKS PASSED', label;
    ELSE
        RAISE NOTICE '>>> [%] % PROVENANCE CHECK(S) FAILED', label, fails;
    END IF;
END $$;
