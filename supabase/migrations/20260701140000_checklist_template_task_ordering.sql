-- Add safe ordering and active-state support for checklist template tasks.
--
-- These fields are template configuration only. They do not represent planned
-- time or tracked work duration.

ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_checklist_templates_category_sort_order
  ON public.checklist_templates(category, sort_order);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_b2b_work_category_sort_order
  ON public.checklist_templates(b2b_work_category_id, sort_order);

SELECT pg_notify('pgrst', 'reload schema');
