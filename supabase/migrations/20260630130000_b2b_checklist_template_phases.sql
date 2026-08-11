-- Add B2B checklist template work phases and photo requirements.
--
-- Current checklist_templates rows are the template items themselves, grouped by
-- category (B2C/B2B/Servisas). There is no separate template header table, so
-- template work phases are scoped by category instead of by a template_id.

CREATE TABLE IF NOT EXISTS public.checklist_template_work_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT checklist_template_work_phases_category_code_key UNIQUE (category, code)
);

ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS template_work_phase_id UUID REFERENCES public.checklist_template_work_phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_photo_count INT NOT NULL DEFAULT 0;

ALTER TABLE public.checklist_templates
  ALTER COLUMN requires_photo SET DEFAULT false;

UPDATE public.checklist_templates
SET requires_photo = false
WHERE requires_photo IS NULL;

ALTER TABLE public.checklist_templates
  ALTER COLUMN requires_photo SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'checklist_templates_min_photo_count_nonnegative'
  ) THEN
    ALTER TABLE public.checklist_templates
      ADD CONSTRAINT checklist_templates_min_photo_count_nonnegative
      CHECK (min_photo_count >= 0);
  END IF;
END $$;

UPDATE public.checklist_templates
SET min_photo_count = 1
WHERE requires_photo = true
  AND min_photo_count = 0;

ALTER TABLE public.site_checklist_items
  ADD COLUMN IF NOT EXISTS work_phase_id UUID REFERENCES public.site_work_phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requires_photo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_photo_count INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'site_checklist_items_min_photo_count_nonnegative'
  ) THEN
    ALTER TABLE public.site_checklist_items
      ADD CONSTRAINT site_checklist_items_min_photo_count_nonnegative
      CHECK (min_photo_count >= 0);
  END IF;
END $$;

UPDATE public.site_checklist_items
SET requires_photo = COALESCE(is_required, false),
    min_photo_count = CASE WHEN COALESCE(is_required, false) THEN 1 ELSE 0 END
WHERE requires_photo = false
  AND min_photo_count = 0;

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS site_checklist_item_id UUID REFERENCES public.site_checklist_items(id) ON DELETE SET NULL;

UPDATE public.photos p
SET site_checklist_item_id = sci.id
FROM public.site_checklist_items sci
WHERE p.site_checklist_item_id IS NULL
  AND p.storage_path LIKE '%' || sci.id::TEXT || '/%';

CREATE INDEX IF NOT EXISTS idx_checklist_template_work_phases_category
  ON public.checklist_template_work_phases(category);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_template_work_phase_id
  ON public.checklist_templates(template_work_phase_id);

CREATE INDEX IF NOT EXISTS idx_site_checklist_items_work_phase_id
  ON public.site_checklist_items(work_phase_id);

CREATE INDEX IF NOT EXISTS idx_site_checklist_items_photo_requirement
  ON public.site_checklist_items(requires_photo, min_photo_count);

CREATE INDEX IF NOT EXISTS idx_photos_site_checklist_item_id
  ON public.photos(site_checklist_item_id);

INSERT INTO public.checklist_template_work_phases (category, code, label, sort_order)
VALUES
  ('B2B', 'dc_montavimas', 'DC montavimas', 10),
  ('B2B', 'balasto_dejimas', 'Balasto dėjimas', 20),
  ('B2B', 'loveliu_montavimas', 'Lovelių montavimas', 30),
  ('B2B', 'moduliu_montavimas', 'Modulių montavimas', 40),
  ('B2B', 'inverteriai', 'Inverteriai', 50),
  ('B2B', 'paleidimas_patikra', 'Paleidimas / patikra', 60)
ON CONFLICT (category, code) DO NOTHING;

ALTER TABLE public.checklist_template_work_phases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view checklist template work phases" ON public.checklist_template_work_phases;
CREATE POLICY "Authenticated can view checklist template work phases"
  ON public.checklist_template_work_phases
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert checklist template work phases" ON public.checklist_template_work_phases;
CREATE POLICY "Admins can insert checklist template work phases"
  ON public.checklist_template_work_phases
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update checklist template work phases" ON public.checklist_template_work_phases;
CREATE POLICY "Admins can update checklist template work phases"
  ON public.checklist_template_work_phases
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete checklist template work phases" ON public.checklist_template_work_phases;
CREATE POLICY "Admins can delete checklist template work phases"
  ON public.checklist_template_work_phases
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.checklist_template_work_phases
  TO authenticated;

CREATE OR REPLACE VIEW public.site_checklist_phase_status_v
WITH (security_invoker = true)
AS
WITH item_photo_counts AS (
  SELECT
    sci.id AS item_id,
    COUNT(DISTINCT p.id)::INT AS photo_count
  FROM public.site_checklist_items sci
  LEFT JOIN public.photos p
    ON p.site_checklist_item_id = sci.id
    OR p.storage_path LIKE '%' || sci.id::TEXT || '/%'
  GROUP BY sci.id
)
SELECT
  s.id AS site_id,
  s.site_type,
  s.kwp,
  sci.work_phase_id,
  swp.code AS work_phase_code,
  COALESCE(swp.label, 'Be darbo') AS work_phase_label,
  COALESCE(swp.sort_order, 2147483647) AS work_phase_sort_order,
  COUNT(sci.id)::INT AS checklist_item_count,
  COUNT(sci.id) FILTER (WHERE sci.status = 'pass')::INT AS completed_item_count,
  COUNT(sci.id) FILTER (
    WHERE sci.status <> 'n_a'
      AND sci.requires_photo = true
      AND COALESCE(ipc.photo_count, 0) < GREATEST(1, sci.min_photo_count)
  )::INT AS missing_photo_item_count,
  COALESCE(wpt.total_hours, 0) AS total_logged_hours,
  CASE
    WHEN COALESCE(s.kwp, 0) > 0 THEN COALESCE(wpt.total_hours, 0) / s.kwp
    ELSE NULL
  END AS logged_hours_per_kwp
FROM public.sites s
JOIN public.site_checklists sc ON sc.site_id = s.id
JOIN public.site_checklist_items sci ON sci.site_checklist_id = sc.id
LEFT JOIN public.site_work_phases swp ON swp.id = sci.work_phase_id
LEFT JOIN item_photo_counts ipc ON ipc.item_id = sci.id
LEFT JOIN public.site_work_phase_time_v wpt
  ON wpt.site_id = s.id
 AND (
   (wpt.work_phase_id IS NULL AND sci.work_phase_id IS NULL)
   OR wpt.work_phase_id = sci.work_phase_id
 )
GROUP BY
  s.id,
  s.site_type,
  s.kwp,
  sci.work_phase_id,
  swp.code,
  swp.label,
  swp.sort_order,
  wpt.total_hours;

GRANT SELECT ON public.site_checklist_phase_status_v TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
