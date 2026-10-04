-- ============================================================
-- ChinaSuuq — Migration 202610030008: the server decides the money
-- 2026-10-03. Owner request: "all the ai vision dont wrong the exchange rate,
-- dont miss the rmb exchange other we lose money."
--
-- WHAT submit_mobile_order (202609260001) got wrong, in billing order:
--   1. `v_fee := v_subtotal * coalesce(p_service_fee_pct, 0.05)` — the fee comes
--      from the PHONE. The admin's Service fee setting (settings.service_fee_pct)
--      was never read, so Mission Control changing 5% to 8% changed nothing, and
--      a crafted request could order at 0%.
--   2. `v_unit := unit_price_usd` straight from the client, with unit_price_cny
--      and exchange_rate stored alongside it but never cross-checked. So the
--      server's "money is decided here, not on the phone" comment only covered
--      the SUM, not the PRICE. An app bug, a stale cached rate, or a doctored
--      payload bills whatever the device says.
--   3. USD-quoted marketplaces (1$ Dollar Store) have no CNY cost at all, yet
--      their dollar figures travelled in the same `price_cny` field. Dividing
--      those by 6.68 would have undercharged ~6.7×; not converting them is only
--      safe because the marketplace is known. That knowledge now lives in SQL
--      (cs_marketplace_is_usd_native) instead of only in the app.
--
-- AFTER THIS MIGRATION: every CNY-native line is priced by the database as
-- unit_price_cny / fx_cny_per_usd(), rounded once to cents; the rate used is
-- written back into exchange_rate (and its snapshot twin) so each line is
-- auditable as unit_price × exchange_rate == unit_price_cny; the fee is the
-- admin's setting; p_service_fee_pct is accepted and ignored for wire
-- compatibility.
-- ============================================================

-- ─── 1. Which marketplaces quote in dollars ──────────────────────
CREATE OR REPLACE FUNCTION public.cs_marketplace_is_usd_native(p text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    -- Unknown/NULL stays CNY-native on purpose: the curated catalog and the four
    -- Chinese wholesale sites are all ¥, so the safe default for an unrecognized
    -- key is to convert it rather than let a ¥ price be billed as dollars.
    SELECT lower(btrim(coalesce(p, ''))) IN (
        'dollarstore', 'dollar store', '1$', '1$ dollar store',
        'one dollar', 'onedollar', 'huolangjun666.com', 'huolangjun'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.cs_marketplace_is_usd_native(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cs_marketplace_is_usd_native(text)
    TO anon, authenticated, service_role;

-- ─── 2. The order RPC, rewritten around server-decided money ─────
CREATE OR REPLACE FUNCTION public.submit_mobile_order(
    p_reference        text,
    p_shipping_method  text,
    p_delivery_address text,
    p_destination_city text,
    p_notes            text,
    p_service_fee_pct  numeric,          -- accepted, ignored: the server sets the fee
    p_items            jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid        uuid;
    v_item       jsonb;
    v_line       jsonb;
    v_lines      jsonb := '[]'::jsonb;
    v_name       text;
    v_qty        integer;
    v_unit       numeric;
    v_cny        numeric;
    v_rate       numeric;              -- live CNY per USD, from fx_rates()
    v_rate_used  numeric;              -- the rate this line was billed at
    v_fee_pct    numeric;
    v_subtotal   numeric := 0;
    v_fee        numeric;
    v_total      numeric;
    v_n          integer := 0;
    v_attempts   integer := 0;
    v_order_id   uuid;
    v_reference  text;
    v_pid        uuid;
    v_mp_key     text;
    v_src        text;
    v_img        text;
    v_variant    text;
    v_variant_nm text;
    v_moq        integer;
    v_usd_native boolean;
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

    -- ─── 3. The two numbers the phone never gets to choose ──────
    v_rate    := public.fx_cny_per_usd();
    v_fee_pct := public.fx_service_fee_pct();

    -- ─── 4. Price every line HERE, then add up our own numbers ──
    -- Derived once and carried into the insert pass through v_lines, so the
    -- subtotal and the order_items rows can never disagree.
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
        IF v_qty IS NULL OR v_qty < 1 OR v_qty > 100000 THEN
            RAISE EXCEPTION 'ChinaSuuq: every item needs a quantity between 1 and 100000'
                USING ERRCODE = '22023';
        END IF;

        v_mp_key     := public._cs_item_text(v_item, ARRAY['marketplace_key','marketplace','app','source_marketplace','platform']);
        v_usd_native := public.cs_marketplace_is_usd_native(v_mp_key);
        v_cny        := public._cs_item_num(v_item, ARRAY['unit_price_cny','price_cny']);
        v_unit       := coalesce(public._cs_item_num(v_item, ARRAY['unit_price_usd','unit_price','price_usd']), 0);
        v_src        := public._cs_item_text(v_item, ARRAY['source_url','url','link']);
        v_img        := public._cs_item_text(v_item, ARRAY['image_url','image','thumbnail']);
        v_variant    := public._cs_item_text(v_item, ARRAY['variant']);
        v_variant_nm := public._cs_item_text(v_item, ARRAY['variant_name']);
        v_moq        := public._cs_item_int(v_item, ARRAY['moq','moq_at_purchase','min_order']);
        v_pid        := public._cs_safe_uuid(public._cs_item_text(v_item, ARRAY['product_id','id']));

        IF v_usd_native THEN
            -- A dollar-store listing has no CNY cost. Keeping the client's USD
            -- is correct here, and the CNY field is dropped so no later reader
            -- can divide a dollar figure by the yuan rate.
            v_cny := NULL;
            v_rate_used := NULL;
        ELSIF v_cny IS NOT NULL AND v_cny > 0 THEN
            v_unit      := round(v_cny / v_rate, 2);
            v_rate_used := v_rate;
        ELSE
            -- No captured yuan cost (legacy carts, curated rows without
            -- price_cny): fall back to the client price but record that no
            -- rate was applied, so the line is visibly unaudited.
            v_rate_used := NULL;
        END IF;

        IF v_unit IS NULL OR v_unit <= 0 THEN
            RAISE EXCEPTION 'ChinaSuuq: "%" has no usable price', left(v_name, 60)
                USING ERRCODE = '22023';
        END IF;
        IF v_unit > 100000 THEN
            RAISE EXCEPTION 'ChinaSuuq: "%" priced at $% looks wrong', left(v_name, 60), v_unit
                USING ERRCODE = '22023';
        END IF;

        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
            'product_name',   v_name,
            'quantity',       v_qty,
            'unit_price_usd', v_unit,
            'unit_price_cny', v_cny,
            'exchange_rate',  v_rate_used,
            'marketplace_key',v_mp_key,
            'source_url',     v_src,
            'image_url',      v_img,
            'variant',        v_variant,
            'variant_name',   v_variant_nm,
            'moq',            v_moq,
            'product_id',     v_pid
        ));

        v_subtotal := v_subtotal + (v_qty * v_unit);
        v_n := v_n + 1;
    END LOOP;

    v_subtotal := round(v_subtotal, 2);
    v_fee      := round(v_subtotal * v_fee_pct, 2);
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
                'pending'::public.order_status,
                'pending'::public.payment_status,
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
            IF v_attempts >= 2 THEN
                RAISE;
            END IF;
            v_reference := NULL;
        END;
    END LOOP;

    -- ─── 6. Normalise each derived line into order_items ────────
    FOR v_line IN
        SELECT t.item FROM jsonb_array_elements(v_lines) AS t(item)
    LOOP
        INSERT INTO public.order_items (
            order_id, product_id, product_name, quantity,
            unit_price, total_price, currency,
            unit_price_cny, exchange_rate, price_cny_snapshot, exchange_rate_snapshot,
            marketplace, marketplace_key, source_url, image_url,
            variant, variant_name, moq_at_purchase, origin,
            created_at, updated_at
        )
        VALUES (
            v_order_id,
            public._cs_safe_uuid(v_line ->> 'product_id'),
            v_line ->> 'product_name',
            (v_line ->> 'quantity')::integer,
            (v_line ->> 'unit_price_usd')::numeric,
            round(((v_line ->> 'quantity')::numeric) * ((v_line ->> 'unit_price_usd')::numeric), 2),
            'USD',
            (v_line ->> 'unit_price_cny')::numeric,
            (v_line ->> 'exchange_rate')::numeric,
            (v_line ->> 'unit_price_cny')::numeric,
            (v_line ->> 'exchange_rate')::numeric,
            public._cs_marketplace_enum(v_line ->> 'marketplace_key'),
            v_line ->> 'marketplace_key',
            v_line ->> 'source_url',
            v_line ->> 'image_url',
            v_line ->> 'variant',
            v_line ->> 'variant_name',
            (v_line ->> 'moq')::integer,
            'api',
            now(), now()
        );
    END LOOP;

    RETURN jsonb_build_object(
        'id',              v_order_id,
        'reference',       v_reference,
        'subtotal_usd',    v_subtotal,
        'service_fee_usd', v_fee,
        'total_usd',       v_total,
        'item_count',      v_n,
        'service_fee_pct', v_fee_pct,
        'cny_per_usd',     v_rate
    );
END $$;

REVOKE EXECUTE ON FUNCTION public.submit_mobile_order(text,text,text,text,text,numeric,jsonb)
    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_mobile_order(text,text,text,text,text,numeric,jsonb)
    TO authenticated;
