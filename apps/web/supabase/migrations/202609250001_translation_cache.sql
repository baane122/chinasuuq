-- ============================================================
-- ChinaSuuq — Migration 21: translation cache
-- 2026-09-25
--
-- WHY THIS EXISTS: marketplace pages are Chinese and the customers are Somali,
-- so every product title goes through a PAID provider. The same title shown on
-- two screens must cost one call, not two, so provider output is persisted and
-- looked up before any spend happens.
--
-- THE PRIMARY KEY IS A HASH, NOT THE TEXT: the cache lookup sends its keys as
-- an IN-list, and 40 raw titles at the 2,000-character input cap would be a
-- ~700 KB percent-encoded request line (CJK is 9 URL bytes per character) that
-- a gateway refuses long before Postgres sees it; sha256 keeps every key a
-- fixed 64 characters, and index entries bounded too. source_hash is computed
-- by the edge function, while the raw text stays in the row so every read
-- confirms the match — a hashing disagreement costs a cache miss, never a
-- translation that belongs to a different string.
-- ============================================================

-- ─── 1. Cache table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.translations (
    source_text     text NOT NULL,
    source_hash     text NOT NULL,
    target_lang     text NOT NULL,
    provider        text,
    model           text,
    translated_text text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT translations_pkey PRIMARY KEY (source_hash, target_lang)
);

COMMENT ON TABLE public.translations IS
    'Paid AI translation output, keyed by sha256(source_text) + target_lang. Written only by the ai-translate edge function.';

-- ─── 2. Who may read ────────────────────────────────────────────
-- Translations are global (a title is the same title for everyone), so any
-- signed-in user may read any row. RLS is still enabled because the grants
-- below give authenticated SELECT on the base table, and the invoker-rights
-- view relies on a policy existing for the read to succeed.
ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "translations_select" ON public.translations;
CREATE POLICY "translations_select" ON public.translations FOR SELECT
    TO authenticated
    USING (true);

-- What the app reads: the strings it needs and nothing about which paid
-- provider produced them.
CREATE OR REPLACE VIEW public.translations_view AS
SELECT source_text, target_lang, translated_text, created_at
FROM public.translations;

-- ─── 3. Locking ─────────────────────────────────────────────────
-- No write path for client roles at all: the cache is only ever filled by the
-- edge function running as service_role.
REVOKE ALL ON public.translations FROM anon, authenticated, public;
GRANT SELECT ON public.translations TO authenticated;
GRANT ALL ON public.translations TO service_role;

-- Invoker rights, so RLS above decides the reader instead of the view owner
-- handing out a bypass. Supabase runs Postgres 15+, which knows this view
-- option; the local scratch cluster may be 14, where the option name is
-- unknown and aborting the whole file would be worse than deferring one flag.
-- The REVOKE below still closes the anon hole on any version.
DO $$ BEGIN
    EXECUTE 'ALTER VIEW public.translations_view SET (security_invoker = true)';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ChinaSuuq: could not set security_invoker on translations_view (%). Set it manually once the server is Postgres 15+.', SQLERRM;
END $$;

-- A cached translation is for signed-in customers, not for the anonymously
-- readable public: the anon key ships inside the mobile bundle.
-- authenticated keeps Supabase's default arwdDxt, and a simple view is
-- auto-updatable: a customer UPDATEd and DELETEd rows straight through this
-- view into public.translations on the audit cluster. Reads are the only thing
-- this view may serve.
REVOKE ALL ON public.translations_view FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.translations_view TO authenticated;

-- ============================================================
-- VERIFY AFTER APPLYING:
-- Writes belong to the edge function only (as authenticated):
--   INSERT INTO translations (source_text, source_hash, target_lang, translated_text)
--     VALUES ('x','x','so','y');   -- must be denied
-- Reads must succeed for authenticated and return zero rows for anon:
--   SELECT count(*) FROM public.translations_view;
-- ============================================================
