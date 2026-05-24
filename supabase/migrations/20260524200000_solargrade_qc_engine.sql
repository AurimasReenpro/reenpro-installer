-- ============================================================
-- Migration: SolarGrade Quality Control Engine (Phase 8A)
-- Converts site_checklists to a session model and adds
-- site_checklist_items with Pass / Fail / N_A status logic.
-- ============================================================

-- ── 1. Enums ─────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.site_checklist_status AS ENUM ('pending', 'in_progress', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.site_checklist_item_status AS ENUM ('pending', 'pass', 'fail', 'n_a');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Rework site_checklists → session table ─────────────────
-- Drop old policies first so we can drop columns cleanly
DROP POLICY IF EXISTS "Visi authenticated gali matyti checklists" ON public.site_checklists;
DROP POLICY IF EXISTS "Authenticated gali keisti checklists" ON public.site_checklists;
DROP POLICY IF EXISTS "Installers can view their site checklists" ON public.site_checklists;
DROP POLICY IF EXISTS "Admins can manage checklists" ON public.site_checklists;

-- Remove old flat-item columns and add session columns.
-- Use IF EXISTS / IF NOT EXISTS guards to make the migration idempotent.
ALTER TABLE public.site_checklists
  DROP COLUMN IF EXISTS phase,
  DROP COLUMN IF EXISTS task_name,
  DROP COLUMN IF EXISTS requires_photo,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS is_completed;

ALTER TABLE public.site_checklists
  ADD COLUMN IF NOT EXISTS template_id      UUID        REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status           public.site_checklist_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS completed_at     TIMESTAMPTZ;

-- Ensure created_at exists (it did before, but guard anyway)
ALTER TABLE public.site_checklists
  ALTER COLUMN created_at SET DEFAULT NOW();

-- ── 3. New table: site_checklist_items ───────────────────────
CREATE TABLE IF NOT EXISTS public.site_checklist_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_checklist_id     UUID NOT NULL REFERENCES public.site_checklists(id) ON DELETE CASCADE,
  -- Snapshot of the template item at time of site creation
  question_text         TEXT NOT NULL,
  category              TEXT,
  phase                 TEXT,
  is_required           BOOLEAN NOT NULL DEFAULT true,
  -- SolarGrade execution fields (filled by installer on mobile)
  status                public.site_checklist_item_status NOT NULL DEFAULT 'pending',
  photo_url             TEXT,
  comment               TEXT,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.set_checklist_item_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_checklist_items_updated_at ON public.site_checklist_items;
CREATE TRIGGER site_checklist_items_updated_at
  BEFORE UPDATE ON public.site_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_checklist_item_updated_at();

-- ── 4. Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_site_checklists_site_id
  ON public.site_checklists(site_id);

CREATE INDEX IF NOT EXISTS idx_site_checklist_items_session_id
  ON public.site_checklist_items(site_checklist_id);

CREATE INDEX IF NOT EXISTS idx_site_checklist_items_status
  ON public.site_checklist_items(status);

-- ── 5. RLS – site_checklists (session table) ─────────────────
ALTER TABLE public.site_checklists ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all sessions (admin dashboard needs this)
CREATE POLICY "Authenticated gali matyti site_checklists"
  ON public.site_checklists
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert / delete sessions
CREATE POLICY "Adminai gali kurti site_checklists"
  ON public.site_checklists
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Adminai gali trinti site_checklists"
  ON public.site_checklists
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Both admins and assigned installers can update session status
CREATE POLICY "Authenticated gali atnaujinti site_checklists"
  ON public.site_checklists
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_assigned_to_site(site_id)
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_assigned_to_site(site_id)
  );

-- ── 6. RLS – site_checklist_items ────────────────────────────
ALTER TABLE public.site_checklist_items ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (installers need to fetch their items)
CREATE POLICY "Authenticated gali matyti site_checklist_items"
  ON public.site_checklist_items
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert: admins only (items created during site creation)
CREATE POLICY "Adminai gali kurti site_checklist_items"
  ON public.site_checklist_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Update: admins OR installers assigned to the parent site
CREATE POLICY "Assigned installers gali atnaujinti items"
  ON public.site_checklist_items
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.site_checklists sc
      WHERE sc.id = site_checklist_items.site_checklist_id
        AND public.is_assigned_to_site(sc.site_id)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.site_checklists sc
      WHERE sc.id = site_checklist_items.site_checklist_id
        AND public.is_assigned_to_site(sc.site_id)
    )
  );

-- ── 7. Grant API access ───────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.site_checklists
  TO authenticated;

GRANT SELECT, INSERT, UPDATE
  ON public.site_checklist_items
  TO authenticated;
