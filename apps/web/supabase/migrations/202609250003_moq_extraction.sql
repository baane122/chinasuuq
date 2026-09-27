-- ============================================================
-- ChinaSuuq — Migration: MOQ capture provenance + staff review queue
-- 2026-09-25
--
-- THE PROBLEM: MOQ is the single most mis-captured field on 1688. It arrives as
-- "2件起批", "起订量: 5", "≥50", a bare "100", or a price ladder
-- ("2-19件 ¥12 / 20-99件 ¥10 / ≥100件 ¥8"), and the mobile capture pass reads
-- document HTML, so it usually misses it entirely. Customers then add 1 piece
-- of a 50-piece-minimum product and staff discover the gap at purchase time.
--
-- MOQ is also the field most likely to be GUESSED. Storing a bare integer makes
-- a guess indistinguishable from a supplier rule, and a cart cannot honestly
-- say "minimum order 50" either way. So every captured MOQ gets provenance:
--   moq_source      — manual (a human typed it) | regex (local parser) | ai
--   moq_confidence  — 0.000–1.000, whoever wrote it
--   moq_raw_text    — the marketplace wording the number came from, so staff can
--                     audit the reading without reopening the listing
--   moq_reviewed_at — when a human confirmed the rule
--
-- WHY ON source_products: that is the real products table (202408010004). Note
-- it already carries `moq integer DEFAULT 1`, so this file adds the provenance
-- columns only; the DEFAULT is what makes an unset MOQ read as "1 piece", which
-- is precisely the false signal the review queue exists to surface.
--
-- record_moq_candidate() is the write gate: a machine may only ever make the
-- answer better, never replace a human's decision or lower a confidence.
-- ============================================================

-- ─── 1. Provenance columns ───────────────────────────────────────
ALTER TABLE public.source_products
  ADD COLUMN IF NOT EXISTS moq             INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS moq_source      TEXT,
  ADD COLUMN IF NOT EXISTS moq_confidence  NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS moq_raw_text    TEXT,
  ADD COLUMN IF NOT EXISTS moq_reviewed_at TIMESTAMPTZ;

DO $$ BEGIN
    ALTER TABLE public.source_products
      ADD CONSTRAINT source_products_moq_source_check
      CHECK (moq_source IN ('manual','regex','ai'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.source_products
      ADD CONSTRAINT source_products_moq_confidence_check
      CHECK (moq_confidence >= 0 AND moq_confidence <= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- No CHECK on moq itself: the column predates this file, so a legacy 0 or a
-- bulk-carton 500000 would abort the ALTER TABLE here. The range is enforced on
-- write by record_moq_candidate(), which is the only machine path into it.

CREATE INDEX IF NOT EXISTS idx_source_products_moq_provenance
  ON public.source_products(moq_source, moq_confidence);

-- ─── 2. Candidate write gate ────────────────────────────────────
-- Model and parser output are UNTRUSTED INPUT: nothing is stored until it is a
-- positive integer inside a defensible range, and the stored value may only
-- change when the candidate is strictly better.
CREATE OR REPLACE FUNCTION public.record_moq_candidate(
    p_product_id  uuid,
    p_moq         integer,
    p_confidence  numeric,
    p_raw_text    text,
    p_source      text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing public.source_products%ROWTYPE;
BEGIN
    IF p_product_id IS NULL THEN
        RETURN 'rejected_product_id';
    END IF;
    IF p_source IS NULL OR p_source NOT IN ('manual','regex','ai') THEN
        RETURN 'rejected_source';
    END IF;
    -- Guards the NUMERIC(4,3) column too: a 5-digit value would raise
    -- numeric_field_overflow instead of returning an honest verdict. Rounded
    -- first so the comparison below and the value stored cannot disagree.
    IF p_confidence IS NULL THEN
        RETURN 'rejected_confidence';
    END IF;
    p_confidence := round(p_confidence, 3);
    IF p_confidence < 0 OR p_confidence > 1 THEN
        RETURN 'rejected_confidence';
    END IF;
    -- A carton of 100000 pieces is possible; a negative or fractional MOQ is
    -- not a quantity anyone can order.
    IF p_moq IS NULL OR p_moq < 1 OR p_moq > 100000 THEN
        RETURN 'rejected_moq_range';
    END IF;

    -- Lock the row so two concurrent candidates cannot both read the same
    -- "current best" and have the weaker one land last.
    SELECT * INTO v_existing
    FROM public.source_products
    WHERE id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 'product_not_found';
    END IF;

    -- Rule A — a human answer wins outright and is never replaced by a machine.
    IF v_existing.moq_source = 'manual' AND p_source <> 'manual' THEN
        RETURN 'blocked_manual';
    END IF;

    -- Rule B — same source, same number, same confidence: nothing improved.
    IF COALESCE(v_existing.moq_source, '') = p_source
       AND v_existing.moq = p_moq
       AND v_existing.moq_confidence IS NOT DISTINCT FROM p_confidence THEN
        RETURN 'unchanged';
    END IF;

    IF p_source = 'manual' THEN
        -- Rule C — manual is the strongest evidence there is: it always writes,
        -- including over a machine value and even when provenance is missing.
        UPDATE public.source_products SET
            moq             = p_moq,
            moq_source      = 'manual',
            moq_confidence  = 1.000,
            moq_raw_text    = left(btrim(coalesce(p_raw_text, '')), 500),
            moq_reviewed_at = now()
        WHERE id = p_product_id;
        RETURN 'written';
    END IF;

    -- Rule D — machine vs machine: confidence is the only currency, and it may
    -- only move up. An AI value replaces NULL (no provenance, whatever moq
    -- DEFAULT 1 left there) or a strictly lower-confidence machine value; a
    -- weaker reading of the page never wins. Existing NULL confidence counts
    -- as 0, so any valid candidate beats it.
    IF v_existing.moq_source IN ('regex','ai')
       AND p_confidence <= COALESCE(v_existing.moq_confidence, 0) THEN
        RETURN 'not_improvement';
    END IF;

    UPDATE public.source_products SET
        moq            = p_moq,
        moq_source     = p_source,
        moq_confidence = p_confidence,
        moq_raw_text   = left(btrim(coalesce(p_raw_text, '')), 500)
    WHERE id = p_product_id;
    RETURN 'written';
END;
$$;

-- ─── 3. Staff review queue ──────────────────────────────────────
-- One row per product whose MOQ no human has confirmed. The spec predicate was
-- moq IS NULL OR moq_source = 'ai', but moq has defaulted to 1 since
-- 202408010004_products_translations_pricing.sql, so an un-captured product is
-- NOT NULL — it is UNPROVENANCED. The extra arms are what make the queue both
-- non-empty and drainable: the default 1 surfaces instead of hiding, and a weak
-- regex hit stays until it is confirmed or beaten. 'manual' never appears.
--
-- The description columns are read through to_jsonb(), and that is not
-- defensiveness for its own sake: a VIEW's column list is resolved when the view
-- is CREATED, unlike a plpgsql body, so naming a column this catalog does not
-- have aborts the entire migration file at that line. The live project
-- (athkmrvsaijwgsyvwrbp, probed 2026-09-25) has `source_product_id` +
-- `title_original` and no source_id / source_title / status / in_stock, so the
-- importer spelling below is the fallback, not the primary.
--
-- Which spelling wins is ordered by what staff need: the marketplace's own words
-- first, because that is the text the MOQ number was read out of.
CREATE OR REPLACE VIEW public.moq_review_queue AS
SELECT
    sp.id,
    sp.moq,
    sp.moq_source,
    sp.moq_confidence,
    sp.moq_raw_text,
    sp.moq_reviewed_at,
    sp.updated_at,
    (to_jsonb(sp) ->> 'marketplace')                 AS marketplace,
    coalesce(to_jsonb(sp) ->> 'source_id',
             to_jsonb(sp) ->> 'source_product_id')   AS source_id,
    (to_jsonb(sp) ->> 'source_url')                  AS source_url,
    coalesce(nullif(to_jsonb(sp) ->> 'source_title', ''),
             nullif(to_jsonb(sp) ->> 'title_original', ''),
             nullif(to_jsonb(sp) ->> 'title_english', '')) AS source_title,
    (to_jsonb(sp) ->> 'last_synced_at')              AS last_synced_at,
    -- A catalog without a draft/archived flag has nothing to exclude, so the
    -- absent key defaults to the buyable value rather than dropping every row.
    coalesce(nullif(to_jsonb(sp) ->> 'status', ''), 'active') AS status
FROM public.source_products sp
WHERE sp.moq IS NULL
   OR sp.moq_source IS NULL
   OR sp.moq_source = 'ai'
   OR (sp.moq_source = 'regex'
       AND COALESCE(sp.moq_confidence, 0) < 0.9)
ORDER BY sp.moq_confidence ASC NULLS FIRST, sp.updated_at ASC;

-- ─── 4. Locking ─────────────────────────────────────────────────
-- SECURITY DEFINER bypasses RLS, so EXECUTE is held to service_role: edge
-- functions present verified staff/customer JWTs and then write through it.
REVOKE ALL ON FUNCTION public.record_moq_candidate(uuid, integer, numeric, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_moq_candidate(uuid, integer, numeric, text, text)
  TO service_role;

-- Invoker rights, so RLS on source_products decides who reads which row rather
-- than the view owner granting a bypass. Supabase runs Postgres 15+, which has
-- this view option; the guard exists because the option name is unknown to
-- older servers, where aborting the whole file would be worse than deferring
-- one flag. The REVOKE below still closes the anon hole on any version.
DO $$ BEGIN
    EXECUTE 'ALTER VIEW public.moq_review_queue SET (security_invoker = true)';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ChinaSuuq: could not set security_invoker on moq_review_queue (%). Set it manually once the server is Postgres 15+.', SQLERRM;
END $$;

-- Revoking from anon alone is not enough: authenticated inherits Supabase's
-- default write privileges, and this single-table view is auto-updatable, so a
-- customer could POST `moq = 1, moq_source = 'manual'` straight through it and
-- forge a human-confirmed MOQ (executed on the audit cluster).
REVOKE ALL ON public.moq_review_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.moq_review_queue TO authenticated;

COMMENT ON VIEW public.moq_review_queue IS
  'MOQ values no human has confirmed, worst-confidence first. Staff review surface.';
COMMENT ON COLUMN public.source_products.moq_source IS
  'manual = human-entered (never overwritten by a machine), regex = local parser, ai = model.';

-- ============================================================
-- VERIFY AFTER APPLYING (as staff):
--   SELECT id, moq, moq_source, moq_confidence, left(moq_raw_text, 40) AS raw
--   FROM moq_review_queue
--   ORDER BY moq_confidence NULLS FIRST LIMIT 20;
-- Re-running this migration is safe: columns are IF NOT EXISTS, constraints are
-- guarded, and the function and view are replaced.
-- ============================================================
