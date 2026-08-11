-- Add reusable B2B work category catalog.
--
-- This intentionally does not modify existing site_work_phases or
-- checklist_template_work_phases. The catalog is a reusable admin-managed list
-- for future site creation/category selection work.

CREATE TABLE IF NOT EXISTS public.b2b_work_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_work_categories_is_active
  ON public.b2b_work_categories(is_active);

CREATE INDEX IF NOT EXISTS idx_b2b_work_categories_sort_order
  ON public.b2b_work_categories(sort_order);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_b2b_work_categories_updated_at ON public.b2b_work_categories;
CREATE TRIGGER trg_b2b_work_categories_updated_at
  BEFORE UPDATE ON public.b2b_work_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.b2b_work_categories (code, label, sort_order)
VALUES
  ('dc_install', 'DC montavimas', 10),
  ('ballast', 'Balasto dėjimas', 20),
  ('cable_trays', 'Lovelių montavimas', 30),
  ('modules', 'Modulių montavimas', 40),
  ('inverters', 'Inverteriai', 50),
  ('commissioning', 'Paleidimas / patikra', 60)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.b2b_work_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view active B2B work categories" ON public.b2b_work_categories;
CREATE POLICY "Authenticated can view active B2B work categories"
  ON public.b2b_work_categories
  FOR SELECT
  TO authenticated
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins can insert B2B work categories" ON public.b2b_work_categories;
CREATE POLICY "Admins can insert B2B work categories"
  ON public.b2b_work_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update B2B work categories" ON public.b2b_work_categories;
CREATE POLICY "Admins can update B2B work categories"
  ON public.b2b_work_categories
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete B2B work categories" ON public.b2b_work_categories;
CREATE POLICY "Admins can delete B2B work categories"
  ON public.b2b_work_categories
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.b2b_work_categories
  TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
