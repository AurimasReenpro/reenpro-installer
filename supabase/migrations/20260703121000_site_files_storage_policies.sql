-- ============================================================
-- Migration: storage RLS for the `site_files` bucket
--
-- Canonical bucket name: `site_files` (underscore). The repo had one stray
-- `site-files` (hyphen) reference in getSiteDeletionBlockers — fixed in code
-- alongside this migration (src/api/sites.ts exports SITE_FILES_BUCKET).
--
-- Access model (mirrors the existing `site-photos` policies in
-- supabase/policies.sql): objects live under `<siteId>/...`, so the first
-- path segment scopes every operation to admins OR installers assigned to
-- that site (public.is_assigned_to_site). Both admin (FilesTab/Blueprints)
-- and mobile installers (BlueprintsTab uploads, ImageAnnotator attachments,
-- upsert:true re-uploads) write here, so INSERT/UPDATE/DELETE allow both.
--
-- NOTE: bucket visibility is left unchanged. getSiteFiles() currently renders
-- via getPublicUrl(), i.e. direct object downloads are link-addressable; these
-- policies govern the API surface (list/upload/update/delete). Moving to
-- signed URLs is a separate post-beta task.
-- Idempotent: DROP POLICY IF EXISTS before each CREATE.
-- ============================================================

-- SELECT (list/read via API): admin OR assigned to the site in the path.
DROP POLICY IF EXISTS "site_files: matyti failus" ON storage.objects;
CREATE POLICY "site_files: matyti failus" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'site_files' AND (
      public.is_admin() OR
      public.is_assigned_to_site(CAST(split_part(name, '/', 1) AS UUID))
    )
  );

-- INSERT: admin OR assigned installer (mobile blueprint/annotation uploads).
DROP POLICY IF EXISTS "site_files: įkelti failus" ON storage.objects;
CREATE POLICY "site_files: įkelti failus" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'site_files' AND (
      public.is_admin() OR
      public.is_assigned_to_site(CAST(split_part(name, '/', 1) AS UUID))
    )
  );

-- UPDATE: required because uploads use upsert:true (overwrite = UPDATE).
DROP POLICY IF EXISTS "site_files: atnaujinti failus" ON storage.objects;
CREATE POLICY "site_files: atnaujinti failus" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'site_files' AND (
      public.is_admin() OR
      public.is_assigned_to_site(CAST(split_part(name, '/', 1) AS UUID))
    )
  )
  WITH CHECK (
    bucket_id = 'site_files' AND (
      public.is_admin() OR
      public.is_assigned_to_site(CAST(split_part(name, '/', 1) AS UUID))
    )
  );

-- DELETE: admin OR assigned installer (annotation-attachment cleanup on mobile).
DROP POLICY IF EXISTS "site_files: trinti failus" ON storage.objects;
CREATE POLICY "site_files: trinti failus" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'site_files' AND (
      public.is_admin() OR
      public.is_assigned_to_site(CAST(split_part(name, '/', 1) AS UUID))
    )
  );

SELECT pg_notify('pgrst', 'reload schema');
