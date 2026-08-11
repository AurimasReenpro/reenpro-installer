-- ============================================================
-- Migration: link site_work_phases to b2b_work_categories
--
-- B2B site creation now creates phases ONLY for the admin-selected
-- b2b_work_categories. Each created phase keeps a stable link to its source
-- category so dedupe, checklist mapping and future analytics don't have to
-- guess by label. No new join table: site_work_phases IS the per-site
-- materialization of selected categories.
--
-- Existing phases (b2b_work_category_id NULL) remain fully valid; nothing is
-- deleted or rewritten destructively. A best-effort backlink matches legacy
-- rows to categories by identical code — safe because b2b_work_categories.code
-- is UNIQUE and the update only fills NULLs.
-- ============================================================

ALTER TABLE public.site_work_phases
  ADD COLUMN IF NOT EXISTS b2b_work_category_id UUID
    REFERENCES public.b2b_work_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_site_work_phases_site_category
  ON public.site_work_phases(site_id, b2b_work_category_id);

-- One ACTIVE phase per (site, category). Partial: NULL-category legacy rows
-- and deactivated phases are exempt, so existing data cannot block creation.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_site_work_phases_active_category
  ON public.site_work_phases(site_id, b2b_work_category_id)
  WHERE b2b_work_category_id IS NOT NULL AND is_active;

-- Best-effort backlink: legacy phase rows whose code equals a category code.
-- Guarded against creating duplicates under the new unique index: only the
-- oldest active row per (site, code) gets linked.
UPDATE public.site_work_phases swp
SET b2b_work_category_id = bwc.id
FROM public.b2b_work_categories bwc
WHERE swp.b2b_work_category_id IS NULL
  AND swp.code = bwc.code
  AND swp.id = (
    SELECT swp2.id FROM public.site_work_phases swp2
    WHERE swp2.site_id = swp.site_id AND swp2.code = swp.code
    ORDER BY swp2.created_at ASC LIMIT 1
  );

SELECT pg_notify('pgrst', 'reload schema');
