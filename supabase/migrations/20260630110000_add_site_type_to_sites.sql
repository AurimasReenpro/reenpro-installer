-- Add site type classification for checklist template selection.

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS site_type TEXT NOT NULL DEFAULT 'b2c';

ALTER TABLE public.sites
  DROP CONSTRAINT IF EXISTS sites_site_type_check;

ALTER TABLE public.sites
  ADD CONSTRAINT sites_site_type_check
  CHECK (site_type IN ('b2c', 'b2b', 'service'));

CREATE INDEX IF NOT EXISTS idx_sites_site_type
  ON public.sites(site_type);

INSERT INTO public.checklist_categories (name)
SELECT v.name
FROM (VALUES ('B2C'), ('B2B'), ('Servisas')) AS v(name)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.checklist_categories c
  WHERE lower(c.name) = lower(v.name)
);

SELECT pg_notify('pgrst', 'reload schema');
