-- Link B2B checklist template tasks to the reusable B2B work category catalog.
--
-- Existing checklist template rows and checklist_template_work_phases are kept
-- intact. Rows without b2b_work_category_id remain valid and render in the
-- admin UI as unassigned B2B tasks.

ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS b2b_work_category_id UUID
    REFERENCES public.b2b_work_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_templates_b2b_work_category_id
  ON public.checklist_templates(b2b_work_category_id);

SELECT pg_notify('pgrst', 'reload schema');
