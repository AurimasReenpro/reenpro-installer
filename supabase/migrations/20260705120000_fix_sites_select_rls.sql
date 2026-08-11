-- ============================================================
-- Migration: fix public.sites SELECT RLS (assigned-only for installers)
--
-- ROOT CAUSE of smoke-test failure "[FAIL] 4a installer CAN read unassigned
-- site": the sites policies were only ever created via the dashboard /
-- policies.sql snapshot — NO repo migration defines them. The live DB carries
-- a legacy broad SELECT (or FOR ALL) policy under a name the repo never knew,
-- and Postgres permissive policies OR together, so it out-granted the strict
-- "is_admin() OR is_assigned_to_site(id)" rule. public.is_assigned_to_site()
-- itself is strict (direct site_assignments row OR same non-null team) and is
-- NOT changed here.
--
-- FIX: dynamically drop every SELECT and FOR ALL policy on public.sites
-- (FOR ALL policies also grant SELECT, so they must be swept and recreated),
-- then recreate exactly the canonical set from supabase/policies.sql:
--   • SELECT  — admin OR assigned installer;
--   • FOR ALL — admin only (create/delete + admin's own read/write path).
-- The installer UPDATE policy ("Leisti montuotojams atnaujinti tik savo
-- objektus", cmd = UPDATE) is intentionally left untouched — it is not part
-- of this bug and the workflow-column guard trigger protects its scope.
-- ============================================================

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- Sweep all SELECT-granting policies, whatever their names (dashboard-era
-- names are unknowable from the repo). Each drop is logged.
DO $drop_select$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sites'
      AND cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.sites', pol.policyname);
    RAISE NOTICE 'Dropped policy on sites: % (cmd=%)', pol.policyname, pol.cmd;
  END LOOP;
END
$drop_select$;

-- Canonical SELECT: admins see everything; installers only assigned sites
-- (direct site_assignments row OR same non-null team via is_assigned_to_site).
CREATE POLICY "Leisti matyti objektus adminams ir priskirtiems montuotojams" ON public.sites
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR public.is_assigned_to_site(id));

-- Canonical admin management policy (recreated because the sweep above also
-- removes FOR ALL policies; byte-compatible with policies.sql).
CREATE POLICY "Leisti kurti ir trinti objektus tik adminams" ON public.sites
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

SELECT pg_notify('pgrst', 'reload schema');

-- ════════════════════════════════════════════════════════════
-- VERIFICATION (manual, dev/staging)
-- ────────────────────────────────────────────────────────────
-- (a) Policy inventory — expect exactly these three rows:
--   select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='sites' order by 1;
--   -- "Leisti kurti ir trinti objektus tik adminams"                 | ALL
--   -- "Leisti matyti objektus adminams ir priskirtiems montuotojams" | SELECT
--   -- "Leisti montuotojams atnaujinti tik savo objektus"             | UPDATE
--
-- (b) Re-run supabase/tests/rls_smoke_test.sql — expect:
--   [PASS] 3a installer reads assigned site
--   [PASS] 4a installer cannot read unassigned site
--   [PASS] 1a admin reads sites (…)
--
-- (c) App checks: admin "Visi objektai" list unchanged; installer mobile
--   sees only assigned/team sites; site details open for assigned installers.
-- ════════════════════════════════════════════════════════════
