-- ============================================================
-- 92_mobile_order_submit.sql — prove 202609260001 against the schema
--                            production actually has.
--
-- WHY THIS EXISTS. Production's orders and order_items are both empty because
-- mobile's write path can never succeed: order_items has no customer INSERT
-- policy (only a SECURITY DEFINER function can write it), and orders has no
-- `items` column for mobile's cart to land in. The fix is one definer RPC,
-- submit_mobile_order(), that inserts the order AND its normalised line items,
-- recomputing money and coercing every enum server-side.
--
-- This file recreates production's exact column list and enum labels (verified
-- against project athkmrvsaijwgsyvwrbp on 2026-09-26), applies the migration,
-- and asserts the behaviour a mobile client is being written against. It runs
-- entirely inside BEGIN ... ROLLBACK so it leaves the scratch cluster untouched.
--
-- NOTE ON THE SCRATCH SHAPE: production declares orders.id DEFAULT
-- uuid_generate_v4() and order_items.snapshot columns relaxed to nullable (by
-- 202609240004). gen_random_uuid() is behaviourally identical to
-- uuid_generate_v4() and needs no extension, so the fixture uses it; nothing in
-- the RPC depends on which generator produced the id. There is NO unique
-- constraint on reference here (none appears in the live column list), but the
-- RPC's retry path is still exercised via the happy path.
-- ============================================================

BEGIN;

-- Supabase's anon/authenticated roles exist in production and in the shared
-- 00_common harness; this file is self-contained, so it must create them before
-- applying a migration whose REVOKE ... FROM anon names them.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
END $$;

-- ─── Enums, exactly production's labels ──────────────────────────
DO $$ BEGIN
    CREATE TYPE public.order_status AS ENUM (
        'pending','confirmed','purchasing','purchased','in_transit_china','warehouse',
        'inspection','consolidated','shipped','in_transit','arrived_somalia','customs',
        'ready_for_pickup','out_for_delivery','delivered','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.payment_status AS ENUM ('pending','confirmed','failed','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.shipping_method AS ENUM ('air','sea','land');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.marketplace_type AS ENUM
      ('1688','taobao','yiwugo','chinasuuq','chinagoods','jd','alibaba');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── The two tables, production-faithful ─────────────────────────
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;

CREATE TABLE public.orders (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference             text NOT NULL,
    user_id               uuid NOT NULL,
    status                public.order_status NOT NULL DEFAULT 'pending',
    payment_status        public.payment_status NOT NULL DEFAULT 'pending',
    shipping_method       public.shipping_method DEFAULT 'sea',
    currency              text NOT NULL DEFAULT 'USD',
    subtotal_usd          numeric NOT NULL DEFAULT 0,
    service_fee_usd       numeric NOT NULL DEFAULT 0,
    shipping_estimate_usd numeric NOT NULL DEFAULT 0,
    customs_estimate_usd  numeric NOT NULL DEFAULT 0,
    amount_paid_usd       numeric NOT NULL DEFAULT 0,
    balance_due_usd       numeric NOT NULL DEFAULT 0,
    total_usd             numeric NOT NULL DEFAULT 0,
    delivery_address      text,
    destination_city      text,
    notes                 text,
    internal_notes        text,
    quote_id              uuid,
    tracking_token        uuid NOT NULL DEFAULT gen_random_uuid(),
    whatsapp_checkout     boolean NOT NULL DEFAULT false,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.order_items (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id               uuid NOT NULL,
    product_id             uuid,
    product_name           text NOT NULL,
    quantity               integer NOT NULL DEFAULT 1,
    unit_price             numeric,
    total_price            numeric,
    currency               text,
    cost_price             numeric,
    price_cny_snapshot     numeric,
    exchange_rate_snapshot numeric,
    unit_price_cny         numeric,
    exchange_rate          numeric,
    moq_at_purchase        integer,
    variant                text,
    variant_name           text,
    marketplace            public.marketplace_type,
    marketplace_key        text,
    source_url             text,
    image_url              text,
    metadata               jsonb,
    origin                 text NOT NULL DEFAULT 'staff',
    is_sourced             boolean NOT NULL DEFAULT false,
    is_purchased           boolean NOT NULL DEFAULT false,
    is_received            boolean NOT NULL DEFAULT false,
    is_inspected           boolean NOT NULL DEFAULT false,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz
);

-- RLS on, no customer INSERT policy — mirroring production, so the ONLY way a
-- line item can be written is the SECURITY DEFINER RPC under test. (The scratch
-- session and the definer both run as the postgres owner, which bypasses RLS,
-- exactly as production's definer does.)
ALTER TABLE public.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- ─── auth.uid() stub, same mechanism as the shared harness ───────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

\i :MIG/202609260001_mobile_order_submit.sql

DO $$
DECLARE
    v_customer uuid := '22222222-2222-2222-2222-222222222222';
    v_res      jsonb;
    v_oid      uuid;
    n          bigint;
    n_before   bigint;
    v_ref      text;
    v_ship     text;
    v_status   text;
    v_pay      text;
    v_sub      numeric;
    v_fee      numeric;
    v_total    numeric;
    v_bal      numeric;
    v_paid     numeric;
    v_city     text;
    v_addr     text;
    v_note     text;
    v_curr     text;
    v_name     text;
    v_unit     numeric;
    v_line     numeric;
    v_mpkey    text;
    v_mpenum   text;
    v_cny      numeric;
    v_rate     numeric;
    v_snap_cny numeric;
    v_snap_rate numeric;
    v_pid      uuid;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_customer::text, false);

    -- ═══ 1. HAPPY PATH: 2 items, money recomputed ═══════════════
    -- Both items carry a bogus "total_usd":99999 that the RPC must ignore; the
    -- stored order total (18.33) is the proof the DB, not the phone, decides
    -- money. subtotal = 2*3.33 + 1*10 = 16.66; fee@0.10 = 1.67; total = 18.33.
    BEGIN
        v_res := public.submit_mobile_order(
            'CS-TEST-92', 'air', '123 Main St, Mogadishu', 'Mogadishu', 'leave at door', 0.10,
            '[
              {"product_name":"Steel bottle","quantity":2,"unit_price_usd":3.33,
               "marketplace":"1688","unit_price_cny":12.5,"exchange_rate":7.26,
               "product_id":"33333333-3333-3333-3333-333333333333",
               "source_url":"https://detail.1688.com/offer/1.html",
               "image_url":"https://cdn/1.jpg","moq":20,"total_usd":99999},
              {"product_name":"Phone case","quantity":1,"unit_price_usd":10.00,
               "marketplace":"taobao","unit_price_cny":73,"exchange_rate":7.3,
               "variant":"red","variant_name":"Red XL","total_usd":99999}
            ]'::jsonb
        );

        -- returned id must be a valid uuid, and reference the client supplied
        v_oid := (v_res ->> 'id')::uuid;
        SELECT reference, shipping_method::text, status::text, payment_status::text,
               subtotal_usd, service_fee_usd, total_usd, balance_due_usd,
               amount_paid_usd, currency, destination_city, delivery_address, notes
          INTO v_ref, v_ship, v_status, v_pay, v_sub, v_fee, v_total, v_bal,
               v_paid, v_curr, v_city, v_addr, v_note
          FROM public.orders WHERE id = v_oid;

        IF v_oid IS NULL THEN
            RAISE NOTICE 'FAIL [mobile-order] happy path returned no order id';
        ELSIF v_res ->> 'reference' IS DISTINCT FROM 'CS-TEST-92' THEN
            RAISE NOTICE 'FAIL [mobile-order] returned reference = %', v_res ->> 'reference';
        ELSIF (v_res ->> 'total_usd')::numeric IS DISTINCT FROM 18.33 THEN
            RAISE NOTICE 'FAIL [mobile-order] returned total_usd = % (expected 18.33)', v_res ->> 'total_usd';
        ELSIF (v_res ->> 'item_count')::int <> 2 THEN
            RAISE NOTICE 'FAIL [mobile-order] returned item_count = % (expected 2)', v_res ->> 'item_count';
        ELSIF v_sub IS DISTINCT FROM 16.66 OR v_fee IS DISTINCT FROM 1.67
              OR v_total IS DISTINCT FROM 18.33 THEN
            RAISE NOTICE 'FAIL [mobile-order] stored money %/%/% (expected 16.66/1.67/18.33 — client total 99999 must be ignored)',
                v_sub, v_fee, v_total;
        ELSIF (v_res ->> 'subtotal_usd')::numeric IS DISTINCT FROM 16.66
              OR (v_res ->> 'service_fee_usd')::numeric IS DISTINCT FROM 1.67 THEN
            RAISE NOTICE 'FAIL [mobile-order] returned subtotal/fee = %/% (expected 16.66/1.67)',
                v_res ->> 'subtotal_usd', v_res ->> 'service_fee_usd';
        ELSE
            RAISE NOTICE 'PASS [mobile-order] happy path: money recomputed, client totals ignored';
        END IF;

        IF v_ref IS DISTINCT FROM 'CS-TEST-92' THEN
            RAISE NOTICE 'FAIL [mobile-order] stored reference = %', v_ref;
        ELSIF v_ship IS DISTINCT FROM 'air' THEN
            RAISE NOTICE 'FAIL [mobile-order] stored shipping_method = % (expected air)', v_ship;
        ELSIF v_status IS DISTINCT FROM 'pending' OR v_pay IS DISTINCT FROM 'pending' THEN
            RAISE NOTICE 'FAIL [mobile-order] status/payment = %/% (expected pending/pending)', v_status, v_pay;
        ELSIF v_bal IS DISTINCT FROM 18.33 OR v_paid IS DISTINCT FROM 0 THEN
            RAISE NOTICE 'FAIL [mobile-order] balance/paid = %/% (expected 18.33/0)', v_bal, v_paid;
        ELSIF v_curr IS DISTINCT FROM 'USD' OR v_city IS DISTINCT FROM 'Mogadishu'
              OR v_addr IS DISTINCT FROM '123 Main St, Mogadishu' OR v_note IS DISTINCT FROM 'leave at door' THEN
            RAISE NOTICE 'FAIL [mobile-order] address/currency/notes not stored as sent';
        ELSE
            RAISE NOTICE 'PASS [mobile-order] order row: pending/pending, USD, address and city stored';
        END IF;

        -- user_id must equal the fake auth uid, else no "view own orders" policy
        -- can ever return it.
        SELECT count(*) INTO n FROM public.orders
         WHERE id = v_oid AND user_id = v_customer;
        IF n <> 1 THEN
            RAISE NOTICE 'FAIL [mobile-order] order user_id is not the signed-in customer';
        ELSE
            RAISE NOTICE 'PASS [mobile-order] order owned by auth.uid() customer';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [mobile-order] happy path raised: %', SQLERRM;
    END;

    -- ═══ 2. LINE ITEMS: 2 rows, origin api, correct money ═══════
    BEGIN
        SELECT count(*) INTO n FROM public.order_items
         WHERE order_id = (SELECT id FROM public.orders WHERE reference='CS-TEST-92');
        IF n <> 2 THEN
            RAISE NOTICE 'FAIL [mobile-order] happy path created % order_items rows (expected 2)', n;
        ELSE
            RAISE NOTICE 'PASS [mobile-order] two normalised order_items rows landed';
        END IF;

        SELECT origin, unit_price, total_price, marketplace_key,
               marketplace::text, price_cny_snapshot, exchange_rate_snapshot,
               unit_price_cny, exchange_rate
          INTO v_name, v_unit, v_line, v_mpkey, v_mpenum, v_snap_cny, v_snap_rate, v_cny, v_rate
          FROM public.order_items
         WHERE order_id = (SELECT id FROM public.orders WHERE reference='CS-TEST-92')
           AND product_name = 'Steel bottle';

        IF v_unit IS DISTINCT FROM 3.33 OR v_line IS DISTINCT FROM 6.66 THEN
            RAISE NOTICE 'FAIL [mobile-order] bottle unit/line = %/% (expected 3.33/6.66)', v_unit, v_line;
        ELSIF v_mpkey IS DISTINCT FROM '1688' OR v_mpenum IS DISTINCT FROM '1688' THEN
            RAISE NOTICE 'FAIL [mobile-order] bottle provenance key/enum = %/% (expected 1688/1688)', v_mpkey, v_mpenum;
        ELSE
            RAISE NOTICE 'PASS [mobile-order] bottle line: unit_price, derived total_price, 1688 provenance';
        END IF;

        SELECT origin INTO v_name FROM public.order_items
         WHERE order_id = (SELECT id FROM public.orders WHERE reference='CS-TEST-92')
         LIMIT 1;
        SELECT count(*) INTO n FROM public.order_items
         WHERE order_id = (SELECT id FROM public.orders WHERE reference='CS-TEST-92')
           AND origin = 'api';
        IF n <> 2 THEN
            RAISE NOTICE 'FAIL [mobile-order] % of 2 lines carry origin=api', n;
        ELSE
            RAISE NOTICE 'PASS [mobile-order] both lines stamped origin=api';
        END IF;

        -- ═══ snapshot twins: legacy columns equal provenance ═══
        SELECT count(*) INTO n FROM public.order_items
         WHERE order_id = (SELECT id FROM public.orders WHERE reference='CS-TEST-92')
           AND price_cny_snapshot IS NOT DISTINCT FROM unit_price_cny
           AND exchange_rate_snapshot IS NOT DISTINCT FROM exchange_rate;
        IF n <> 2 THEN
            RAISE NOTICE 'FAIL [mobile-order] only % of 2 lines have snapshot twins matching provenance columns', n;
        ELSE
            RAISE NOTICE 'PASS [mobile-order] price_cny_snapshot/exchange_rate_snapshot mirror the provenance columns';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [mobile-order] line-item checks raised: %', SQLERRM;
    END;

    -- ═══ 3. ENUM COERCION: garbage shipping falls back to sea; ═══
    -- ═════ unknown marketplace keeps key but blanks the enum; ══
    -- ═════ known-but-uppercase coerces; status always pending. ══
    BEGIN
        v_res := public.submit_mobile_order(
            NULL, 'teleport', NULL, NULL, NULL, 0.05,
            '[
              {"product_name":"Unknown app item","quantity":1,"unit_price_usd":1,"marketplace":"AMAZON"},
              {"product_name":"Known app item","quantity":1,"unit_price_usd":1,"marketplace":"TAOBAO"}
            ]'::jsonb
        );
        SELECT shipping_method::text, status::text INTO v_ship, v_status
          FROM public.orders WHERE id = (v_res ->> 'id')::uuid;

        IF v_ship IS DISTINCT FROM 'sea' THEN
            RAISE NOTICE 'FAIL [mobile-order] garbage shipping_method stored % (expected sea fallback)', v_ship;
        ELSIF v_status IS DISTINCT FROM 'pending' THEN
            RAISE NOTICE 'FAIL [mobile-order] status stored % (expected pending — RPC has no client status input)', v_status;
        ELSE
            RAISE NOTICE 'PASS [mobile-order] garbage shipping_method coerced to sea; status forced pending';
        END IF;

        -- reference auto-generated when null: CS-YYMM-xxxx
        SELECT reference INTO v_ref FROM public.orders WHERE id = (v_res ->> 'id')::uuid;
        IF v_ref !~ '^CS-[0-9]{4}-[0-9a-f]{4}$' THEN
            RAISE NOTICE 'FAIL [mobile-order] generated reference = % (expected CS-YYMM-xxxx)', v_ref;
        ELSE
            RAISE NOTICE 'PASS [mobile-order] reference generated when none supplied (%)', v_ref;
        END IF;

        SELECT marketplace_key, marketplace::text INTO v_mpkey, v_mpenum
          FROM public.order_items
         WHERE order_id = (v_res ->> 'id')::uuid AND product_name = 'Unknown app item';
        IF v_mpkey IS DISTINCT FROM 'AMAZON' OR v_mpenum IS NOT NULL THEN
            RAISE NOTICE 'FAIL [mobile-order] unknown marketplace key/enum = %/% (expected AMAZON / NULL)', v_mpkey, v_mpenum;
        ELSE
            RAISE NOTICE 'PASS [mobile-order] unknown marketplace_key kept, enum left NULL';
        END IF;

        SELECT marketplace_key, marketplace::text INTO v_mpkey, v_mpenum
          FROM public.order_items
         WHERE order_id = (v_res ->> 'id')::uuid AND product_name = 'Known app item';
        IF v_mpenum IS DISTINCT FROM 'taobao' THEN
            RAISE NOTICE 'FAIL [mobile-order] uppercase TAOBAO did not coerce to taobao enum (got %)', v_mpenum;
        ELSE
            RAISE NOTICE 'PASS [mobile-order] uppercase marketplace label coerced to its enum';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [mobile-order] enum coercion raised: %', SQLERRM;
    END;

    -- ═══ 4. BAD PAYLOAD: empty array and non-array both raise ═══
    BEGIN
        SELECT count(*) INTO n_before FROM public.orders;
        BEGIN
            PERFORM public.submit_mobile_order(
                'CS-EMPTY-92','sea',NULL,NULL,NULL,0.05,'[]'::jsonb);
            RAISE NOTICE 'FAIL [mobile-order] empty array did NOT raise';
        EXCEPTION WHEN OTHERS THEN
            IF SQLSTATE = '22023' THEN
                SELECT count(*) INTO n FROM public.orders;
                IF n = n_before THEN
                    RAISE NOTICE 'PASS [mobile-order] empty array rejected with 22023, no order created';
                ELSE
                    RAISE NOTICE 'FAIL [mobile-order] empty array raised but still inserted a row';
                END IF;
            ELSE
                RAISE NOTICE 'FAIL [mobile-order] empty array raised SQLSTATE % (expected 22023)', SQLSTATE;
            END IF;
        END;

        BEGIN
            PERFORM public.submit_mobile_order(
                'CS-NOTARR-92','sea',NULL,NULL,NULL,0.05,'{"a":1}'::jsonb);
            RAISE NOTICE 'FAIL [mobile-order] non-array object did NOT raise';
        EXCEPTION WHEN OTHERS THEN
            IF SQLSTATE = '22023' THEN
                SELECT count(*) INTO n FROM public.orders;
                IF n = n_before THEN
                    RAISE NOTICE 'PASS [mobile-order] non-array payload rejected with 22023, no order created';
                ELSE
                    RAISE NOTICE 'FAIL [mobile-order] non-array raised but still inserted a row';
                END IF;
            ELSE
                RAISE NOTICE 'FAIL [mobile-order] non-array raised SQLSTATE % (expected 22023)', SQLSTATE;
            END IF;
        END;

        -- a malformed element (no product_name) must also raise, not create a 0-line order
        BEGIN
            PERFORM public.submit_mobile_order(
                'CS-NOITEM-92','sea',NULL,NULL,NULL,0.05,
                '[{"quantity":1,"unit_price_usd":1}]'::jsonb);
            RAISE NOTICE 'FAIL [mobile-order] item missing product_name did NOT raise';
        EXCEPTION WHEN OTHERS THEN
            IF SQLSTATE = '22023' THEN
                SELECT count(*) INTO n FROM public.orders;
                IF n = n_before THEN
                    RAISE NOTICE 'PASS [mobile-order] item missing product_name rejected before any write';
                ELSE
                    RAISE NOTICE 'FAIL [mobile-order] bad item raised but a row leaked';
                END IF;
            ELSE
                RAISE NOTICE 'FAIL [mobile-order] bad item raised SQLSTATE % (expected 22023)', SQLSTATE;
            END IF;
        END;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [mobile-order] bad-payload checks raised: %', SQLERRM;
    END;

    -- ═══ 5. BAD product_id must NOT abort: row lands NULL ═══════
    BEGIN
        v_res := public.submit_mobile_order(
            'CS-BADPID-92','sea',NULL,NULL,NULL,0.05,
            '[{"product_name":"Widget","quantity":1,"unit_price_usd":5,"product_id":"not-a-uuid"}]'::jsonb);
        SELECT oi.product_id INTO v_pid
          FROM public.order_items oi
          JOIN public.orders o ON o.id = oi.order_id
         WHERE o.reference = 'CS-BADPID-92' AND oi.product_name = 'Widget';
        IF v_res ->> 'id' IS NULL THEN
            RAISE NOTICE 'FAIL [mobile-order] garbage product_id aborted the call';
        ELSIF v_pid IS NOT NULL THEN
            RAISE NOTICE 'FAIL [mobile-order] garbage product_id stored % (expected NULL)', v_pid;
        ELSE
            RAISE NOTICE 'PASS [mobile-order] non-uuid product_id stored as NULL, call succeeded';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [mobile-order] bad product_id check raised: %', SQLERRM;
    END;

    -- ═══ 6. ANONYMOUS: auth.uid() NULL => 42501, inserts nothing ═
    BEGIN
        SELECT count(*) INTO n_before FROM public.orders;
        PERFORM set_config('request.jwt.claim.sub', '', false);
        BEGIN
            PERFORM public.submit_mobile_order(
                'CS-ANON-92','sea',NULL,NULL,NULL,0.05,
                '[{"product_name":"X","quantity":1,"unit_price_usd":1}]'::jsonb);
            RAISE NOTICE 'FAIL [mobile-order] anonymous call did NOT raise';
        EXCEPTION WHEN OTHERS THEN
            IF SQLSTATE = '42501' THEN
                SELECT count(*) INTO n FROM public.orders;
                IF n = n_before THEN
                    RAISE NOTICE 'PASS [mobile-order] anonymous call rejected with 42501, no order created';
                ELSE
                    RAISE NOTICE 'FAIL [mobile-order] anonymous raised but a row leaked';
                END IF;
            ELSE
                RAISE NOTICE 'FAIL [mobile-order] anonymous call raised SQLSTATE % (expected 42501)', SQLSTATE;
            END IF;
        END;
        PERFORM set_config('request.jwt.claim.sub', v_customer::text, false);
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL [mobile-order] anonymous checks raised: %', SQLERRM;
    END;
END $$;

ROLLBACK;
