-- MOQ candidate gate. Run as a separate psql invocation, after the access
-- suites so its writes cannot disturb them.
--
-- record_moq_candidate() is the ONLY machine path into source_products.moq, and
-- the edge functions call it with whatever a parser or a paid model produced.
-- So its verdicts are a security boundary: an unparseable number, a confidence
-- above 1, or a weaker reading must never rewrite what a human confirmed.

-- A row with no provenance at all: moq DEFAULT 1, moq_source NULL. That is the
-- state every legacy product is in, and the state the gate is judged on.
UPDATE public.source_products
   SET moq = 1, moq_source = NULL, moq_confidence = NULL, moq_raw_text = NULL, moq_reviewed_at = NULL
 WHERE id = 'f0000000-0000-4000-8000-000000000002';

DO $$
DECLARE
    p        uuid := 'f0000000-0000-4000-8000-000000000002';
    v        text;
    fails    text := '';
    v_moq    integer;
    v_src    text;
    v_conf   numeric;
    v_rev    timestamptz;
    v_raw    text;
BEGIN
    -- ─── range, source and confidence are refused, not clamped ────
    IF public.record_moq_candidate(p, 0,    0.9,  'x', 'regex') <> 'rejected_moq_range' THEN fails := fails || ' moq 0'; END IF;
    IF public.record_moq_candidate(p, -3,   0.9,  'x', 'regex') <> 'rejected_moq_range' THEN fails := fails || ' negative moq'; END IF;
    IF public.record_moq_candidate(p, 100001, 0.9,'x', 'regex') <> 'rejected_moq_range' THEN fails := fails || ' moq above range'; END IF;
    IF public.record_moq_candidate(p, NULL, 0.9,  'x', 'regex') <> 'rejected_moq_range' THEN fails := fails || ' null moq'; END IF;
    IF public.record_moq_candidate(p, 5,    NULL, 'x', 'regex') <> 'rejected_confidence' THEN fails := fails || ' null confidence'; END IF;
    IF public.record_moq_candidate(p, 5,    1.1,  'x', 'regex') <> 'rejected_confidence' THEN fails := fails || ' confidence > 1'; END IF;
    IF public.record_moq_candidate(p, 5,    99999,'x', 'regex') <> 'rejected_confidence' THEN fails := fails || ' overflow not caught'; END IF;
    IF public.record_moq_candidate(p, 5,    0.9,  'x', 'model')  <> 'rejected_source' THEN fails := fails || ' unknown source'; END IF;
    IF public.record_moq_candidate(p, 5,    0.9,  'x', NULL)     <> 'rejected_source' THEN fails := fails || ' null source'; END IF;
    IF public.record_moq_candidate(NULL, 5, 0.9,  'x', 'regex') <> 'rejected_product_id' THEN fails := fails || ' null product id'; END IF;
    IF public.record_moq_candidate('9e593476-0000-4000-8000-0000000000ff', 5, 0.9, 'x', 'regex') <> 'product_not_found' THEN
        fails := fails || ' missing product not reported';
    END IF;

    -- Nothing was stored by any rejection: the row is still the default.
    SELECT moq, moq_source INTO v_moq, v_src FROM public.source_products WHERE id = p;
    IF v_moq <> 1 OR v_src IS NOT NULL THEN
        fails := fails || format(' a rejection wrote (%s,%s)', v_moq, coalesce(v_src, 'null'));
    END IF;

    -- ─── Rule D against no provenance: any valid candidate beats NULL ──
    IF public.record_moq_candidate(p, 20, 0.600, '20件起批', 'regex') <> 'written' THEN fails := fails || ' first candidate refused'; END IF;
    SELECT moq, moq_source, moq_confidence INTO v_moq, v_src, v_conf FROM public.source_products WHERE id = p;
    IF v_moq <> 20 OR v_src <> 'regex' OR v_conf <> 0.600 THEN fails := fails || ' first candidate not stored'; END IF;

    -- identical repeat is a no-op, not a rewrite
    IF public.record_moq_candidate(p, 20, 0.600, '20件起批', 'regex') <> 'unchanged' THEN fails := fails || ' unchanged repeat wrote'; END IF;
    -- a weaker reading of the same page never wins
    IF public.record_moq_candidate(p, 3,  0.500, '3件起批?', 'ai') <> 'not_improvement' THEN fails := fails || ' weaker reading won'; END IF;
    SELECT moq, moq_source INTO v_moq, v_src FROM public.source_products WHERE id = p;
    IF v_moq <> 20 OR v_src <> 'regex' THEN fails := fails || ' weaker reading overwrote (now ' || v_moq || '/' || v_src || ')'; END IF;
    -- equal confidence from another source is still not an improvement
    IF public.record_moq_candidate(p, 25, 0.600, '≥25', 'ai') <> 'not_improvement' THEN fails := fails || ' equal confidence won'; END IF;
    -- a strictly better confidence does
    IF public.record_moq_candidate(p, 50, 0.857, '50件起批', 'ai') <> 'written' THEN fails := fails || ' better candidate refused'; END IF;
    SELECT moq, moq_source, moq_confidence INTO v_moq, v_src, v_conf FROM public.source_products WHERE id = p;
    -- rounded to the column's NUMERIC(4,3), so the verdict and the stored value agree
    IF v_moq <> 50 OR v_src <> 'ai' OR v_conf <> 0.857 THEN fails := fails || format(' ai candidate stored as (%s,%s,%s)', v_moq, v_src, v_conf); END IF;

    -- ─── Rule C: a human ends the discussion ────────────────────
    IF public.record_moq_candidate(p, 1, 0.9, 'no minimum, single pieces welcome', 'manual') <> 'written' THEN
        fails := fails || ' manual refused';
    END IF;
    SELECT moq, moq_source, moq_confidence, moq_reviewed_at INTO v_moq, v_src, v_conf, v_rev FROM public.source_products WHERE id = p;
    -- A manual 1 is a decision ("this has no minimum"), not the absence of one.
    IF v_moq <> 1 OR v_src <> 'manual' OR v_conf <> 1.000 OR v_rev IS NULL THEN
        fails := fails || format(' manual stored as (%s,%s,%s,reviewed=%s)', v_moq, v_src, v_conf, coalesce(v_rev::text,'null'));
    END IF;

    -- ─── Rule A: no machine ever replaces it, at any confidence ──
    IF public.record_moq_candidate(p, 500, 1.0, '500件起批', 'ai') <> 'blocked_manual' THEN fails := fails || ' machine replaced a human'; END IF;
    IF public.record_moq_candidate(p, 500, 1.0, '500件起批', 'regex') <> 'blocked_manual' THEN fails := fails || ' regex replaced a human'; END IF;
    SELECT moq, moq_source INTO v_moq, v_src FROM public.source_products WHERE id = p;
    IF v_moq <> 1 OR v_src <> 'manual' THEN fails := fails || ' blocked_manual still wrote'; END IF;
    -- but a human may change their own mind
    IF public.record_moq_candidate(p, 12, 0.5, 'customer asked for 12', 'manual') <> 'written' THEN
        fails := fails || ' manual override of manual refused';
    END IF;

    -- ─── raw text is bounded, so a captured page cannot bloat the row ──
    SELECT left('字', 900) INTO v_raw;
    IF public.record_moq_candidate(p, 12, 0.9, v_raw, 'manual') <> 'written' THEN fails := fails || ' repeat manual refused'; END IF;
    SELECT length(moq_raw_text) INTO v_moq FROM public.source_products WHERE id = p;
    IF v_moq > 500 THEN fails := fails || ' raw text stored untruncated at ' || v_moq; END IF;

    IF fails = '' THEN
        RAISE NOTICE 'PASS [%] MOQ gate: ranges, provenance precedence, monotonic confidence',
            current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'FAIL [%] MOQ gate:%', current_setting('cs.generation', true), fails;
    END IF;
END $$;

-- ─── the gate is service_role only ────────────────────────────
-- It is SECURITY DEFINER and writes past RLS, so a customer calling it directly
-- would be able to forge a "human confirmed" minimum for any product.
DO $$ BEGIN
    IF has_function_privilege('anon', 'public.record_moq_candidate(uuid,integer,numeric,text,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.record_moq_candidate(uuid,integer,numeric,text,text)', 'EXECUTE') THEN
        RAISE NOTICE 'FAIL [%] a customer role may call record_moq_candidate directly', current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'PASS [%] record_moq_candidate is service_role only', current_setting('cs.generation', true);
    END IF;
END $$;

SET ROLE authenticated;
DO $$ BEGIN
    PERFORM public.record_moq_candidate('f0000000-0000-4000-8000-000000000002', 999, 1.0, 'forged', 'manual');
    RAISE NOTICE 'FAIL [%] a customer wrote through the MOQ gate', current_setting('cs.generation', true);
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS [%] customer call of the MOQ gate refused', current_setting('cs.generation', true);
WHEN OTHERS THEN
    IF SQLERRM LIKE '%permission denied%' THEN
        RAISE NOTICE 'PASS [%] customer call of the MOQ gate refused', current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'FAIL [%] MOQ gate customer call: %', current_setting('cs.generation', true), SQLERRM;
    END IF;
END $$;
RESET ROLE;

-- ─── the review queue shows exactly the un-confirmed rows ─────
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
DO $$
DECLARE n bigint; v_manual bigint;
BEGIN
    -- staff-only: moq_source = 'manual' never appears in the queue.
    SELECT count(*) INTO v_manual FROM public.moq_review_queue WHERE moq_source = 'manual';
    SELECT count(*) INTO n FROM public.moq_review_queue;
    IF v_manual <> 0 THEN
        RAISE NOTICE 'FAIL [%] moq_review_queue lists % human-confirmed rows', current_setting('cs.generation', true), v_manual;
    ELSIF n = 0 THEN
        RAISE NOTICE 'FAIL [%] moq_review_queue is empty on a cluster with un-provenanced products', current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'PASS [%] staff reads % queue rows, none of them confirmed', current_setting('cs.generation', true), n;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAIL [%] moq_review_queue read: %', current_setting('cs.generation', true), SQLERRM;
END $$;
RESET ROLE;
