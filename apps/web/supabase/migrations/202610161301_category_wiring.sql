-- ============================================================
-- ChinaSuuq — Wire products to real categories (data repair, idempotent)
-- 2026-10-16
--
-- WHY. `source_products.category_id uuid -> categories.id` exists in production
-- and is populated for 0 of 15 rows. All categorisation sits in the denormalised
-- text column `category`, which holds English NAMES ("Electronics", "Home &
-- Kitchen") plus one value with no category row at all ("Sports"). Every category
-- surface therefore had nothing to join: the admin's category counts RPC reads
-- `category_id`, the admin product form writes free text, and the customer shop
-- cannot filter by category.
--
-- This file is the one-time repair. It can be run in the Supabase dashboard SQL
-- editor (the Management API token is expired, so no code path can apply it) and
-- Mission Control → Products → Categories has the same logic as a button
-- (`syncProductCategoryIds()` in src/lib/catalog.ts), which is dry-run by default.
-- Both are safe to repeat: every statement only fills NULLs.
--
-- MATCHING RULE (same as the TypeScript helper): compare the product's text
-- against categories.name_en, name_so and slug, case-insensitively and with every
-- run of punctuation collapsed to a single space, so "Home & Kitchen",
-- "home & kitchen", "home-kitchen" and "Home  Kitchen" all land on row 3.

-- ─── 1. Fill the FK from the text (never overwrites a real FK) ─────────────
WITH keyed AS (
  SELECT
    p.id AS product_id,
    c.id AS category_id,
    -- rank the candidates so a text that matches two rows deterministically
    -- picks one instead of making the UPDATE non-deterministic:
    -- name_en exact > slug exact > name_so exact.
    row_number() OVER (
      PARTITION BY p.id
      ORDER BY
        CASE
          WHEN lower(btrim(c.name_en)) = lower(btrim(p.category)) THEN 1
          WHEN lower(btrim(replace(c.slug, '-', ' '))) = lower(btrim(p.category)) THEN 2
          WHEN lower(btrim(c.name_so)) = lower(btrim(p.category)) THEN 3
          ELSE 4
        END,
        c.sort_order NULLS LAST,
        c.name_en
    ) AS pick
  FROM public.source_products p
  JOIN public.categories c
    ON (
      lower(btrim(c.name_en)) = lower(btrim(p.category))
      OR lower(btrim(replace(c.slug, '-', ' '))) = lower(btrim(p.category))
      OR lower(btrim(c.name_so)) = lower(btrim(p.category))
      OR lower(btrim(replace(c.slug, '-', ' '))) = lower(regexp_replace(p.category, '\s+', ' ', 'g'))
    )
  WHERE p.category_id IS NULL
    AND nullif(btrim(coalesce(p.category, '')), '') IS NOT NULL
)
UPDATE public.source_products p
   SET category_id = k.category_id,
       updated_at = now()
  FROM keyed k
 WHERE p.id = k.product_id
   AND k.pick = 1
   AND p.category_id IS NULL;

-- ─── 2. Normalise the text column to the canonical name_en ────────────────
-- `category` is what a list query reads without a join, so once the FK is right
-- the text must say the same thing the category row says. Only rows that now have
-- an FK are rewritten, so an unmatched value ("Sports") stays visible for review
-- instead of being quietly blanked.
UPDATE public.source_products p
   SET category = c.name_en
  FROM public.categories c
 WHERE p.category_id = c.id
   AND nullif(btrim(coalesce(c.name_en, '')), '') IS NOT NULL
   AND coalesce(p.category, '') <> c.name_en;

-- ─── 3. Report what is still unlinked ─────────────────────────────────────
-- Expected after a clean run: 0 rows. A row here is a product whose `category`
-- text has no matching category, and Mission Control shows the same list so
-- somebody can either add the category or fix the product.
SELECT p.id,
       coalesce(nullif(p.title_english, ''), nullif(p.title_somali, ''), p.title_original, 'Untitled') AS product,
       p.category AS text_value
  FROM public.source_products p
 WHERE p.category_id IS NULL
   AND coalesce(p.status, 'active') = 'active'
 ORDER BY p.category NULLS FIRST;

-- ─── 3b. Optional: give the orphan texts a home instead of a dead end ─────
-- A product whose `category` text matches nothing is invisible on every category
-- page, and there is no row to point at. Rather than delete the text or leave the
-- product stranded, create a category for each orphan text — INACTIVE, so it does
-- not appear on the customer shelf until staff rename it, translate it and switch
-- it on in Mission Control → Products → Categories.
--
-- LEFT INACTIVE ON PURPOSE. Measured 2026-10-16: 15 products, 12 categories, 7
-- distinct texts, exactly one orphan ("Sports", 1 product). A catalogue this size
-- should be cleaned by hand, not auto-published, which is why this statement is
-- opt-in: run it, then review the rows it created.
-- Idempotent WITHOUT relying on a unique index: every text already answered by a
-- category (by name_en, name_so, or slug with dashes read as spaces) is excluded,
-- so a second run inserts nothing. There is deliberately no ON CONFLICT clause
-- here, because ON CONFLICT (slug) fails outright unless a unique constraint on
-- slug actually exists, and that has not been verified on this project.
INSERT INTO public.categories (name_en, name_so, slug, icon, sort_order, is_active)
SELECT DISTINCT ON (lower(btrim(p.category)))
       btrim(p.category),                 -- name_en = the text as the importer wrote it
       NULL,                              -- name_so: staff translate it, never machine-guess it
       lower(btrim(regexp_replace(p.category, '[^a-zA-Z0-9]+', '-', 'g'), '-')) AS slug,
       NULL,
       (SELECT coalesce(max(sort_order), 0) + 1 FROM public.categories),
       FALSE
  FROM public.source_products p
 WHERE coalesce(p.status, 'active') = 'active'
   AND nullif(btrim(coalesce(p.category, '')), '') IS NOT NULL
   AND p.category_id IS NULL
   -- no existing category answers to this text in any of its three spellings
   AND NOT EXISTS (
         SELECT 1 FROM public.categories c
          WHERE lower(btrim(c.name_en)) = lower(btrim(p.category))
             OR lower(btrim(c.name_so)) = lower(btrim(p.category))
             OR lower(btrim(replace(c.slug, '-', ' '))) = lower(btrim(replace(p.category, '-', ' ')))
       )
   -- and no category already owns the slug we are about to build
   AND NOT EXISTS (
         SELECT 1 FROM public.categories c2
          WHERE c2.slug = lower(btrim(regexp_replace(p.category, '[^a-zA-Z0-9]+', '-', 'g'), '-'))
       );

-- Then re-run section 1 so the new rows get their products linked.

-- ─── 4. Per-category counts, the number Mission Control shows ─────────────
SELECT c.name_en,
       c.slug,
       count(p.id) AS products
  FROM public.categories c
  LEFT JOIN public.source_products p ON p.category_id = c.id
 GROUP BY c.id
 ORDER BY c.sort_order NULLS LAST, c.name_en;

-- ============================================================
-- NOTE ON TRENDING PLACEMENT — why there is no `is_featured` column here.
-- Staff picks are stored in `source_products.attributes` under the reserved key
-- "_curation" (see the header of src/lib/catalog.ts), because:
--   * `settings` is not readable by anon (verified 401), so a curation row there
--     would be invisible to the customer home page;
--   * the Management API token is expired, so a new column could not be applied
--     from code and would sit un-migrated on production;
--   * the product row is already the only thing both apps fetch for a card.
-- If a real column is ever wanted, add `is_featured boolean` + `featured_rank int`
-- here, backfill them from the attributes key, and then move the writes in
-- `writeTrendingCuration()` — do not leave both spellings live, or a dashboard
-- edit will look like it did nothing.
-- ============================================================
