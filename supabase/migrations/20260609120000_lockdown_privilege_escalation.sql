-- ============================================================
-- Migration: Lock down privilege-escalation holes
-- Closes the TODOs documented in supabase/policies.sql:
--   1. user_profiles — non-admins cannot change role / hourly_rate / team_id
--   2. sites        — installers may only change status / actual_start / actual_end
--   3. teams        — enable RLS (read all authenticated, write admin only)
--   4. is_admin() / is_assigned_to_site() — SET search_path = public hardening
--   5. QC engine    — tighten site_checklists / site_checklist_items SELECT
--                     (was USING (true)) to admin OR assigned-to-parent-site
-- Idempotent: safe to re-run (CREATE OR REPLACE / DROP ... IF EXISTS).
-- ============================================================

-- ── 4. Helper functions: recreate with SET search_path = public ───────────────
-- SECURITY DEFINER hardening. Bodies are byte-identical to supabase/policies.sql;
-- only the `SET search_path = public` clause is added.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_to_site(site_id_param UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.site_assignments
    WHERE site_id = site_id_param AND installer_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.sites s
    JOIN public.user_profiles up ON s.team_id = up.team_id
    WHERE s.id = site_id_param AND up.id = auth.uid() AND s.team_id IS NOT NULL
  );
END;
$$;

-- ── 1. user_profiles: block privilege escalation by non-admins ────────────────
-- Closes the TODO at supabase/policies.sql:207 — the self-UPDATE policy
-- (id = auth.uid()) cannot restrict which columns change. A non-admin may still
-- edit their own name/phone, but NOT their role, hourly_rate or team_id. Admins
-- bypass entirely.
CREATE OR REPLACE FUNCTION public.guard_user_profile_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.role        IS DISTINCT FROM OLD.role
  OR NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate
  OR NEW.team_id     IS DISTINCT FROM OLD.team_id THEN
    RAISE EXCEPTION 'Tik administratorius gali keisti role, hourly_rate ar team_id laukus.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_profile_columns ON public.user_profiles;
CREATE TRIGGER trg_guard_user_profile_columns
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_profile_columns();

-- ── 2. sites: installers may only change status / actual_start / actual_end ────
-- Closes the column-level TODO at supabase/policies.sql:72. For a non-admin,
-- every column EXCEPT the three allowed must be unchanged. Implemented as a
-- jsonb diff (strip the allowed keys from OLD and NEW, then require the rest to
-- be identical) so it stays correct as new columns are added to `sites`.
-- The time-tracking RPCs (start_work / pause_work / complete_site_work) only
-- touch these three columns, so installer time tracking is unaffected; all admin
-- edits bypass via is_admin().
CREATE OR REPLACE FUNCTION public.guard_sites_installer_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(OLD) - 'status' - 'actual_start' - 'actual_end')
     IS DISTINCT FROM
     (to_jsonb(NEW) - 'status' - 'actual_start' - 'actual_end') THEN
    RAISE EXCEPTION 'Montuotojai gali keisti tik status, actual_start ir actual_end laukus.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sites_installer_columns ON public.sites;
CREATE TRIGGER trg_guard_sites_installer_columns
  BEFORE UPDATE ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.guard_sites_installer_columns();

-- ── 3. teams: enable RLS (read all authenticated, write admin only) ───────────
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Visi mato komandas" ON public.teams;
CREATE POLICY "Visi mato komandas" ON public.teams
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Valdyti komandas tik adminams" ON public.teams;
CREATE POLICY "Valdyti komandas tik adminams" ON public.teams
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 5. Tighten QC-engine SELECT policies (were USING (true)) ──────────────────
-- From 20260524200000_solargrade_qc_engine.sql. Restrict reads to admins or the
-- installer assigned to the parent site. Policy names are kept identical so this
-- cleanly supersedes the originals.
DROP POLICY IF EXISTS "Authenticated gali matyti site_checklists" ON public.site_checklists;
CREATE POLICY "Authenticated gali matyti site_checklists"
  ON public.site_checklists
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_assigned_to_site(site_id)
  );

DROP POLICY IF EXISTS "Authenticated gali matyti site_checklist_items" ON public.site_checklist_items;
CREATE POLICY "Authenticated gali matyti site_checklist_items"
  ON public.site_checklist_items
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.site_checklists sc
      WHERE sc.id = site_checklist_items.site_checklist_id
        AND public.is_assigned_to_site(sc.site_id)
    )
  );

-- ============================================================
-- END.
-- ============================================================
