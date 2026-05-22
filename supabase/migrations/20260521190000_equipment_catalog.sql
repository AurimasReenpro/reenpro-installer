-- Phase 7B: Equipment Catalog table
-- Run this manually in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.equipment_catalog (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category       text NOT NULL,
  brand          text NOT NULL DEFAULT '',
  model          text NOT NULL,
  specifications text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_catalog ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read catalog items
CREATE POLICY "catalog_read_all"
  ON public.equipment_catalog
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admin users can insert/update/delete
CREATE POLICY "catalog_write_admin"
  ON public.equipment_catalog
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
