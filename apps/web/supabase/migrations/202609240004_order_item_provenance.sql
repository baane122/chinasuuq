-- ============================================================
-- ChinaSuuq — Migration 19: per-line provenance ("what did this
-- customer buy, and from which app")
-- 2026-09-24
--
-- THE PROBLEM, VERIFIED IN CODE:
-- Mobile stores its line items as a JSON array on orders.items. Until this
-- change the checkout screen built each entry as
--     { id, product_name, quantity, price_usd }
-- (apps/mobile/app/cart/checkout.tsx) even though the cart item in hand held
-- product.marketplace, product.source_url, product.moq and price_cny_snapshot.
-- Provenance was discarded at the moment of writing, so no query could recover
-- it: every mobile order is marketplace-blind in the database, and the admin
-- filled the gap by guessing from customer city names.
--
-- FIXING IT PROPERLY means the write keeps what it already knew (done in the
-- mobile checkout, same day) AND the stored facts become queryable instead of
-- parsed out of JSON on every request. order_items already exists for exactly
-- this purpose, but mobile never writes it, so it holds only staff-entered rows.
--
-- This migration normalises orders.items JSON into order_items rows, with
-- provenance promoted to real columns:
--   marketplace_key   — the app slug ('1688', 'taobao', ...)
--   source_url        — deep link back to the exact listing
--   unit_price_cny    — what the marketplace charged
--   exchange_rate     — the rate used, so a later rate change cannot silently
--                       rewrite history
--   moq_at_purchase   — MOQ as shown at order time; supplier rules change
--                       constantly and staff must see the rule that applied
--   origin            — which pipeline produced the row
--
-- SCHEMA GENERATION: the live orders shape is unproven (three incompatible
-- versions exist in the migration history), so this file never names
-- orders.items, orders.reference or orders.profile_id directly. It reads
-- to_jsonb(orders), which yields NULL for an absent key — the same hedge
-- migration 18 uses, and the reason supabase/audit/local_verify can prove all
-- four generations.
--
-- SAFETY:
--   1. A trigger must never block a purchase: orders_order_items_sync() wraps
--      the whole call and degrades to a WARNING in the Postgres log.
--   2. sync_order_items() is SECURITY DEFINER because the row is written by the
--      customer's own insert under RLS; without it the write is refused and
--      provenance silently never lands. It is therefore REVOKEd from
--      anon/authenticated so no one can call it for an order they do not own.
--      Trigger execution is not gated by the caller's EXECUTE grant.
--   3. The view runs with invoker rights, matching the pattern established by
--      202609210001_money_integrity_rls_hardening.sql: security_invoker=true,
--      revoked from anon, granted to authenticated, so RLS decides the reader.
-- ============================================================

-- ─── 1. Provenance columns ───────────────────────────────────────
-- IF NOT EXISTS keeps this re-runnable, which matters because the live table may
-- already carry some of these from an ad-hoc session.
--
-- This statement also guarantees the MECHANICAL columns the sync below writes and
-- the view below reads (image_url, unit_price, total_price, currency, cost_price,
-- the four is_* fulfilment flags, metadata, updated_at). Probing project
-- athkmrvsaijwgsyvwrbp on 2026-09-25 showed its order_items predates all of them
-- — it is the older snapshot vocabulary (price_cny_snapshot, price_usd_snapshot,
-- exchange_rate_snapshot, variant, and a `marketplace` ENUM instead of
-- marketplace_key text). A CREATE VIEW resolves its column list immediately, so
-- naming those columns without adding them aborted this file with 42703 on the
-- first deploy attempt. Adding them here is what makes the same file apply to a
-- fresh project and to that one.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS marketplace_key   text,
  ADD COLUMN IF NOT EXISTS source_url        text,
  ADD COLUMN IF NOT EXISTS unit_price_cny    numeric(12,2),
  ADD COLUMN IF NOT EXISTS exchange_rate     numeric(12,6),
  ADD COLUMN IF NOT EXISTS moq_at_purchase   integer,
  ADD COLUMN IF NOT EXISTS variant_name      text,
  ADD COLUMN IF NOT EXISTS origin            text NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS image_url         text,
  ADD COLUMN IF NOT EXISTS unit_price        numeric(12,2),
  ADD COLUMN IF NOT EXISTS total_price       numeric(12,2),
  ADD COLUMN IF NOT EXISTS currency          text,
  ADD COLUMN IF NOT EXISTS cost_price        numeric(12,2),
  ADD COLUMN IF NOT EXISTS is_sourced        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_purchased      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_received       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_inspected      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata          jsonb,
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz;

-- ─── 1b. Let the sync row exist on the snapshot vocabulary ───────
-- That project declares its three snapshot columns NOT NULL with no default, and
-- sync_order_items() below does not write them (they belong to a vocabulary the
-- repo generations do not have). Postgres would answer every provenance write
-- with 23502, the trigger would swallow it into a WARNING, and the admin would
-- see no lines at all — a silent version of exactly the bug this file exists to
-- end. Nothing is lost by relaxing them: the view still reads them as the
-- fallback when they ARE present.
DO $$
DECLARE
    v_col text;
BEGIN
    FOREACH v_col IN ARRAY ARRAY[
        'price_cny_snapshot', 'price_usd_snapshot', 'exchange_rate_snapshot'
    ] LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'order_items'
              AND column_name = v_col AND is_nullable = 'NO'
        ) THEN
            EXECUTE format('ALTER TABLE public.order_items ALTER COLUMN %I DROP NOT NULL', v_col);
            RAISE NOTICE 'ChinaSuuq: order_items.% relaxed to nullable for provenance writes', v_col;
        END IF;
    END LOOP;
END $$;

DO $$ BEGIN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_origin_check
      CHECK (origin IN ('staff','orders_jsonb','quote','admin_import','api'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_marketplace
  ON public.order_items(marketplace_key, created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_origin
  ON public.order_items(origin) WHERE origin = 'orders_jsonb';

-- ─── 2. Normalise one order's JSON items into rows ──────────────
-- Deterministic ids: md5(order id || ':' || array index) cast to uuid. A stable
-- id per (order, position) is what lets this be an UPSERT rather than
-- delete-then-insert, so re-syncing never churns primary keys that other tables
-- might point at.
CREATE OR REPLACE FUNCTION public.sync_order_items(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item   jsonb;
    v_idx    integer := 0;
    v_count  integer := 0;
    v_qty    numeric;
    v_money  numeric;
    v_items  jsonb;
BEGIN
    SELECT to_jsonb(o) -> 'items' INTO v_items
    FROM public.orders o WHERE o.id = p_order_id;

    IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' THEN
        RETURN 0;
    END IF;

    FOR v_item IN
        SELECT t.item FROM jsonb_array_elements(v_items) AS t(item)
        WHERE jsonb_typeof(t.item) = 'object'
    LOOP
        v_idx := v_idx + 1;

        v_qty := public._jsonb_number(v_item, ARRAY['quantity','qty','count']);
        IF v_qty IS NULL OR v_qty < 1 THEN
            v_qty := 1;
        END IF;

        v_money := public._jsonb_number(v_item,
                     ARRAY['price_usd','unit_price','price_usd_estimated']);

        INSERT INTO public.order_items (
            id, order_id, product_name, image_url, quantity,
            unit_price, total_price, currency,
            marketplace_key, source_url, unit_price_cny, exchange_rate,
            moq_at_purchase, variant_name, origin, metadata,
            created_at, updated_at
        )
        VALUES (
            (md5(p_order_id::text || ':' || v_idx::text))::uuid,
            p_order_id,
            coalesce(public._jsonb_text(v_item, ARRAY['product_name','title','name']), 'Unnamed item'),
            public._jsonb_text(v_item, ARRAY['image_url','image','thumbnail']),
            v_qty::integer,
            coalesce(v_money, 0),
            coalesce(v_money * v_qty, 0),
            'USD',
            public._jsonb_text(v_item, ARRAY['marketplace','marketplace_name',
                                             'source_marketplace','app','platform']),
            public._jsonb_text(v_item, ARRAY['source_url','url','link']),
            public._jsonb_number(v_item, ARRAY['price_cny','price_cny_snapshot','unit_price_cny']),
            public._jsonb_number(v_item, ARRAY['exchange_rate','rate']),
            public._jsonb_number(v_item, ARRAY['moq','moq_at_purchase','min_order'])::integer,
            public._jsonb_text(v_item, ARRAY['variant','variant_name']),
            'orders_jsonb',
            v_item,
            now(), now()
        )
        ON CONFLICT (id) DO UPDATE SET
            product_name    = EXCLUDED.product_name,
            image_url       = EXCLUDED.image_url,
            quantity        = EXCLUDED.quantity,
            unit_price      = EXCLUDED.unit_price,
            total_price     = EXCLUDED.total_price,
            marketplace_key = EXCLUDED.marketplace_key,
            source_url      = EXCLUDED.source_url,
            unit_price_cny  = EXCLUDED.unit_price_cny,
            exchange_rate   = EXCLUDED.exchange_rate,
            moq_at_purchase = EXCLUDED.moq_at_purchase,
            variant_name    = EXCLUDED.variant_name,
            metadata        = EXCLUDED.metadata,
            updated_at      = now();

        v_count := v_count + 1;
    END LOOP;

    -- Items that were in the JSON before and are not now. Staff-entered rows
    -- carry a random uuid and origin='staff', so they are never touched here.
    -- The range must be exactly 1..v_idx: clamping it to a minimum of 1 leaves a
    -- phantom id in the set, which is the one row this DELETE exists to remove —
    -- a provenance row would survive after its item was deleted from the JSON.
    DELETE FROM public.order_items
    WHERE order_id = p_order_id
      AND origin = 'orders_jsonb'
      AND id <> ALL (
        SELECT (md5(p_order_id::text || ':' || i::text))::uuid
        FROM generate_series(1, v_idx) AS i
      );

    RETURN v_count;
END;
$$;

-- ─── 3. Keep it current without touching client code ────────────
-- "AFTER INSERT OR UPDATE OF items" cannot be used: naming the column breaks on
-- a generation that lacks it. Whole-row AFTER INSERT OR UPDATE is
-- generation-proof, and sync_order_items() no-ops when there is nothing to read.
CREATE OR REPLACE FUNCTION public.orders_order_items_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public.sync_order_items(NEW.id);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- A provenance rollup must never be why a customer cannot place an order.
    RAISE WARNING 'ChinaSuuq: order_items sync failed for order %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_order_items_sync ON public.orders;
CREATE TRIGGER trg_orders_order_items_sync
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_order_items_sync();

-- ─── 4. Backfill orders that predate this ───────────────────────
-- Old mobile items genuinely have no marketplace key, so their rows get
-- marketplace_key NULL and the rollups report 'Unattributed'. That is the honest
-- answer, and the reason nothing is defaulted to a guess here.
DO $$
DECLARE
    v     record;
    total integer := 0;
BEGIN
    FOR v IN SELECT id FROM public.orders LOOP
        BEGIN
            total := total + coalesce(public.sync_order_items(v.id), 0);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'ChinaSuuq: provenance backfill failed for order %: %', v.id, SQLERRM;
        END;
    END LOOP;
    RAISE NOTICE 'ChinaSuuq: provenance backfill normalised % order item rows', total;
END $$;

-- ─── 5. What the admin reads ────────────────────────────────────
CREATE OR REPLACE VIEW public.admin_order_items_view AS
SELECT
    oi.id,
    oi.order_id,
    -- Both order-number spellings exist across generations; neither is safe to
    -- name, so the label is resolved from the row's JSON form.
    coalesce(
        nullif(to_jsonb(o)->>'order_number', ''),
        nullif(to_jsonb(o)->>'reference',    ''),
        oi.order_id::text
    )                                                    AS order_ref,
    oi.created_at,
    oi.product_name,
    oi.image_url,
    oi.quantity,
    -- Both money vocabularies are real: repo generations write unit_price,
    -- project athkmrvsaijwgsyvwrbp's staff rows carry price_usd_snapshot. Read
    -- through to_jsonb so whichever column this deploy has is the one used, and
    -- the missing one costs nothing (an absent key is NULL, not an error).
    coalesce(oi.unit_price,
             public._jsonb_number(to_jsonb(oi), ARRAY['price_usd_snapshot'])
    )                                                    AS unit_price,
    -- cost_price is the supplier cost; margin is meaningless without it, and
    -- unit_price_cny/exchange_rate is the fallback the mobile app records.
    oi.cost_price,
    oi.currency,
    coalesce(oi.total_price,
             round(coalesce(oi.unit_price,
                            public._jsonb_number(to_jsonb(oi),
                                                 ARRAY['price_usd_snapshot']), 0)
                   * oi.quantity, 2)
    )                                                    AS total_price,
    coalesce(oi.unit_price_cny,
             public._jsonb_number(to_jsonb(oi), ARRAY['price_cny_snapshot'])
    )                                                    AS unit_price_cny,
    coalesce(oi.exchange_rate,
             public._jsonb_number(to_jsonb(oi), ARRAY['exchange_rate_snapshot'])
    )                                                    AS exchange_rate,
    oi.moq_at_purchase,
    coalesce(nullif(oi.variant_name, ''),
             nullif(to_jsonb(oi) ->> 'variant', ''))     AS variant_name,
    oi.source_url,
    oi.origin,
    oi.is_sourced,
    oi.is_purchased,
    oi.is_received,
    oi.is_inspected,
    -- The legacy column is a `marketplace` ENUM; ->> gives its label as text, so
    -- a staff row that named its app the old way still reports which app.
    coalesce(nullif(oi.marketplace_key, ''),
             nullif(to_jsonb(oi) ->> 'marketplace', ''),
             'unknown')                                  AS marketplace_key,
    coalesce(
        nullif(to_jsonb(m) ->> 'display_name', ''),
        m.name,
        coalesce(nullif(oi.marketplace_key, ''),
                 nullif(to_jsonb(oi) ->> 'marketplace', '')),
        'Unknown app'
    )                                                    AS marketplace_name,
    m.logo_url                                           AS marketplace_logo,
    coalesce(
        nullif(to_jsonb(o)->>'profile_id', '')::uuid,
        nullif(to_jsonb(o)->>'user_id',    '')::uuid
    )                                                    AS customer_id,
    p.full_name                                          AS customer_name
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
LEFT JOIN public.marketplaces m
       ON lower(m.name) = lower(coalesce(nullif(oi.marketplace_key, ''),
                                         nullif(to_jsonb(oi) ->> 'marketplace', '')))
LEFT JOIN public.profiles p
       ON p.id = coalesce(
                  nullif(to_jsonb(o)->>'profile_id', '')::uuid,
                  nullif(to_jsonb(o)->>'user_id',    '')::uuid
              );

-- ─── 6. Locking ─────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.sync_order_items(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orders_order_items_sync() FROM PUBLIC, anon, authenticated;

-- Invoker rights, so RLS on order_items decides who reads which line rather than
-- the view owner granting a bypass. Supabase runs Postgres 15+, which has this
-- view option; the guard exists because the option name is unknown to older
-- servers, where aborting the whole file would be worse than deferring one flag.
-- The REVOKE below still closes the anon hole on any version.
DO $$ BEGIN
    EXECUTE 'ALTER VIEW public.admin_order_items_view SET (security_invoker = true)';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ChinaSuuq: could not set security_invoker on admin_order_items_view (%). Set it manually once the server is Postgres 15+.', SQLERRM;
END $$;

-- Reads only. `FROM anon` alone leaves authenticated holding Supabase's default
-- arwdDxt, and a single-table view is auto-updatable, so a signed-in customer
-- could have edited order lines straight through this view.
REVOKE ALL ON public.admin_order_items_view FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_order_items_view TO authenticated;

-- ============================================================
-- VERIFY AFTER APPLYING (as staff):
--   SELECT count(*) FILTER (WHERE marketplace_key IS NULL) AS unattributed,
--          count(*) FILTER (WHERE marketplace_key IS NOT NULL) AS attributed
--   FROM order_items WHERE origin = 'orders_jsonb';
-- Place a fresh mobile order and confirm its lines carry the marketplace:
--   SELECT order_ref, product_name, marketplace_name, moq_at_purchase
--   FROM admin_order_items_view ORDER BY created_at DESC LIMIT 10;
-- Regression harness for the generation-proof accessors:
--   supabase/audit/local_verify/run.sh
-- ============================================================
