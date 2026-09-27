-- View-write negatives. Run as a separate psql invocation (SET ROLE cannot be
-- undone inside a DO block).
--
-- WHY THIS EXISTS: every read-only-looking view in this project is a plain
-- Postgres view, and a single-table view is AUTO-UPDATABLE — an UPDATE against
-- it runs against the base table with the view owner's rights. Supabase's
-- default privileges give the `authenticated` role arwdDxt on every new view,
-- so `REVOKE ... FROM anon` alone left any signed-in customer able to write
-- through admin_order_items_view, moq_review_queue, translations_view and the
-- admin_*_views. That is a forged order total, a faked "human-confirmed" MOQ,
-- and edited translations — with RLS bypassed. Proven by execution on the
-- 2026-09-25 audit cluster, then fixed by revoking from authenticated too.

-- ─── (0) is the danger actually present? ───────────────────────
-- Without Supabase's default privileges every view is read-only by accident and
-- sections (1) and (2) prove nothing. 00_common.sql emulates them, so assert the
-- emulation took hold before crediting any REVOKE for it.
DO $$ BEGIN
    IF has_table_privilege('authenticated', 'public.profiles', 'INSERT') THEN
        RAISE NOTICE 'PASS [%] harness emulates Supabase default privileges (writes exist until revoked)',
            current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'FAIL [%] harness has clean default privileges — the checks below are vacuous',
            current_setting('cs.generation', true);
    END IF;
END $$;

-- ─── (1) no write privilege on any guarded view ──────────────
DO $$
DECLARE
    v       text;
    bad     text := '';
    granted text[] := ARRAY[
        'admin_order_items_view', 'moq_review_queue', 'translations_view',
        'admin_product_events_view', 'admin_kpis_view_placeholder_skipped'
    ];
BEGIN
    FOREACH v IN ARRAY granted LOOP
        IF to_regclass('public.' || v) IS NULL THEN CONTINUE; END IF;
        IF has_table_privilege('authenticated', 'public.' || v, 'INSERT')
           OR has_table_privilege('authenticated', 'public.' || v, 'UPDATE')
           OR has_table_privilege('authenticated', 'public.' || v, 'DELETE')
           OR has_table_privilege('anon', 'public.' || v, 'UPDATE') THEN
            bad := bad || ' ' || v;
        END IF;
        IF NOT has_table_privilege('authenticated', 'public.' || v, 'SELECT')
           AND v <> 'admin_product_events_view' THEN
            -- staff must still be able to read it; the events view is gated by a
            -- predicate instead, so a customer legitimately holds SELECT but
            -- gets zero rows.
            bad := bad || ' (no-SELECT) ' || v;
        END IF;
    END LOOP;
    IF bad = '' THEN
        RAISE NOTICE 'PASS [%] no guarded view grants writes to authenticated',
            current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'FAIL [%] writable through:%', current_setting('cs.generation', true), bad;
    END IF;
END $$;

-- ─── (2) the write must actually be refused, not just un-granted ──
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

DO $$ BEGIN
    UPDATE public.admin_order_items_view SET quantity = 999999 WHERE true;
    RAISE NOTICE 'FAIL [%] a customer wrote through admin_order_items_view',
        current_setting('cs.generation', true);
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS [%] admin_order_items_view write refused by privilege', current_setting('cs.generation', true);
WHEN OTHERS THEN
    -- A view over a join is structurally un-updatable ("cannot update view"), so
    -- this refusal is not evidence the REVOKE worked. Section (1) and the
    -- single-table moq_review_queue / translations_view checks below are.
    IF SQLERRM LIKE '%auto_view%' OR SQLERRM LIKE '%not updatable%'
       OR SQLERRM LIKE '%cannot update view%' THEN
        RAISE NOTICE 'PASS [%] admin_order_items_view un-updatable by shape (section (1) proves the grant is gone too)',
            current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'FAIL [%] admin_order_items_view: unexpected %', current_setting('cs.generation', true), SQLERRM;
    END IF;
END $$;

DO $$ BEGIN
    UPDATE public.moq_review_queue
       SET moq = 1, moq_source = 'manual', moq_confidence = 1.000
     WHERE true;
    RAISE NOTICE 'FAIL [%] a customer forged a human-confirmed MOQ', current_setting('cs.generation', true);
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS [%] moq_review_queue write refused', current_setting('cs.generation', true);
WHEN OTHERS THEN
    IF SQLERRM LIKE '%auto_view%' OR SQLERRM LIKE '%not updatable%' THEN
        RAISE NOTICE 'PASS [%] moq_review_queue is not updatable at all', current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'FAIL [%] moq_review_queue: unexpected %', current_setting('cs.generation', true), SQLERRM;
    END IF;
END $$;

DO $$ BEGIN
    DELETE FROM public.translations_view WHERE true;
    RAISE NOTICE 'FAIL [%] a customer deleted rows through translations_view', current_setting('cs.generation', true);
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS [%] translations_view delete refused', current_setting('cs.generation', true);
WHEN OTHERS THEN
    IF SQLERRM LIKE '%auto_view%' OR SQLERRM LIKE '%not updatable%' THEN
        RAISE NOTICE 'PASS [%] translations_view is not updatable at all', current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'FAIL [%] translations_view: unexpected %', current_setting('cs.generation', true), SQLERRM;
    END IF;
END $$;

-- The events ledger is staff-only by predicate, so a customer read must be empty
-- rather than an error: that is the difference between "hidden" and "broken".
DO $$
DECLARE n bigint;
BEGIN
    EXECUTE 'SELECT count(*) FROM public.admin_product_events_view' INTO n;
    IF n = 0 THEN
        RAISE NOTICE 'PASS [%] customer sees 0 event rows', current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'FAIL [%] customer saw % event rows', current_setting('cs.generation', true), n;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Refusing outright is also acceptable; leaking is not.
    IF SQLERRM LIKE '%permission denied%' THEN
        RAISE NOTICE 'PASS [%] customer refused the events view entirely', current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'FAIL [%] events view read: %', current_setting('cs.generation', true), SQLERRM;
    END IF;
END $$;

RESET ROLE;

-- ─── (3) staff must still get their rows (a fix that hides everything is a bug) ──
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
DO $$
DECLARE n bigint; v_has boolean;
BEGIN
    -- g3_minimal has no line-item storage at all, so 0 rows there is the schema
    -- talking, not the revocation. Ask the generation first.
    SELECT g.has_items INTO v_has FROM public.generation_caps g;
    SELECT count(*) INTO n FROM public.admin_order_items_view;
    IF v_has AND n = 0 THEN
        RAISE NOTICE 'FAIL [%] staff can no longer read admin_order_items_view', current_setting('cs.generation', true);
    elsif NOT v_has THEN
        -- The fixture path writes line items from the order's items JSON, which
        -- this generation does not have, so 0 rows is the schema, not the
        -- revocation. The read itself succeeding is the point.
        RAISE NOTICE 'PASS [%] staff read succeeded (0 rows: this generation carries no synced line items)',
            current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'PASS [%] staff still reads % order lines', current_setting('cs.generation', true), n;
    END IF;
END $$;
RESET ROLE;
