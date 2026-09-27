-- ============================================================
-- ChinaSuuq — Migration 18: real admin metrics (replaces fabricated numbers)
-- 2026-09-24
--
-- Mission Control currently shows numbers that are not real:
--   • "Revenue by Marketplace" is derived from customer CITY names
--     (Mogadishu -> 1688, Hargeisa -> Taobao). It invents business provenance.
--   • StatCard deltas are hardcoded constants (delta={12}, {8}, {15}).
--   • "today's revenue" is summed from only the 10 most recent order rows.
--   • KPIs aggregate full-table client-side selects, which will not scale.
--
-- This migration moves the math into Postgres and returns real previous-period
-- values so deltas can be computed instead of typed.
--
-- SCHEMA GENERATION: the live orders table is either the migration-0007 shape
-- (profile_id, subtotal, total) or the live shape reported by
-- 20260813_admin_view_layer_corrected.sql (user_id, subtotal_usd, total_usd),
-- and the repo cannot prove which. Rather than guess, every accessor below reads
-- through to_jsonb() with COALESCE across both spellings — the same hedge
-- migration 202609210001 uses in orders_money_guard(). Both generations work.
--
-- SECURITY: these run SECURITY DEFINER (owner bypasses RLS), so each one
-- refuses a caller who is not staff/super_admin, and EXECUTE is revoked from
-- anon. Without that gate, any customer could read global revenue.
-- ============================================================

-- ─── 0. Shared money/owner accessors ─────────────────────────────
-- One place resolves both schema generations, so the KPI queries stay readable.
CREATE OR REPLACE FUNCTION public._order_total_usd(o public.orders)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (to_jsonb(o)->>'total_usd')::numeric,
    (to_jsonb(o)->>'total')::numeric,
    0
  );
$$;

CREATE OR REPLACE FUNCTION public._order_revenue_status(o public.orders)
RETURNS boolean LANGUAGE sql STABLE AS $$
  -- Count an order toward revenue only when it is neither cancelled nor
  -- refunded. Status enum labels are read from to_jsonb so the spelling of the
  -- column (status / payment_status) cannot break the aggregate.
  SELECT COALESCE(to_jsonb(o)->>'status','') NOT IN
    ('cancelled','canceled','refunded','cancelled_refunded');
$$;

-- ─── 1. Gate helper ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._require_admin_metrics_access()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_staff_or_admin() THEN
        RAISE EXCEPTION 'ChinaSuuq: admin metrics require a staff or super_admin session';
    END IF;
END;
$$;

-- ─── 2. KPIs with real previous-period deltas ───────────────────
-- Returns one row per metric so new KPIs never change the return type.
CREATE OR REPLACE FUNCTION public.admin_kpis()
RETURNS TABLE (
    metric      text,
    value       numeric,
    prev_value  numeric,
    delta_pct   numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    now_ts        timestamptz := now();
    today_start   timestamptz := date_trunc('day', now_ts);
    d30           timestamptz := now_ts - interval '30 days';
    d30_prev      timestamptz := now_ts - interval '60 days';
    d90           timestamptz := now_ts - interval '90 days';
    v_stock_pred  text;
BEGIN
    PERFORM public._require_admin_metrics_access();

    -- Resolved once up front, because a column named inside EXECUTE'd SQL is not
    -- checked until it runs: `stock_status` exists only from 202609250004 on, and
    -- referencing it here raised 42703 on first call, which — plpgsql cannot
    -- resume mid-function — took every card on Mission Control down with it, not
    -- just the catalog one.
    --
    -- Which flag to read is a per-catalog question, not a per-schema-version one.
    -- `in_stock` is the boolean the 202408010004 importers write; `stock_status`
    -- is the three-state enum a curated catalog carries, and on the live project
    -- it is the ONLY stock column, NOT NULL, so the old "no in_stock → report 0"
    -- fallback hid a sellable catalog rather than being honest about it. Either
    -- way low_stock counts: it is buyable, just thin.
    --
    -- Both arms are constants built here, never caller input, so the concatenation
    -- below cannot be steered by a client.
    SELECT CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'source_products'
              AND column_name = 'in_stock'
        ) THEN 'coalesce(sp.in_stock, TRUE)'
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'source_products'
              AND column_name = 'stock_status'
        ) THEN 'coalesce(sp.stock_status::text, ''in_stock'') <> ''out_of_stock'''
        ELSE NULL
    END INTO v_stock_pred;

    -- ── revenue + order counts ─────────────────────────────────
    RETURN QUERY WITH o AS (
        SELECT
            o2.created_at                                   AS created_at,
            public._order_total_usd(o2)                      AS total_usd,
            public._order_revenue_status(o2)                 AS counts,
            lower(coalesce(to_jsonb(o2) ->> 'status', ''))   AS status
        FROM public.orders o2
    ), agg AS (
        SELECT
            sum(total_usd) FILTER (WHERE counts AND created_at >= d90)   AS rev_90,
            sum(total_usd) FILTER (WHERE counts AND created_at >= d30)   AS rev_30,
            sum(total_usd) FILTER (WHERE counts AND created_at >= d30_prev
                                        AND created_at <  d30)           AS rev_30_prev,
            sum(total_usd) FILTER (WHERE counts AND created_at >= today_start) AS rev_today,
            sum(total_usd) FILTER (WHERE counts
                                        AND created_at >= today_start - interval '1 day'
                                        AND created_at <  today_start)   AS rev_yesterday,
            sum(total_usd) FILTER (WHERE counts)                         AS rev_all,
            -- Order counts exclude cancelled as well, so "orders_today" and
            -- "revenue_today" describe the same set of orders. Mixing one
            -- revenue-filtered metric with one unfiltered count makes AOV and
            -- volume disagree for reasons staff cannot see.
            count(*) FILTER (WHERE counts AND created_at >= d30)                    AS orders_30,
            count(*) FILTER (WHERE counts AND created_at >= d30_prev AND created_at < d30) AS orders_30_prev,
            count(*) FILTER (WHERE counts AND created_at >= today_start)            AS orders_today,
            count(*) FILTER (WHERE counts AND created_at >= today_start - interval '1 day'
                                  AND created_at < today_start)                     AS orders_yesterday,
            -- These three replace client-side passes over the whole orders table.
            count(*) FILTER (WHERE counts)                                          AS orders_all,
            count(*) FILTER (WHERE status IN ('delivered','completed'))             AS orders_delivered,
            count(*) FILTER (WHERE status NOT IN
                ('delivered','completed','cancelled','canceled','refunded'))        AS orders_active
        FROM o
    )
    -- Lifetime revenue. Deliberately excludes cancelled/refunded orders, which
    -- the client-side sum it replaces did not: the old card reported money that
    -- was never earned, and the number only ever went up.
    SELECT 'revenue_all_time', round(agg.rev_all, 2), NULL::numeric, NULL::numeric FROM agg
    UNION ALL SELECT 'revenue_90d', round(agg.rev_90, 2), NULL::numeric, NULL::numeric FROM agg
    UNION ALL SELECT 'revenue_30d', round(agg.rev_30, 2), round(agg.rev_30_prev, 2),
        CASE WHEN coalesce(agg.rev_30_prev,0) = 0 THEN NULL
             ELSE round(((agg.rev_30 - agg.rev_30_prev) / agg.rev_30_prev * 100)::numeric, 1) END
        FROM agg
    UNION ALL SELECT 'revenue_today', round(agg.rev_today, 2), round(agg.rev_yesterday, 2),
        CASE WHEN coalesce(agg.rev_yesterday,0) = 0 THEN NULL
             ELSE round(((agg.rev_today - agg.rev_yesterday) / agg.rev_yesterday * 100)::numeric, 1) END
        FROM agg
    UNION ALL SELECT 'orders_30d', agg.orders_30, agg.orders_30_prev,
        CASE WHEN coalesce(agg.orders_30_prev,0) = 0 THEN NULL
             ELSE round(((agg.orders_30 - agg.orders_30_prev)::numeric / agg.orders_30_prev * 100), 1) END
        FROM agg
    UNION ALL SELECT 'orders_today', agg.orders_today, agg.orders_yesterday,
        CASE WHEN coalesce(agg.orders_yesterday,0) = 0 THEN NULL
             ELSE round(((agg.orders_today - agg.orders_yesterday)::numeric / agg.orders_yesterday * 100), 1) END
        FROM agg
    UNION ALL SELECT 'orders_total', agg.orders_all, NULL::numeric, NULL::numeric FROM agg
    UNION ALL SELECT 'orders_active', agg.orders_active, NULL::numeric, NULL::numeric FROM agg
    UNION ALL SELECT 'orders_delivered', agg.orders_delivered, NULL::numeric, NULL::numeric FROM agg
    UNION ALL SELECT 'delivery_rate_pct',
        CASE WHEN agg.orders_all = 0 THEN 0::numeric
             -- The cast is load-bearing: bigint / bigint is integer division, so
             -- 3 delivered of 4 orders would have reported 0%.
             ELSE round(agg.orders_delivered::numeric / agg.orders_all * 100, 1) END,
        NULL::numeric, NULL::numeric
        FROM agg
    -- AOV over 30 days, plus the prior 30 days for a real delta.
    UNION ALL SELECT 'aov_30d',
        CASE WHEN agg.orders_30 = 0 THEN 0 ELSE round(agg.rev_30 / agg.orders_30, 2) END,
        CASE WHEN coalesce(agg.orders_30_prev,0) = 0 THEN NULL
             ELSE round(agg.rev_30_prev / agg.orders_30_prev, 2) END,
        CASE WHEN coalesce(agg.orders_30_prev,0) = 0 OR coalesce(agg.rev_30_prev,0) = 0 THEN NULL
             ELSE round(((agg.rev_30 / nullif(agg.orders_30,0)) -
                         (agg.rev_30_prev / agg.orders_30_prev))
                        / (agg.rev_30_prev / agg.orders_30_prev) * 100, 1) END
        FROM agg;

    -- ── customers ──────────────────────────────────────────────
    RETURN QUERY WITH c AS (
        SELECT created_at FROM public.profiles
    )
    SELECT 'customers_total',
        count(*)::numeric,
        count(*) FILTER (WHERE c.created_at < d30)::numeric,
        CASE WHEN count(*) FILTER (WHERE c.created_at < d30) = 0 THEN NULL
             ELSE round((count(*) FILTER (WHERE c.created_at >= d30))::numeric
                   / count(*) FILTER (WHERE c.created_at < d30) * 100, 1) END
    FROM c
    UNION ALL
    SELECT 'customers_new_30d',
        count(*) FILTER (WHERE c.created_at >= d30)::numeric,
        count(*) FILTER (WHERE c.created_at >= d30_prev AND c.created_at < d30)::numeric,
        NULL::numeric FROM c;

    -- ── operations ─────────────────────────────────────────────
    -- Each guarded by to_regclass so a missing table yields 0 instead of
    -- aborting the whole dashboard. Every placeholder NULL in this function,
    -- static or dynamic, is cast to numeric on purpose. Two adjacent untyped
    -- NULLs in a UNION merge to text before any numeric arm is reached, and the
    -- next numeric arm then fails to match: "UNION types text and numeric cannot
    -- be matched". In the dynamic branches an untyped NULL instead aborts
    -- RETURN QUERY with "structure of query does not match function result
    -- type". Both take the entire dashboard down over one optional metric.
    IF to_regclass('public.shipments') IS NOT NULL THEN
        RETURN QUERY EXECUTE
            'SELECT ''shipments_active''::text,
                    count(*) FILTER (WHERE status::text IN (''in_transit'',''in_transit_air'',''in_transit_sea'',''processing''))::numeric,
                    NULL::numeric, NULL::numeric
             FROM public.shipments';
    ELSE
        RETURN QUERY SELECT 'shipments_active'::text, 0::numeric, NULL::numeric, NULL::numeric;
    END IF;

    IF to_regclass('public.sourcing_requests') IS NOT NULL THEN
        RETURN QUERY EXECUTE
            'SELECT ''sourcing_pending''::text, count(*)::numeric, NULL::numeric, NULL::numeric
             FROM public.sourcing_requests
             WHERE status::text IN (''pending'',''new'',''requested'',''in_progress'')';
    ELSE
        RETURN QUERY SELECT 'sourcing_pending'::text, 0::numeric, NULL::numeric, NULL::numeric;
    END IF;

    IF to_regclass('public.warehouse_packages') IS NOT NULL THEN
        RETURN QUERY EXECUTE
            'SELECT ''warehouse_pending''::text, count(*)::numeric, NULL::numeric, NULL::numeric
             FROM public.warehouse_packages
             WHERE status::text IN (''received'',''inspected'',''awaiting_consolidation'',''stored'')';
    ELSE
        RETURN QUERY SELECT 'warehouse_pending'::text, 0::numeric, NULL::numeric, NULL::numeric;
    END IF;

    -- Catalog size. Guards against a differently-named or absent table because
    -- this metric replaced a client-side `.from('source_products').select('*')`
    -- that pulled every in-stock row into the browser to count them.
    IF to_regclass('public.source_products') IS NOT NULL AND v_stock_pred IS NOT NULL THEN
        RETURN QUERY EXECUTE
            'SELECT ''products_in_stock''::text, count(*)::numeric, NULL::numeric, NULL::numeric
             FROM public.source_products sp
             WHERE ' || v_stock_pred || '
               -- Drafts and archived rows are not catalog a customer can buy,
               -- but the column is not in every generation either: reading it
               -- through to_jsonb() means a missing key defaults to "live"
               -- instead of raising 42703 and taking the dashboard down.
               AND coalesce(nullif(to_jsonb(sp) ->> ''status'', ''''), ''active'') = ''active''';
    ELSE
        IF to_regclass('public.source_products') IS NOT NULL THEN
            RAISE WARNING 'ChinaSuuq: source_products has neither in_stock nor stock_status — products_in_stock reports 0';
        END IF;
        RETURN QUERY SELECT 'products_in_stock'::text, 0::numeric, NULL::numeric, NULL::numeric;
    END IF;
END;
$$;

-- ─── 3. Daily revenue with a real date spine ────────────────────
-- Empty days must appear as 0. The current hand-rolled chart silently
-- compresses gaps, which makes a dead week look like a busy one.
CREATE OR REPLACE FUNCTION public.admin_revenue_daily(p_days integer DEFAULT 30)
RETURNS TABLE (day date, revenue numeric, orders bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    span integer := greatest(1, least(coalesce(p_days, 30), 365));
BEGIN
    PERFORM public._require_admin_metrics_access();

    RETURN QUERY
    WITH spine AS (
        SELECT generate_series(
            (current_date - (span - 1) * interval '1 day')::date,
            current_date::date,
            interval '1 day'
        )::date AS day
    ), o AS (
        SELECT
            date_trunc('day', o2.created_at)::date AS day,
            public._order_total_usd(o2)             AS total_usd,
            public._order_revenue_status(o2)        AS counts
        FROM public.orders o2
        WHERE o2.created_at >= (current_date - (span - 1) * interval '1 day')
    )
    SELECT
        spine.day,
        round(coalesce(sum(o.total_usd) FILTER (WHERE o.counts), 0), 2),
        -- The count must use the same revenue filter as the sum beside it.
        -- A bare count(*) here included cancelled orders, so a day whose only
        -- order was cancelled rendered as "$0 from 1 order" and the series total
        -- disagreed with the revenue_today KPI card for reasons staff cannot see.
        count(*) FILTER (WHERE o.counts)
    FROM spine
    LEFT JOIN o ON o.day = spine.day
    GROUP BY spine.day
    ORDER BY spine.day;
END;
$$;

-- ─── 4. Honest marketplace breakdown ───────────────────────────
-- Replaces the customer-city heuristic. Reads provenance from the order line
-- items when present, falling back to orders.target_marketplace, and buckets
-- anything unknown as 'Unattributed' rather than inventing a source.
--
-- Column access is through to_jsonb() throughout, NOT through bare column
-- references and NOT through dynamic column detection. A verified reason: an
-- earlier revision of this function checked information_schema for `items` and
-- then still named `target_marketplace` in the query body, so on the legacy
-- shape (no items, no target_marketplace) the function aborted with
-- "column o2.target_marketplace does not exist" and the dashboard card broke.
-- to_jsonb(orders)->>'target_marketplace' simply returns NULL when the column
-- is absent, which collapses both schema generations into one code path.
--
-- Item keys are matched tolerantly (marketplace / marketplace_name /
-- source_marketplace / app / platform) because the exact key inside the JSON
-- blob is not yet confirmed — see supabase/audit/20260924_schema_probe.sql.
--
-- The `orders` column counts ORDERS TOUCHING a marketplace, not distinct
-- orders: a mixed-marketplace order legitimately appears under each marketplace
-- it contains, so these numbers sum to more than the order count. Keep that in
-- mind before reading it as per-marketplace order volume.

-- Tolerant JSON readers. Marketplace item JSON is written by the mobile app and
-- may hold money as a symbol-prefixed string ("¥600"), so a bare ::numeric cast
-- would abort the whole breakdown. These return NULL instead.
CREATE OR REPLACE FUNCTION public._jsonb_number(j jsonb, keys text[])
RETURNS numeric LANGUAGE sql STABLE AS $$
    SELECT s.x::numeric
    FROM unnest(keys) AS k(key)
    CROSS JOIN LATERAL (SELECT j ->> k.key AS x) s
    WHERE s.x ~ '^-?[0-9]+(\.[0-9]+)?$'
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public._jsonb_text(j jsonb, keys text[])
RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(btrim(s.x), '')
    FROM unnest(keys) AS k(key)
    CROSS JOIN LATERAL (SELECT j ->> k.key AS x) s
    WHERE coalesce(btrim(s.x), '') <> ''
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.admin_revenue_by_marketplace(p_days integer DEFAULT 90)
RETURNS TABLE (marketplace text, revenue numeric, orders bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    span integer := greatest(1, least(coalesce(p_days, 90), 365));
BEGIN
    PERFORM public._require_admin_metrics_access();

    RETURN QUERY
    WITH o AS (
        SELECT
            o2.id,
            public._order_total_usd(o2)  AS total_usd,
            public._order_revenue_status(o2) AS counts,
            CASE WHEN jsonb_typeof(to_jsonb(o2) -> 'items') = 'array'
                 THEN to_jsonb(o2) -> 'items'
                 ELSE '[]'::jsonb END    AS items,
            public._jsonb_text(to_jsonb(o2), ARRAY['target_marketplace']) AS order_mp
        FROM public.orders o2
        WHERE o2.created_at >= now() - span * interval '1 day'
    ), lines AS (
        SELECT
            o.id, o.total_usd, o.counts, o.order_mp,
            public._jsonb_text(li, ARRAY['marketplace','marketplace_name',
                                         'source_marketplace','app','platform']) AS item_mp,
            public._jsonb_number(li, ARRAY['total_price','line_total','total'])  AS line_total
        FROM o
        LEFT JOIN LATERAL jsonb_array_elements(o.items) AS li ON true
    ), attributed AS (
        -- (a) no usable line-level provenance: attribute the whole order to its
        --     order-level marketplace, or honestly to Unattributed.
        SELECT
            l.id,
            coalesce(l.order_mp, 'Unattributed') AS marketplace,
            l.total_usd                          AS revenue
        FROM lines l
        WHERE l.item_mp IS NULL AND l.counts
        GROUP BY l.id, l.order_mp, l.total_usd
        UNION ALL
        -- (b) line-level provenance: split the order total proportionally by
        --     line money, or evenly when lines carry no money, so a mixed
        --     marketplace order can never attribute more than it is worth.
        SELECT
            l.id,
            l.item_mp AS marketplace,
            CASE
                WHEN sum(l.line_total) OVER (PARTITION BY l.id) > 0
                     AND l.line_total IS NOT NULL
                    THEN l.total_usd * l.line_total
                         / sum(l.line_total) OVER (PARTITION BY l.id)
                WHEN count(*) OVER (PARTITION BY l.id) > 0
                    THEN l.total_usd / count(*) OVER (PARTITION BY l.id)
                ELSE 0
            END
        FROM lines l
        WHERE l.item_mp IS NOT NULL AND l.counts
    )
    SELECT a.marketplace, round(sum(a.revenue), 2), count(DISTINCT a.id)
    FROM attributed a
    GROUP BY a.marketplace
    ORDER BY 2 DESC;
END;
$$;

-- ─── 5. Status distribution over a real window ────────────────
-- The donut used to group the 10 most recent order rows, so one slow afternoon
-- rendered as "60% of the pipeline is pending" and the percentages moved every
-- time a new order arrived. This counts every order in the window.
CREATE OR REPLACE FUNCTION public.admin_order_status_counts(p_days integer DEFAULT 90)
RETURNS TABLE (status text, orders bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    span integer := greatest(1, least(coalesce(p_days, 90), 365));
BEGIN
    PERFORM public._require_admin_metrics_access();

    RETURN QUERY
    SELECT coalesce(nullif(btrim(to_jsonb(o2) ->> 'status'), ''), 'unknown'),
           count(*)::bigint
    FROM public.orders o2
    WHERE o2.created_at >= now() - span * interval '1 day'
    GROUP BY 1
    ORDER BY 2 DESC;
END;
$$;

-- ─── 6. Access control ────────────────────────────────────────
REVOKE ALL ON FUNCTION public.admin_kpis() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_revenue_daily(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_revenue_by_marketplace(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_order_status_counts(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_kpis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revenue_daily(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revenue_by_marketplace(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_order_status_counts(integer) TO authenticated;

-- ============================================================
-- VERIFY AFTER APPLYING (as a staff user; anon must get 403/exception):
--   SELECT * FROM admin_kpis();                        -- deltas, not constants
--   SELECT * FROM admin_revenue_daily(7);              -- 7 rows, gaps included
--   SELECT * FROM admin_revenue_by_marketplace(90);    -- may show 'Unattributed'
--   SELECT * FROM admin_order_status_counts(90);       -- whole window, not 10 rows
-- ============================================================
