-- ============================================================
-- Run this in: Supabase Dashboard → SQL Editor
-- (storage schema is not accessible via psql migrations)
--
-- Purpose: Create the 'branding' public bucket and its RLS
--          policies so admins can upload/replace the logo.
-- ============================================================

-- 1. Create the public bucket (safe to re-run)
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Drop old policies if they exist (idempotent re-run safety)
DROP POLICY IF EXISTS "Admin gali įkelti logotipą"   ON storage.objects;
DROP POLICY IF EXISTS "Visi mato logotipą"            ON storage.objects;
DROP POLICY IF EXISTS "Admin gali keisti logotipą"   ON storage.objects;
DROP POLICY IF EXISTS "Admin gali trinti logotipą"   ON storage.objects;

-- 3. Public read — anyone (even anon) can see the logo URL
CREATE POLICY "Visi mato logotipą"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'branding');

-- 4. Admins can upload (INSERT)
CREATE POLICY "Admin gali įkelti logotipą"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'branding' AND public.is_admin());

-- 5. Admins can overwrite (UPDATE) — needed for upsert
CREATE POLICY "Admin gali keisti logotipą"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING  (bucket_id = 'branding' AND public.is_admin())
  WITH CHECK (bucket_id = 'branding' AND public.is_admin());

-- 6. Admins can delete
CREATE POLICY "Admin gali trinti logotipą"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'branding' AND public.is_admin());
