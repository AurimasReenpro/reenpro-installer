-- ============================================================
-- Migration: company_settings table
-- Single-row company profile / branding / logistics config
-- ============================================================

CREATE TABLE IF NOT EXISTS public.company_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name    TEXT,
  company_code    TEXT,
  vat_code        TEXT,
  iban            TEXT,
  address         TEXT,
  phone           TEXT,
  email           TEXT,
  logo_url        TEXT,           -- URL to logo in Supabase Storage bucket "branding"
  primary_color   TEXT DEFAULT '#490891',
  base_lat        NUMERIC(10, 6), -- Company warehouse / depot latitude
  base_lng        NUMERIC(10, 6), -- Company warehouse / depot longitude
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Automatically keep updated_at current on every UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed one empty row so Settings page always has a row to UPDATE
INSERT INTO public.company_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can READ (needed for logo, colors, map coords)
CREATE POLICY "Visi authenticated gali matyti įmonės nustatymus"
  ON public.company_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can INSERT / UPDATE / DELETE
CREATE POLICY "Tik adminai gali keisti įmonės nustatymus"
  ON public.company_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- Storage bucket: branding  (run in Supabase Dashboard → Storage)
-- ============================================================
-- NOTE: Run the SQL below inside Supabase Dashboard > SQL Editor
-- (storage schema operations are not supported via psql migrations):
--
--   INSERT INTO storage.buckets (id, name, public)
--   VALUES ('branding', 'branding', true)
--   ON CONFLICT (id) DO NOTHING;
--
--   -- Allow admins to upload to branding bucket
--   CREATE POLICY "Admin gali įkelti logotipą"
--     ON storage.objects FOR INSERT TO authenticated
--     WITH CHECK (bucket_id = 'branding' AND public.is_admin());
--
--   CREATE POLICY "Visi mato logotipą"
--     ON storage.objects FOR SELECT TO authenticated
--     USING (bucket_id = 'branding');
--
--   CREATE POLICY "Admin gali keisti logotipą"
--     ON storage.objects FOR UPDATE TO authenticated
--     USING (bucket_id = 'branding' AND public.is_admin());
--
--   CREATE POLICY "Admin gali trinti logotipą"
--     ON storage.objects FOR DELETE TO authenticated
--     USING (bucket_id = 'branding' AND public.is_admin());
