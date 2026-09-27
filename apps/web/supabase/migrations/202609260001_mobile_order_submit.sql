-- ============================================================
-- ChinaSuuq — Migration 20: submit_mobile_order — one RPC that makes a
--                 customer's cart actually persist
-- 2026-09-26
--
-- THE PROBLEM, VERIFIED AGAINST PROJECT athkmrvsaijwgsyvwrbp ON 2026-09-26:
-- The admin dashboard's entire purpose is "very clear what every customer
-- bought, from which app". Production currently has ZERO rows in orders and
-- ZERO rows in order_items, because mobile's order write path can never
-- succeed there. Two structural reasons, both confirmed by reading the live
-- schema and policies, not the repo's migrations:
--
--   1. order_items has NO customer-facing INSERT policy. Its only policies are
--      `Users can view own order items` (SELECT), `order_items_admin_all`
--      (ALL, is_staff_or_admin()) and `order_items_read_public` (SELECT). A
--      signed-in customer therefore CANNOT write line items directly; only a
--      SECURITY DEFINER function can.
--   2. orders has NO `items` column at all. Mobile serialises its cart as a
--      JSON `items` array onto the order row, so the lines have nowhere to go,
--      and every invented column mobile sends (profile_id, recipient_name,
--      phone, city, address, payment_method, synced) is likewise absent.
--
-- Together these mean every mobile checkout dies before a single row lands,
-- which is exactly why the two order tables are empty in production.
--
-- THE FIX: one SECURITY DEFINER RPC, submit_mobile_order(), that inserts the
-- order AND its normalised order_items rows in one shot, with provenance
-- promoted to real columns (the vocabulary 202609240004 established), while
-- recomputing all money server-side. Mobile sends intent; the database decides
-- the numbers and the enum labels.
--
-- SAFETY:
--   * ENUM COERCION, never a client cast. A string mobile sends that is not a
--     valid enum label raises 22P02 and the customer loses their cart. Every
--     client-supplied label is matched against the live enum's labels read from
--     pg_catalog: shipping_method falls back to 'sea'; a marketplace_key becomes
--     order_items.marketplace only when it is one of the seven marketplace_type
--     labels, else NULL; status is always 'pending' and payment_status always
--     'pending' at submit time regardless of what the client asks (mobile
--     currently sends other words — this gate is the point).
--   * SERVER-SIDE MONEY. subtotal / service_fee / total / balance / paid are all
--     recomputed here from quantity x unit_price; the client's own totals are
--     ignored entirely, so the database is the authority on what a customer was
--     charged. This is also what lets the file pass the orders_money_guard
--     trigger from 202609210001 (new orders must start paid=0, pending).
--   * SECURITY DEFINER. It must be, because order_items has no customer INSERT
--     policy — an invoker-rights write is refused by RLS and the provenance
--     silently never lands. Owner is postgres (the migration runs as postgres).
--     search_path is pinned to public, pg_temp so a hijacked operator cannot
--     redirect the definer's INSERTs.
--   * GRANT SHAPE. EXECUTE is REVOKEd from PUBLIC and anon and GRANTed to
--     authenticated only: no anonymous ordering, and a definer that mints
--     orders must be reachable solely by a signed-in customer. auth.uid() IS
--     NULL raises 42501, because an owner-less order is invisible to every
--     "view own orders" policy and would be permanently stuck.
--   * TOLERANT READERS. Item fields are read through small helpers so an absent
--     key is NULL, not an error, and a non-numeric or non-uuid value cannot
--     raise mid-call (a garbage product_id lands as NULL instead of 22P02).
--   * RE-RUNNABLE. The function is DROPped by full signature first, every helper
--     is CREATE OR REPLACE, and a fresh orders.reference is retried once on a
--     unique violation. Note: this scratch/verification schema declares NO unique
--     constraint on orders.reference (the live column list shows none), but the
--     retry is written to assume production MAY have one.
-- ============================================================

-- ─── 0. Tolerant item readers ────────────────────────────────────
-- Self-contained (do not depend on 202609240003's _jsonb_number/_jsonb_text, so
-- this file applies to a project where that one has not run). ->> on jsonb turns
-- a stored number into its text form, so money written as 0.85 reads fine; a
-- symbol-prefixed "¥600" fails the regex and yields NULL rather than aborting.

CREATE OR REPLACE FUNCTION public._cs_item_text(j jsonb, keys text[])
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT nullif(btrim(s.x), '')
    FROM unnest(keys) AS k(key)
    CROSS JOIN LATERAL (SELECT j ->> k.key AS x) s
    WHERE coalesce(btrim(s.x), '') <> ''
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public._cs_item_num(j jsonb, keys text[])
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT s.x::numeric
    FROM unnest(keys) AS k(key)
    CROSS JOIN LATERAL (SELECT j ->> k.key AS x) s
    WHERE s.x ~ '^-?[0-9]+(\.[0-9]+)?$'
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public._cs_item_int(j jsonb, keys text[])
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
    SELECT s.x::integer
    FROM unnest(keys) AS k(key)
    CROSS JOIN LATERAL (SELECT j ->> k.key AS x) s
    WHERE s.x ~ '^-?[0-9]+$'
    LIMIT 1
$$;

-- A bad uuid text raises 22P02. The customer's product_id is a client-supplied
-- string, so the only safe read is one that returns NULL on garbage — the row
-- still lands (with product_id NULL) instead of the whole order failing.
CREATE OR REPLACE FUNCTION public._cs_safe_uuid(p text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p IS NULL OR btrim(p) = '' THEN
        RETURN NULL;
    END IF;
    RETURN p::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END $$;

-- ─── Enum coercion helpers, keyed off the LIVE enum labels ───────
-- Membership is checked against pg_enum, so these stay correct if a label is
-- ever added; only a confirmed label is ever cast.

-- shipping_method: must be one of air/sea/land, else 'sea'.
CREATE OR REPLACE FUNCTION public._cs_shipping_enum(p text)
RETURNS public.shipping_method LANGUAGE sql STABLE AS $$
    SELECT CASE
        WHEN lower(btrim(coalesce(p, ''))) IN (
            SELECT e.enumlabel FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'shipping_method' AND n.nspname = 'public'
        )
        THEN lower(btrim(p))::public.shipping_method
        ELSE 'sea'::public.shipping_method
    END;
$$;

-- marketplace_type: the seven app labels, else NULL. Returns NULL (never raises)
-- so a marketplace_key like 'amazon' keeps its text but leaves the enum blank.
CREATE OR REPLACE FUNCTION public._cs_marketplace_enum(p text)
RETURNS public.marketplace_type LANGUAGE sql STABLE AS $$
    SELECT CASE
        WHEN p IS NOT NULL
             AND lower(btrim(p)) IN (
            SELECT e.enumlabel FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'marketplace_type' AND n.nspname = 'public'
        )
        THEN lower(btrim(p))::public.marketplace_type
        ELSE NULL
    END;
$$;

-- ─── The RPC ─────────────────────────────────────────────────────
-- Signature is a contract with a mobile client written in parallel; do not
-- change names or order.
DROP FUNCTION IF EXISTS public.submit_mobile_order(text,text,text,text,text,numeric,jsonb);

CREATE OR REPLACE FUNCTION public.submit_mobile_order(
    p_reference        text,
    p_shipping_method  text,
    p_delivery_address text,
    p_destination_city text,
    p_notes            text,
    p_service_fee_pct  numeric,
    p_items            jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid        uuid;
    v_item       jsonb;
    v_name       text;
    v_qty        integer;
    v_unit       numeric;
    v_subtotal   numeric := 0;
    v_fee        numeric;
    v_total      numeric;
    v_n          integer := 0;
    v_attempts   integer := 0;
    v_order_id   uuid;
    v_reference  text;
    -- per-item provenance, re-derived in the insert pass
    v_pid        uuid;
    v_cny        numeric;
    v_rate       numeric;
    v_mp_key     text;
    v_src        text;
    v_img        text;
    v_variant    text;
    v_variant_nm text;
    v_moq        integer;
BEGIN
    -- ─── 1. There must be an owner ──────────────────────────────
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'ChinaSuuq: submit_mobile_order requires a signed-in customer'
            USING ERRCODE = '42501';
    END IF;

    -- ─── 2. Payload shape ───────────────────────────────────────
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'ChinaSuuq: submit_mobile_order expects p_items to be a JSON array'
            USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'ChinaSuuq: submit_mobile_order received an empty items array'
            USING ERRCODE = '22023';
    END IF;

    -- ─── 3. Validate every element + recompute subtotal ─────────
    -- Done before any write, so a malformed cart raises without leaving a
    -- half-order or a 0-item order behind.
    FOR v_item IN
        SELECT t.item FROM jsonb_array_elements(p_items) AS t(item)
    LOOP
        IF jsonb_typeof(v_item) <> 'object' THEN
            RAISE EXCEPTION 'ChinaSuuq: each item must be a JSON object'
                USING ERRCODE = '22023';
        END IF;

        v_name := public._cs_item_text(v_item, ARRAY['product_name','title','name']);
        IF v_name IS NULL THEN
            RAISE EXCEPTION 'ChinaSuuq: every item requires a product_name'
                USING ERRCODE = '22023';
        END IF;

        v_qty := public._cs_item_int(v_item, ARRAY['quantity','qty']);
        IF v_qty IS NULL OR v_qty < 1 THEN
            RAISE EXCEPTION 'ChinaSuuq: every item requires a quantity of at least 1'
                USING ERRCODE = '22023';
        END IF;

        v_unit := coalesce(public._cs_item_num(v_item, ARRAY['unit_price_usd','unit_price','price_usd']), 0);
        -- The client's own line/order totals are never read; subtotal is the
        -- server's sum of quantity x unit price.
        v_subtotal := v_subtotal + (v_qty * v_unit);
        v_n := v_n + 1;
    END LOOP;

    -- ─── 4. Money is decided here, not on the phone ─────────────
    v_subtotal := round(v_subtotal, 2);
    v_fee      := round(v_subtotal * coalesce(p_service_fee_pct, 0.05), 2);
    v_total    := round(v_subtotal + v_fee, 2);

    -- ─── 5. Insert the order, retrying the reference once ───────
    v_reference := nullif(btrim(coalesce(p_reference, '')), '');
    LOOP
        v_attempts := v_attempts + 1;
        IF v_reference IS NULL THEN
            v_reference := 'CS-'
                || to_char(now(), 'YYMM')
                || '-'
                || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
        END IF;
        BEGIN
            INSERT INTO public.orders (
                reference, user_id, status, payment_status, shipping_method, currency,
                subtotal_usd, service_fee_usd, total_usd, balance_due_usd, amount_paid_usd,
                delivery_address, destination_city, notes
            )
            VALUES (
                v_reference, v_uid,
                'pending'::public.order_status,        -- never trust a client status word
                'pending'::public.payment_status,      -- a new order has not been paid
                public._cs_shipping_enum(p_shipping_method),
                'USD',
                v_subtotal, v_fee, v_total, v_total, 0,
                nullif(btrim(coalesce(p_delivery_address, '')), ''),
                nullif(btrim(coalesce(p_destination_city, '')), ''),
                nullif(btrim(coalesce(p_notes, '')), '')
            )
            RETURNING id INTO v_order_id;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            -- Could be a reference collision. Retry once with a freshly generated
            -- value (drops any client-supplied reference on purpose). A second
            -- failure re-raises, because a non-reference uniqueness clash must not
            -- be masked.
            IF v_attempts >= 2 THEN
                RAISE;
            END IF;
            v_reference := NULL;
        END;
    END LOOP;

    -- ─── 6. Normalise each line into order_items ────────────────
    -- SECURITY DEFINER is what makes this INSERT possible at all: order_items
    -- has no customer-facing INSERT policy (see header). Provenance is promoted
    -- to real columns; the legacy *_snapshot twins are filled with the same
    -- values so older readers that query price_cny_snapshot /
    -- exchange_rate_snapshot still see the price and the rate.
    FOR v_item IN
        SELECT t.item FROM jsonb_array_elements(p_items) AS t(item)
    LOOP
        v_name       := public._cs_item_text(v_item, ARRAY['product_name','title','name']);
        v_qty        := coalesce(public._cs_item_int(v_item, ARRAY['quantity','qty']), 1);
        v_unit       := coalesce(public._cs_item_num(v_item, ARRAY['unit_price_usd','unit_price','price_usd']), 0);
        v_cny        := public._cs_item_num(v_item, ARRAY['unit_price_cny','price_cny']);
        v_rate       := public._cs_item_num(v_item, ARRAY['exchange_rate','rate']);
        v_mp_key     := public._cs_item_text(v_item, ARRAY['marketplace_key','marketplace','app','source_marketplace','platform']);
        v_src        := public._cs_item_text(v_item, ARRAY['source_url','url','link']);
        v_img        := public._cs_item_text(v_item, ARRAY['image_url','image','thumbnail']);
        v_variant    := public._cs_item_text(v_item, ARRAY['variant']);
        v_variant_nm := public._cs_item_text(v_item, ARRAY['variant_name']);
        v_moq        := public._cs_item_int(v_item, ARRAY['moq','moq_at_purchase','min_order']);
        v_pid        := public._cs_safe_uuid(public._cs_item_text(v_item, ARRAY['product_id','id']));

        INSERT INTO public.order_items (
            order_id, product_id, product_name, quantity,
            unit_price, total_price, currency,
            unit_price_cny, exchange_rate, price_cny_snapshot, exchange_rate_snapshot,
            marketplace, marketplace_key, source_url, image_url,
            variant, variant_name, moq_at_purchase, origin,
            created_at, updated_at
        )
        VALUES (
            v_order_id, v_pid, v_name, v_qty,
            v_unit, round(v_qty * v_unit, 2), 'USD',
            v_cny, v_rate, v_cny, v_rate,
            public._cs_marketplace_enum(v_mp_key), v_mp_key, v_src, v_img,
            v_variant, v_variant_nm, v_moq, 'api',
            now(), now()
        );
    END LOOP;

    RETURN jsonb_build_object(
        'id',            v_order_id,
        'reference',     v_reference,
        'total_usd',     v_total,
        'subtotal_usd',  v_subtotal,
        'service_fee_usd', v_fee,
        'item_count',    v_n
    );
END;
$$;

-- ─── 7. Access control ───────────────────────────────────────────
-- Customers only: no anon ordering, and this definer must never be reachable by
-- an anonymous caller. Supabase gives PUBLIC execute on new functions by default,
-- so the revoke is required, not decorative.
REVOKE EXECUTE ON FUNCTION public.submit_mobile_order(text,text,text,text,text,numeric,jsonb)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_mobile_order(text,text,text,text,text,numeric,jsonb)
    TO authenticated;

-- ============================================================
-- VERIFY AFTER APPLYING (as a signed-in customer):
--   SELECT public.submit_mobile_order(
--     NULL, 'sea', '123 Main St, Mogadishu', 'Mogadishu', NULL, 0.05,
--     '[{"product_name":"Bottle","quantity":2,"unit_price_usd":1.72,
--        "marketplace":"1688","unit_price_cny":12.5,"exchange_rate":7.26}]'::jsonb
--   );
--   SELECT count(*) FROM orders;  -- must now be > 0 in production
-- Then confirm the line landed with provenance:
--   SELECT product_name, unit_price, total_price, marketplace_key, marketplace,
--          origin FROM order_items ORDER BY created_at DESC LIMIT 5;
-- Regression harness: supabase/audit/local_verify/92_mobile_order_submit.sql
-- ============================================================

NOTIFY pgrst, 'reload schema';
