-- ============================================================
-- ChinaSuuq — Migration 20: product engagement events + trending
-- 2026-09-25
--
-- WHY: nothing records what customers actually look at. source_products.sales_count
-- is a snapshot copied from the marketplace, carts and orders are the only
-- signals, and both arrive long after the browsing decision. So "what is
-- trending this week" could not be answered at all, and the home screen had no
-- real ordering to offer.
--
-- This adds an append-only event ledger and one cheap rollup:
--   public.product_events       — view / search_click / add_to_cart / order
--   public.record_product_event — the only write path clients get
--   public.fn_trending_products — weighted, recency-decayed ranking
--   public.admin_product_events_view — the staff review surface
--
-- TRENDING SCORE (reviewable, deliberately simple):
--   weight: view = 1, search_click = 2, add_to_cart = 4, order = 8
--   decay : 0.5 ^ (age_days / 3)        — a 3-day half-life
--   score = sum over the window of  weight(event) * decay, rounded to 3 decimals
--   ranking is by that rounded score, then by event_count, then product id
--   event_count = raw number of events, returned beside the score so a reader
--                 can tell "few strong actions" from "many views"
-- One view 3 days ago therefore counts half as much as one today, and one order
-- is worth eight views. Both constants are meant to be argued about, which is
-- why they are inline here rather than hidden in application code.
--
-- SCHEMA GENERATION: source_products' display columns are not stable across the
-- migration history — migration 0004 created source_title/source_images/
-- source_price, and later generations carry title_english/images/
-- price_usd_estimated (see apps/mobile/src/db/index.ts mapRowToProduct). Naming
-- one spelling aborts the query on a database that lacks it, so every display
-- field below is read through to_jsonb(ROW) with a candidate key list, which
-- yields NULL for an absent key. Same hedge as migrations 18 and 19, and it
-- reuses their public._jsonb_text / public._jsonb_number tolerant readers.
--
-- SECURITY: record_product_event is SECURITY DEFINER so an anon browse event
-- can be written without opening the whole ledger to the internet; it takes
-- three arguments and composes no caller-controlled SQL. fn_trending_products is
-- SECURITY DEFINER because it must read the ledger past its staff-only SELECT
-- policy — it returns nothing a public product page does not already show
-- (name, image, price, and a count). Both are REVOKEd from PUBLIC. The view runs
-- with invoker rights on Postgres 15+, where RLS decides its reader; on an older
-- server the flag cannot be set, so REVOKE keeps anon out and only the staff
-- policy is deferred. See the VERIFY block at the foot of this file.
-- ============================================================

-- ─── 1. Event ledger ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- No FK on purpose: source_products rows are re-synced and replaced, and a
    -- dropped listing must never take its engagement history with it.
    product_id      uuid,
    event_type      text NOT NULL CHECK (event_type IN ('view','add_to_cart','order','search_click')),
    marketplace_key text,
    session_id      text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Both ranking paths start here: "events for this product in the window" and
-- "events of this type in the window".
CREATE INDEX IF NOT EXISTS idx_product_events_product_created
    ON public.product_events(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_product_events_type_created
    ON public.product_events(event_type, created_at);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_events_append ON public.product_events;
-- Browsing telemetry carries no owner to protect; the row says only which
-- product was looked at. Reads are gated separately, so append stays open to
-- guests, which is most of the traffic.
CREATE POLICY product_events_append ON public.product_events
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS product_events_select_staff ON public.product_events;
CREATE POLICY product_events_select_staff ON public.product_events
    FOR SELECT TO authenticated
    USING (public.is_staff_or_admin());
-- No UPDATE or DELETE policy exists, so RLS denies both to every non-owner
-- role: the ledger stays append-only.

GRANT INSERT ON public.product_events TO anon, authenticated;
GRANT SELECT ON public.product_events TO authenticated;

-- ─── 2. The only client-facing write ───────────────────────────
-- Rate limit is crude by design and stateless: refuse when this caller already
-- recorded the same product+event within the last 60 seconds. A count over
-- (product_id, event_type, caller) uses idx_product_events_product_created and
-- needs no cron job and no counter table.
--
-- The caller key lives in session_id because the ledger has no user column: an
-- event is telemetry about a product, not a record owned by a profile, and
-- adding a profile_id FK would put customer identities on a table guests write
-- to. Honest limitation: an anon caller has no uid, so all guest events share
-- one bucket and a burst of guests on the same product+event collapses to one
-- row. That undercounts guest views without corrupting them, and session_id is
-- where a real per-session handle goes when that matters.
CREATE OR REPLACE FUNCTION public.record_product_event(
    p_product_id uuid,
    p_event_type text,
    p_marketplace_key text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_key text := auth.uid()::text;
BEGIN
    IF p_product_id IS NULL OR p_event_type IS NULL THEN
        RAISE EXCEPTION 'ChinaSuuq: record_product_event requires p_product_id and p_event_type';
    END IF;

    IF p_event_type NOT IN ('view','add_to_cart','order','search_click') THEN
        -- A typo here is a programming error, not traffic to swallow.
        RAISE EXCEPTION 'ChinaSuuq: unknown product event type %', p_event_type;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.product_events e
        WHERE e.product_id = p_product_id
          AND e.event_type = p_event_type
          AND coalesce(e.session_id, '') = coalesce(v_caller_key, '')
          AND e.created_at > now() - interval '60 seconds'
    ) THEN
        RETURN false;
    END IF;

    INSERT INTO public.product_events (product_id, event_type, marketplace_key, session_id)
    VALUES (
        p_product_id,
        p_event_type,
        nullif(btrim(coalesce(p_marketplace_key, '')), ''),
        v_caller_key
    );

    RETURN true;
END;
$$;

-- ─── 3. Trending ranking ───────────────────────────────────────
-- Cost is bounded by the window, not the table: aggregate the events inside
-- p_days first, then join only the products that produced them.
--
-- The signature below has SEVEN output columns; the version first deployed had
-- six. Postgres refuses to change a function's return type through CREATE OR
-- REPLACE, so the drop is part of the upgrade, not an accident to be noticed
-- later.
DROP FUNCTION IF EXISTS public.fn_trending_products(integer, integer);

CREATE OR REPLACE FUNCTION public.fn_trending_products(
    p_days integer DEFAULT 7,
    p_limit integer DEFAULT 20
)
RETURNS TABLE (
    product_id  uuid,
    name        text,
    marketplace text,
    image_url   text,
    price_usd   numeric,
    price_cny   numeric,
    score       numeric,
    event_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    span integer := greatest(1, least(coalesce(p_days, 7), 90));
    lim  integer := greatest(1, least(coalesce(p_limit, 20), 100));
BEGIN
    RETURN QUERY
    WITH scored AS (
        SELECT
            x.product_id,
            count(*)::bigint AS event_count,
            -- Rounded here, not at the end: sum() over double precision is not
            -- associative, so 8 views of weight 1 and 1 order of weight 8 land on
            -- scores that differ in the last bits. Ordering by the raw sum let
            -- those two swap places between two databases holding the same
            -- events, which made event_count a tie-break that never fired. Rounding
            -- first makes a genuine tie genuine, and the ranking reproducible.
            round(sum(
                CASE x.event_type
                    WHEN 'view'         THEN 1.0
                    WHEN 'search_click' THEN 2.0
                    WHEN 'add_to_cart'  THEN 4.0
                    WHEN 'order'        THEN 8.0
                    ELSE 0.0
                END::double precision
                -- 3-day half-life. 259200s = 3 days, the same unit as the age.
                * power(0.5::double precision, x.age_seconds / 259200.0)
            )::numeric, 3) AS score
        FROM (
            SELECT
                e.product_id,
                e.event_type,
                EXTRACT(epoch FROM now() - e.created_at)::double precision AS age_seconds
            FROM public.product_events e
            WHERE e.created_at >= now() - span * interval '1 day'
              AND e.product_id IS NOT NULL
        ) x
        GROUP BY x.product_id
    )
    SELECT
        s.product_id,
        coalesce(
            public._jsonb_text(to_jsonb(p), ARRAY['title_english','source_title',
                                                  'title_original','name','title']),
            'Untitled product'
        ),
        coalesce(
            nullif(public._jsonb_text(to_jsonb(p), ARRAY['marketplace','marketplace_key']), ''),
            'unknown'
        ),
        -- images/source_images are text[]; to_jsonb keeps them as arrays, so the
        -- first element is the display image and an absent key is simply NULL.
        coalesce(
            to_jsonb(p) -> 'images' ->> 0,
            to_jsonb(p) -> 'source_images' ->> 0
        ),
        -- Two currencies, two columns, no mixing. The card that reads this prints
        -- "$" next to price_usd and "¥" next to price_cny, so feeding price_usd
        -- from source_price (CNY) quoted a ¥12.50 wholesale lot to the customer as
        -- $12.50 — about seven times the real price. An unknown USD price is now
        -- simply NULL, and the card shows the CNY one instead.
        public._jsonb_number(to_jsonb(p), ARRAY['price_usd_estimated','price_usd']),
        public._jsonb_number(to_jsonb(p), ARRAY['price_cny_min','price_cny',
                                                'source_price']),
        s.score,
        s.event_count
    FROM scored s
    JOIN public.source_products p ON p.id = s.product_id
    -- Trending feeds the customer home screen, so nothing unpublished may appear.
    -- SECURITY DEFINER bypasses RLS, which is why the filter is explicit here and
    -- not left to policy. A source_products generation without a status column
    -- reads NULL and is treated as live rather than emptying the feed.
    WHERE coalesce(nullif(to_jsonb(p) ->> 'status', ''), 'active') = 'active'
    ORDER BY s.score DESC, s.event_count DESC, s.product_id
    LIMIT lim;
END;
$$;

-- ─── 4. What staff read ────────────────────────────────────────
-- session_id is deliberately absent: it identifies a browsing session across
-- rows and has no operational use here, so a staff screen must never hold it.
CREATE OR REPLACE VIEW public.admin_product_events_view AS
SELECT
    e.id,
    e.product_id,
    e.event_type,
    coalesce(nullif(e.marketplace_key, ''), 'unknown') AS marketplace_key,
    e.created_at,
    coalesce(
        public._jsonb_text(to_jsonb(p), ARRAY['title_english','source_title',
                                              'title_original','name','title']),
        'Untitled product'
    ) AS product_name
FROM public.product_events e
LEFT JOIN public.source_products p ON p.id = e.product_id
-- The predicate is the belt. security_invoker below is the braces: on a PG14
-- server the option does not exist and the view would otherwise read every
-- row as its owner, which is exactly how a customer could see another user's
-- ledger (proved on the audit cluster).
--
-- public., not auth.: Postgres resolves a view's function names when the CREATE
-- VIEW is parsed, so a spelling that is absent aborts this whole migration. The
-- only definition on the live project is the one 202609210001 installs; the
-- auth. copy comes from 202408010010, which was never applied there and which
-- still tests the dropped 'admin' role value.
WHERE public.is_staff_or_admin();

-- ============================================================
-- VERIFY AFTER APPLYING (as a staff user; anon must be refused the view):
--   SELECT * FROM fn_trending_products(7, 5);
--   SELECT public.record_product_event('<uuid>', 'view', '1688');   -- then again: false
--   SELECT event_type, count(*) FROM admin_product_events_view GROUP BY 1;
--   SELECT * FROM product_events;                    -- as a customer: 0 rows
-- Proven on a throwaway cluster against three source_products shapes (mobile,
-- 0004, 0004-without-marketplace): weights 1/2/4/8, the 3-day half-life, the
-- tie-break, the 60s limiter (4 of 8 calls recorded), the 7/60-day window
-- boundary, arg clamping, orphan + display-less rows, and anon+customer+staff
-- reads of the base table.
-- The staff-only read was proven on a PG14 audit cluster, where security_invoker
-- does not exist: with the predicate a customer SELECTs 0 rows from the view and
-- a staff member sees the ledger. Re-check on the PG15 instance anyway.
-- ============================================================

-- ─── 5. Access control ─────────────────────────────────────────
REVOKE ALL ON FUNCTION public.record_product_event(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_trending_products(integer, integer) FROM PUBLIC;
-- Browsing analytics start before sign-in, so both are open to anon; the
-- functions decide what a caller can touch.
GRANT EXECUTE ON FUNCTION public.record_product_event(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trending_products(integer, integer) TO anon, authenticated;

-- Invoker rights, so RLS on product_events (staff-only SELECT) decides who reads
-- the ledger rather than the view owner granting a bypass. Supabase runs
-- Postgres 15+, which has this view option; the guard exists because the option
-- name is unknown to older servers, where aborting the whole file would be worse
-- than deferring one flag. The REVOKE below still closes the anon hole either way.
DO $$ BEGIN
    EXECUTE 'ALTER VIEW public.admin_product_events_view SET (security_invoker = true)';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ChinaSuuq: could not set security_invoker on admin_product_events_view (%). Set it manually once the server is Postgres 15+.', SQLERRM;
END $$;

-- Supabase's default privileges hand authenticated `arwdDxt` on every new
-- table and view. A simple view is auto-updatable, so leaving those grants in
-- place let a customer write THROUGH the read-only-looking view into
-- product_events (UPDATE/DELETE executed as proof on the audit cluster). The
-- revoke must name authenticated, not just anon and PUBLIC.
REVOKE ALL ON public.admin_product_events_view FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_product_events_view TO authenticated;
