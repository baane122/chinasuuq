-- ============================================================
-- ChinaSuuq — Product photo hosting (Mission Control image manager)
-- 2026-10-16
--
-- WHY THIS EXISTS. Product images live in `source_products.images text[]`, and
-- production holds 14 empty arrays and one `[""]` out of 15 rows. Nothing is
-- hosted: `GET /storage/v1/bucket` returns `[]`, so the admin could only ever
-- paste hotlinks to 1688/Taobao CDNs. Those URLs expire and refuse foreign
-- referers, which is why cards fall back to a placeholder. The customer shop and
-- the admin image manager both read `images`, so this file only adds hosting —
-- no product column changes, no data rewrite, nothing to backfill.
--
-- RUN IT IN THE Supabase DASHBOARD (SQL editor) AS A PROJECT OWNER.
-- The Management API token this project automated deploys with is expired
-- (verified 401 on 2026-10-16), so DDL cannot be pushed from code. Until this is
-- applied, `uploadProductImage()` in `src/lib/catalog.ts` fails with a message
-- naming this file, and the URL-based manager keeps working. That is deliberate:
-- an upload button that silently does nothing is worse than one that says what to
-- click.
--
-- PUBLIC READ, STAFF WRITE. The bucket is public because a customer's product
-- page has no session; writes require a staff JWT, matching the existing
-- `is_staff_or_admin()` policy style on `source_products` (202408010010).
-- Path convention is `<product-id-or-unassigned>/<timestamp>-<rand>.<ext>`, which
-- is what `uploadProductImage()` builds.
-- ============================================================

-- ─── 1. The bucket (idempotent) ────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  6291456,                                  -- 6 MB, the client also enforces it
  ARRAY['image/png','image/jpeg','image/webp','image/gif','image/avif']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 2. Policies (drop-then-create so re-running is safe) ──────────────────
DROP POLICY IF EXISTS "product images are publicly readable" ON storage.objects;
CREATE POLICY "product images are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "staff upload product images" ON storage.objects;
CREATE POLICY "staff upload product images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_staff_or_admin()
    -- One owner folder per product keeps a listing scan cheap and makes an
    -- orphaned upload findable; `unassigned` is for a draft not yet saved.
    AND (split_part(name, '/', 1) = 'unassigned'
         OR split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  );

DROP POLICY IF EXISTS "staff replace their own product images" ON storage.objects;
CREATE POLICY "staff replace their own product images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_staff_or_admin());

DROP POLICY IF EXISTS "staff delete product images" ON storage.objects;
CREATE POLICY "staff delete product images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_staff_or_admin());

-- ─── 3. Grants ─────────────────────────────────────────────────────────────
-- Supabase's own storage roles; without these the dashboard works but the API
-- path `supabase.storage.from('product-images').upload()` answers 401.
GRANT USAGE ON SCHEMA storage TO anon, authenticated;
GRANT SELECT ON storage.objects TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON storage.objects TO authenticated;

-- ============================================================
-- VERIFY AFTER APPLYING (from Mission Control → Products → photo manager):
--   SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'product-images';
--   -- 1 row, public = true
--   -- as anon (customer browser), a read of a known path must be 200 or 400-not-401:
--   --   GET /storage/v1/object/public/product-images/<path>
--   -- as a NON-staff signed-in customer, an upload must be refused by the policy.
-- Then re-upload one photo in the admin and confirm `images` gained a
-- https://<project>.supabase.co/storage/v1/object/public/product-images/... URL.
-- ============================================================
