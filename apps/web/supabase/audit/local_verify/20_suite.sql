-- Generation-agnostic regression suite for migration 202609240003_admin_rollups.sql.
-- The physical fixture differs per schema generation; the expectations table
-- says what the numbers must be for that generation. Run as super_admin claim.
DO $$
DECLARE
    v        numeric;
    rows_    int;
    fails    int := 0;
    label    text;
BEGIN
    label := current_setting('cs.generation', true);

    -- ─── 1. revenue excludes cancelled ─────────────────────────
    SELECT value INTO v FROM admin_kpis() WHERE metric = 'revenue_today';
    IF v <> 1300.00 THEN RAISE NOTICE 'FAIL [%] revenue_today=% expected 1300 (cancelled 9999 excluded)', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] revenue_today = 1300', label; END IF;

    SELECT value INTO v FROM admin_kpis() WHERE metric = 'orders_today';
    IF v <> 2 THEN RAISE NOTICE 'FAIL [%] orders_today=% expected 2', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] orders_today = 2 (same set as revenue_today)', label; END IF;

    -- ─── 2. real previous-period deltas, never typed constants ─
    SELECT value INTO v FROM admin_kpis() WHERE metric = 'revenue_30d';
    IF v <> 1800.00 THEN RAISE NOTICE 'FAIL [%] revenue_30d=% expected 1800', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] revenue_30d = 1800', label; END IF;

    SELECT prev_value INTO v FROM admin_kpis() WHERE metric = 'revenue_30d';
    IF v <> 250.00 THEN RAISE NOTICE 'FAIL [%] revenue_30d prev=% expected 250 (the 45-day order)', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] revenue_30d prev-period = 250', label; END IF;

    SELECT delta_pct INTO v FROM admin_kpis() WHERE metric = 'revenue_30d';
    IF v <> 620.0 THEN RAISE NOTICE 'FAIL [%] revenue_30d delta=% expected 620.0', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] revenue_30d delta = 620.0%% (computed)', label; END IF;

    SELECT delta_pct INTO v FROM admin_kpis() WHERE metric = 'revenue_90d';
    IF v IS NOT NULL THEN RAISE NOTICE 'FAIL [%] revenue_90d delta=% expected NULL (no prior period)', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] no-prior-period delta is NULL (UI renders an em dash)', label; END IF;

    -- ─── 3. AOV is derived, and consistent with its own inputs ─
    SELECT value INTO v FROM admin_kpis() WHERE metric = 'aov_30d';
    IF v <> 600.00 THEN RAISE NOTICE 'FAIL [%] aov_30d=% expected 600 (1800/3)', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] aov_30d = 600', label; END IF;

    SELECT round(value,2) INTO v FROM admin_kpis() WHERE metric = 'revenue_90d';
    IF v <> 2050.00 THEN RAISE NOTICE 'FAIL [%] revenue_90d=% expected 2050', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] revenue_90d = 2050', label; END IF;

    -- ─── 4. customers ─────────────────────────────────────────
    SELECT value INTO v FROM admin_kpis() WHERE metric = 'customers_total';
    IF v <> 3 THEN RAISE NOTICE 'FAIL [%] customers_total=% expected 3', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] customers_total = 3', label; END IF;

    SELECT value INTO v FROM admin_kpis() WHERE metric = 'customers_new_30d';
    IF v <> 2 THEN RAISE NOTICE 'FAIL [%] customers_new_30d=% expected 2 (customer + staff)', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] customers_new_30d = 2', label; END IF;

    -- ─── 5. optional operations metrics must not abort the call ─
    SELECT count(*) INTO rows_ FROM admin_kpis() WHERE metric IN
        ('shipments_active','sourcing_pending','warehouse_pending');
    IF rows_ <> 3 THEN RAISE NOTICE 'FAIL [%] operations metrics returned % of 3 (type-abort regression)', label, rows_; fails := fails+1;
    ELSE
        SELECT value INTO v FROM admin_kpis() WHERE metric = 'shipments_active';
        IF v <> 1 THEN RAISE NOTICE 'FAIL [%] shipments_active=% expected 1 (delivered excluded)', label, v; fails := fails+1;
        ELSE RAISE NOTICE 'PASS [%] operations metrics returned; shipments_active = 1', label; END IF;
    END IF;

    -- ── 5b. lifetime and fulfilment metrics (replaced full-table client scans) ──
    SELECT value INTO v FROM admin_kpis() WHERE metric = 'revenue_all_time';
    IF v <> 2050.00 THEN RAISE NOTICE 'FAIL [%] revenue_all_time=% expected 2050 (cancelled 9999 excluded)', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] revenue_all_time = 2050 (never counts a cancelled order)', label; END IF;

    SELECT value INTO v FROM admin_kpis() WHERE metric = 'orders_total';
    IF v <> 4 THEN RAISE NOTICE 'FAIL [%] orders_total=% expected 4', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] orders_total = 4', label; END IF;

    SELECT value INTO v FROM admin_kpis() WHERE metric = 'orders_delivered';
    IF v <> 3 THEN RAISE NOTICE 'FAIL [%] orders_delivered=% expected 3 (CS-3 is shipped, not delivered)', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] orders_delivered = 3', label; END IF;

    SELECT value INTO v FROM admin_kpis() WHERE metric = 'orders_active';
    IF v <> 1 THEN RAISE NOTICE 'FAIL [%] orders_active=% expected 1', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] orders_active = 1 (the in-flight order)', label; END IF;

    -- The old client divided by ALL orders including cancelled, which made the
    -- rate fall every time someone cancelled. Denominator is now non-cancelled.
    SELECT value INTO v FROM admin_kpis() WHERE metric = 'delivery_rate_pct';
    IF v <> 75.0 THEN RAISE NOTICE 'FAIL [%] delivery_rate_pct=% expected 75.0 (3 of 4, cancelled excluded)', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] delivery_rate_pct = 75.0 (cancelled excluded from the denominator)', label; END IF;

    -- Three of the six seeded catalog rows are buyable: 'In stock A', 'In stock
    -- B' and 测试商品. 'Out of stock' says so, 'Draft lot' is not active, and the
    -- second capture row is a draft too. Counted server-side because the client
    -- version of this divided a filtered list by an unfiltered total.
    SELECT value INTO v FROM admin_kpis() WHERE metric = 'products_in_stock';
    IF v <> 3 THEN RAISE NOTICE 'FAIL [%] products_in_stock=% expected 3', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] products_in_stock = 3 (counted server-side)', label; END IF;

    -- ─── 6. daily series: full spine AND counts consistent with revenue ───
    SELECT count(*) INTO rows_ FROM admin_revenue_daily(7);
    IF rows_ <> 7 THEN RAISE NOTICE 'FAIL [%] admin_revenue_daily(7) returned % rows, expected 7', label, rows_; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] daily series returns all 7 days (gaps are 0, not absent)', label; END IF;

    SELECT round(coalesce(sum(revenue),0),2) INTO v FROM admin_revenue_daily(7);
    IF v <> 1300.00 THEN RAISE NOTICE 'FAIL [%] daily revenue sums to % expected 1300', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] daily revenue sums to 1300', label; END IF;

    -- This is the check that catches a filter inconsistency: revenue_today says
    -- 2 orders and daily says 3 because the daily count forgot the cancelled filter.
    SELECT coalesce(sum(orders),0) INTO v FROM admin_revenue_daily(7);
    IF v <> 2 THEN RAISE NOTICE 'FAIL [%] daily order count sums to % expected 2 (must match revenue_today)', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] daily order count agrees with revenue_today', label; END IF;

    -- ─── 7. marketplace breakdown matches this generation exactly ───
    SELECT count(*) INTO rows_
    FROM public.expected_marketplace_revenue e
    FULL OUTER JOIN admin_revenue_by_marketplace(90) a ON a.marketplace = e.marketplace
    WHERE e.marketplace IS NULL OR a.marketplace IS NULL
       OR round(a.revenue,2) <> e.revenue;
    IF rows_ <> 0 THEN
        RAISE NOTICE 'FAIL [%] marketplace breakdown disagrees with the hand-derived fixture', label;
        RAISE NOTICE '  expected: %',
            (SELECT string_agg(format('%s=$%s', marketplace, revenue), ', ' ORDER BY marketplace) FROM public.expected_marketplace_revenue);
        RAISE NOTICE '  actual:   %',
            (SELECT string_agg(format('%s=$%s', marketplace, revenue), ', ' ORDER BY marketplace) FROM admin_revenue_by_marketplace(90));
        fails := fails + 1;
    ELSE
        RAISE NOTICE 'PASS [%] marketplace breakdown = % (exact match, no double-count)',
            label,
            (SELECT string_agg(format('%s=$%s', marketplace, revenue), ', ' ORDER BY marketplace) FROM public.expected_marketplace_revenue);
    END IF;

    SELECT round(sum(revenue),2) INTO v FROM admin_revenue_by_marketplace(90);
    IF v <> 2050.00 THEN RAISE NOTICE 'FAIL [%] marketplace revenue sums to % expected 2050 (leak or double-count)', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] marketplace revenue reconciles exactly to order revenue (2050)', label; END IF;

    IF EXISTS (SELECT 1 FROM admin_revenue_by_marketplace(90)
               WHERE marketplace IN ('Mogadishu','Hargeisa','Bossaso','Kismayo')) THEN
        RAISE NOTICE 'FAIL [%] customer city names leaked into the marketplace breakdown', label; fails := fails+1;
    ELSE
        RAISE NOTICE 'PASS [%] no customer-city names in marketplace breakdown', label;
    END IF;

    -- ─── 8. status counts cover the window, not the last 10 rows ───
    SELECT count(*) INTO rows_ FROM admin_order_status_counts(90);
    IF rows_ <> 3 THEN RAISE NOTICE 'FAIL [%] status counts returned % groups, expected 3 (completed/shipped/cancelled)', label, rows_; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] status counts grouped into 3 statuses', label; END IF;

    SELECT coalesce(sum(orders),0) INTO v FROM admin_order_status_counts(90);
    IF v <> 5 THEN RAISE NOTICE 'FAIL [%] status counts sum to % expected 5 (every order, including cancelled)', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] status counts sum to 5 orders (a cancelled order is visible, not silently dropped)', label; END IF;

    SELECT orders INTO v FROM admin_order_status_counts(90) WHERE status = 'completed';
    IF v <> 3 THEN RAISE NOTICE 'FAIL [%] completed=% expected 3', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] completed = 3 (enum label reads as text on g2)', label; END IF;

    -- Narrow window must actually narrow: CS-2 (29d) and CS-3 (45d) drop out.
    SELECT coalesce(sum(orders),0) INTO v FROM admin_order_status_counts(1);
    IF v <> 3 THEN RAISE NOTICE 'FAIL [%] 1-day status counts sum to % expected 3', label, v; fails := fails+1;
    ELSE RAISE NOTICE 'PASS [%] 1-day window returns 3 orders (window is applied)', label; END IF;

    IF fails = 0 THEN
        RAISE NOTICE '>>> [%] ALL ROLLUP CHECKS PASSED', label;
    ELSE
        RAISE NOTICE '>>> [%] % ROLLUP CHECK(S) FAILED', label, fails;
    END IF;
END $$;
