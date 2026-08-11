-- ============================================================================
-- RLS SMOKE TEST — beta readiness
-- ============================================================================
-- WHAT: verifies the core Row-Level-Security boundaries by impersonating a
--       real admin and a real installer via request.jwt.claims, the same way
--       PostgREST does. Every check RAISEs NOTICE '[PASS] …' or
--       EXCEPTION '[FAIL] …' (a FAIL aborts the whole transaction — nothing
--       is left behind either way).
--
-- HOW TO RUN:
--   • Run on DEV/STAGING first. Do NOT run destructive tests on production —
--     this script itself is rollback-safe (single BEGIN … ROLLBACK; the only
--     "writes" are forbidden mutations that must fail or match 0 rows), but
--     treat any FAIL on production as an incident, not a test artifact.
--   • Paste the WHOLE file into the Supabase SQL Editor and run once, or:
--       psql "$DATABASE_URL" -f supabase/tests/rls_smoke_test.sql
--   • Read the Messages/NOTICE output: expect only [PASS] and [SKIP] lines.
--   • Sections that lack fixture data (no installer, no assigned site, …)
--     RAISE NOTICE '[SKIP] …' and continue — they do not fail.
--
-- WHAT IS *NOT* COVERED HERE (see section 6 comments):
--   storage.objects policies need real bucket objects and are exercised
--   from the app / storage API, not from SQL.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 0. FIXTURE DISCOVERY (runs as the privileged editor role, before any
--    impersonation). IDs are parked in transaction-local GUCs so they stay
--    readable after SET LOCAL ROLE authenticated.
-- ────────────────────────────────────────────────────────────────────────────
DO $fixtures$
DECLARE
  v_admin      UUID;
  v_installer  UUID;
  v_other_inst UUID;
  v_assigned   UUID;
  v_unassigned UUID;
BEGIN
  SELECT id INTO v_admin
  FROM public.user_profiles WHERE role = 'admin' ORDER BY id LIMIT 1;

  SELECT id INTO v_installer
  FROM public.user_profiles
  WHERE role <> 'admin' AND COALESCE(employment_status, 'active') = 'active'
  ORDER BY id LIMIT 1;

  SELECT id INTO v_other_inst
  FROM public.user_profiles
  WHERE role <> 'admin' AND id IS DISTINCT FROM v_installer
  ORDER BY id LIMIT 1;

  -- A site the installer can reach: direct assignment OR same team.
  SELECT s.id INTO v_assigned
  FROM public.sites s
  WHERE EXISTS (SELECT 1 FROM public.site_assignments sa
                WHERE sa.site_id = s.id AND sa.installer_id = v_installer)
     OR (s.team_id IS NOT NULL AND s.team_id = (
           SELECT up.team_id FROM public.user_profiles up WHERE up.id = v_installer))
  ORDER BY s.created_at DESC LIMIT 1;

  -- A site the installer can NOT reach (no assignment, different/absent team).
  SELECT s.id INTO v_unassigned
  FROM public.sites s
  WHERE NOT EXISTS (SELECT 1 FROM public.site_assignments sa
                    WHERE sa.site_id = s.id AND sa.installer_id = v_installer)
    AND (s.team_id IS NULL OR s.team_id IS DISTINCT FROM (
           SELECT up.team_id FROM public.user_profiles up WHERE up.id = v_installer))
  ORDER BY s.created_at DESC LIMIT 1;

  PERFORM set_config('rls_test.admin_id',      COALESCE(v_admin::text, ''),      true);
  PERFORM set_config('rls_test.installer_id',  COALESCE(v_installer::text, ''),  true);
  PERFORM set_config('rls_test.other_inst_id', COALESCE(v_other_inst::text, ''), true);
  PERFORM set_config('rls_test.assigned_site', COALESCE(v_assigned::text, ''),   true);
  PERFORM set_config('rls_test.unassigned_site', COALESCE(v_unassigned::text, ''), true);

  RAISE NOTICE '[FIXTURES] admin=% installer=% (email=%, team=%) assigned_site=% unassigned_site=% (team=%)',
    COALESCE(v_admin::text, '(none)'), COALESCE(v_installer::text, '(none)'),
    COALESCE((SELECT email FROM public.user_profiles WHERE id = v_installer), '(none)'),
    COALESCE((SELECT team_id::text FROM public.user_profiles WHERE id = v_installer), '(none)'),
    COALESCE(v_assigned::text, '(none)'), COALESCE(v_unassigned::text, '(none)'),
    COALESCE((SELECT team_id::text FROM public.sites WHERE id = v_unassigned), '(none)');

  IF v_admin IS NULL THEN
    RAISE EXCEPTION '[FAIL] No admin user in user_profiles — cannot smoke-test.';
  END IF;
END
$fixtures$;

-- Helper: impersonate a user id stored in a GUC (PostgREST-style claims).
CREATE OR REPLACE FUNCTION pg_temp.impersonate(p_guc TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', current_setting(p_guc, true), 'role', 'authenticated')::text,
    true);
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ADMIN IDENTITY — must see everything the console needs
-- ────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.impersonate('rls_test.admin_id');

DO $admin_reads$
DECLARE n BIGINT;
BEGIN
  SELECT count(*) INTO n FROM public.sites;
  RAISE NOTICE '[PASS] 1a admin reads sites (% rows)', n;
  SELECT count(*) INTO n FROM public.user_profiles;
  RAISE NOTICE '[PASS] 1b admin reads user_profiles (% rows)', n;
  SELECT count(*) INTO n FROM public.time_entries;
  RAISE NOTICE '[PASS] 1c admin reads time_entries (% rows)', n;
  SELECT count(*) INTO n FROM public.site_audit_logs;
  RAISE NOTICE '[PASS] 1d admin reads site_audit_logs (% rows)', n;
  SELECT count(*) INTO n FROM public.admin_activity_view;
  RAISE NOTICE '[PASS] 1e admin reads admin_activity_view (% rows)', n;

  -- Payroll surface (all admin-only tables must be readable BY the admin).
  SELECT count(*) INTO n FROM public.payroll_rate_cards;
  SELECT count(*) INTO n FROM public.payroll_rate_rules;
  SELECT count(*) INTO n FROM public.payroll_periods;
  SELECT count(*) INTO n FROM public.payroll_site_snapshots;
  SELECT count(*) INTO n FROM public.payroll_site_rule_overrides;
  SELECT count(*) INTO n FROM public.payroll_site_rate_card_overrides;
  SELECT count(*) INTO n FROM public.earnings_entries;
  RAISE NOTICE '[PASS] 1f admin reads all payroll tables';

  -- Time-review columns (added by 20260706120000). Guarded: skip on older DBs.
  BEGIN
    SELECT count(*) INTO n FROM public.time_entries WHERE needs_review;
    RAISE NOTICE '[PASS] 1g admin reads needs_review time entries (% flagged)', n;
  EXCEPTION WHEN undefined_column THEN
    RAISE NOTICE '[SKIP] 1g needs_review column not deployed yet';
  END;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION '[FAIL] section 1: admin was denied a read it must have: %', SQLERRM;
END
$admin_reads$;

RESET ROLE;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. INSTALLER IDENTITY — payroll invisible, profile fields locked
-- ────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.impersonate('rls_test.installer_id');

DO $installer_payroll$
DECLARE n BIGINT;
BEGIN
  IF current_setting('rls_test.installer_id', true) = '' THEN
    RAISE NOTICE '[SKIP] section 2: no active non-admin installer found.'; RETURN;
  END IF;

  -- 2a. Payroll tables: RLS must filter every row (0 visible) or deny outright.
  BEGIN
    SELECT (SELECT count(*) FROM public.payroll_rate_cards)
         + (SELECT count(*) FROM public.payroll_rate_rules)
         + (SELECT count(*) FROM public.payroll_periods)
         + (SELECT count(*) FROM public.payroll_site_snapshots)
         + (SELECT count(*) FROM public.payroll_site_rule_overrides)
         + (SELECT count(*) FROM public.payroll_site_rate_card_overrides)
         + (SELECT count(*) FROM public.earnings_entries)
    INTO n;
    IF n = 0 THEN RAISE NOTICE '[PASS] 2a installer sees 0 payroll rows';
    ELSE RAISE EXCEPTION '[FAIL] 2a installer can see % payroll rows', n;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[PASS] 2a installer denied payroll tables (permission)';
  END;

  -- 2b. site_audit_logs: admin-only SELECT → installer sees 0 rows.
  SELECT count(*) INTO n FROM public.site_audit_logs;
  IF n = 0 THEN RAISE NOTICE '[PASS] 2b installer sees 0 audit-log rows';
  ELSE RAISE EXCEPTION '[FAIL] 2b installer can read % audit-log rows', n;
  END IF;

  -- 2c. user_profiles read: policy "Visi mato profilius" INTENTIONALLY allows
  -- all authenticated users to read profiles (name dropdowns). Documented,
  -- not a failure — the enforced boundary is the field guard below.
  SELECT count(*) INTO n FROM public.user_profiles;
  RAISE NOTICE '[INFO] 2c installer reads % user_profiles rows (by design: open SELECT policy)', n;
END
$installer_payroll$;

-- 2d–2h. Protected profile fields. Two layers must both hold:
--   • other rows: UPDATE matches 0 rows (RLS USING id = auth.uid());
--   • own row: guard trigger RAISEs on role/hourly_rate/team_id/work_role/
--     employment_status changes.
DO $installer_profile_guard$
DECLARE
  v_me   UUID := NULLIF(current_setting('rls_test.installer_id', true), '')::uuid;
  v_them UUID := NULLIF(current_setting('rls_test.other_inst_id', true), '')::uuid;
  n INT;
BEGIN
  IF v_me IS NULL THEN
    RAISE NOTICE '[SKIP] 2d-2h: no installer fixture.'; RETURN;
  END IF;

  -- Someone else's row → RLS must match 0 rows (silent no-op).
  IF v_them IS NOT NULL THEN
    UPDATE public.user_profiles SET full_name = full_name WHERE id = v_them;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN RAISE NOTICE '[PASS] 2d installer cannot update another profile (0 rows)';
    ELSE RAISE EXCEPTION '[FAIL] 2d installer updated another user''s profile!';
    END IF;
  ELSE
    RAISE NOTICE '[SKIP] 2d: no second non-admin user.';
  END IF;

  -- Own row, protected fields → the guard trigger must RAISE. Each attempt is
  -- its own BEGIN/EXCEPTION block (plpgsql savepoint), so nothing persists.
  BEGIN
    UPDATE public.user_profiles SET role = 'admin' WHERE id = v_me;
    RAISE EXCEPTION '[FAIL] 2e installer changed own role!';
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
    IF SQLERRM LIKE '[FAIL]%' THEN RAISE; END IF;
    RAISE NOTICE '[PASS] 2e role change blocked (%)', SQLERRM;
  END;
  BEGIN
    UPDATE public.user_profiles SET hourly_rate = 999 WHERE id = v_me;
    RAISE EXCEPTION '[FAIL] 2f installer changed own hourly_rate!';
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
    IF SQLERRM LIKE '[FAIL]%' THEN RAISE; END IF;
    RAISE NOTICE '[PASS] 2f hourly_rate change blocked';
  END;
  BEGIN
    -- Flip team_id to a genuinely different value so the guard's
    -- IS DISTINCT FROM comparison fires (NULL if currently set, else any team).
    UPDATE public.user_profiles
    SET team_id = CASE WHEN team_id IS NULL
                       THEN (SELECT id FROM public.teams LIMIT 1)
                       ELSE NULL END
    WHERE id = v_me;
    RAISE EXCEPTION '[FAIL] 2g installer changed own team_id!';
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
    IF SQLERRM LIKE '[FAIL]%' THEN RAISE; END IF;
    RAISE NOTICE '[PASS] 2g team_id change blocked';
  END;
  BEGIN
    UPDATE public.user_profiles SET work_role = 'project_manager' WHERE id = v_me;
    RAISE EXCEPTION '[FAIL] 2h installer changed own work_role!';
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
    IF SQLERRM LIKE '[FAIL]%' THEN RAISE; END IF;
    RAISE NOTICE '[PASS] 2h work_role change blocked';
  END;
  BEGIN
    UPDATE public.user_profiles SET employment_status = 'archived' WHERE id = v_me;
    RAISE EXCEPTION '[FAIL] 2i installer changed own employment_status!';
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
    IF SQLERRM LIKE '[FAIL]%' THEN RAISE; END IF;
    RAISE NOTICE '[PASS] 2i employment_status change blocked';
  END;
END
$installer_profile_guard$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ASSIGNED SITE ACCESS — installer must see their own work surface
-- ────────────────────────────────────────────────────────────────────────────
DO $assigned_access$
DECLARE
  v_me   UUID := NULLIF(current_setting('rls_test.installer_id', true), '')::uuid;
  v_site UUID := NULLIF(current_setting('rls_test.assigned_site', true), '')::uuid;
  n BIGINT;
BEGIN
  IF v_me IS NULL OR v_site IS NULL THEN
    RAISE NOTICE '[SKIP] section 3: installer has no assigned site fixture.'; RETURN;
  END IF;

  SELECT count(*) INTO n FROM public.sites WHERE id = v_site;
  IF n = 1 THEN RAISE NOTICE '[PASS] 3a installer reads assigned site';
  ELSE RAISE EXCEPTION '[FAIL] 3a installer cannot read their assigned site %', v_site;
  END IF;

  -- Checklist items of the assigned site (mobile WorkTab needs these).
  SELECT count(*) INTO n
  FROM public.site_checklist_items i
  JOIN public.site_checklists c ON c.id = i.site_checklist_id
  WHERE c.site_id = v_site;
  RAISE NOTICE '[PASS] 3b installer reads assigned-site checklist items (% rows, may be 0 if none exist)', n;

  -- Work phases of the assigned site ("Kokį darbą atliekate?" picker).
  SELECT count(*) INTO n FROM public.site_work_phases WHERE site_id = v_site;
  RAISE NOTICE '[PASS] 3c installer reads assigned-site work phases (% rows)', n;

  -- Own time entries readable.
  SELECT count(*) INTO n FROM public.time_entries WHERE installer_id = v_me;
  RAISE NOTICE '[PASS] 3d installer reads own time_entries (% rows)', n;
END
$assigned_access$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. UNASSIGNED SITE ACCESS — must be invisible and immutable
-- ────────────────────────────────────────────────────────────────────────────
DO $unassigned_access$
DECLARE
  v_me   UUID := NULLIF(current_setting('rls_test.installer_id', true), '')::uuid;
  v_site UUID := NULLIF(current_setting('rls_test.unassigned_site', true), '')::uuid;
  v_helper BOOLEAN;
  v_my_team UUID;
  v_has_assignment BOOLEAN;
  n BIGINT;
BEGIN
  IF v_site IS NULL THEN
    RAISE NOTICE '[SKIP] section 4: no unassigned site fixture.'; RETURN;
  END IF;

  -- ── Diagnostics under installer impersonation ──
  -- is_assigned_to_site() is the single product-rule oracle (direct assignment
  -- OR same non-null team). If it says TRUE, the fixture is reachable by
  -- product rules and asserting invisibility would be wrong → SKIP loudly so
  -- fixture selection can be fixed. If it says FALSE and the row is still
  -- visible, a broad policy is leaking → FAIL.
  v_helper := public.is_assigned_to_site(v_site);
  SELECT team_id INTO v_my_team FROM public.user_profiles WHERE id = v_me;
  SELECT EXISTS (
    SELECT 1 FROM public.site_assignments
    WHERE site_id = v_site AND installer_id = v_me
  ) INTO v_has_assignment;
  RAISE NOTICE '[DIAG] 4: site=% helper_is_assigned=% my_team=% direct_assignment=%',
    v_site, v_helper, COALESCE(v_my_team::text, '(none)'), v_has_assignment;

  IF v_helper THEN
    RAISE NOTICE '[SKIP] section 4: fixture site % IS reachable by product rules (is_assigned_to_site=true) — fixture selection missed an access path; pick another site.', v_site;
    RETURN;
  END IF;

  SELECT count(*) INTO n FROM public.sites WHERE id = v_site;
  IF n = 0 THEN RAISE NOTICE '[PASS] 4a installer cannot read unassigned site';
  ELSE RAISE EXCEPTION '[FAIL] 4a installer CAN read unassigned site % despite is_assigned_to_site=false — a broad SELECT policy on public.sites is leaking', v_site;
  END IF;

  UPDATE public.sites SET notes = notes WHERE id = v_site;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE NOTICE '[PASS] 4b installer cannot mutate unassigned site (0 rows)';
  ELSE RAISE EXCEPTION '[FAIL] 4b installer mutated unassigned site!';
  END IF;

  SELECT count(*) INTO n
  FROM public.site_checklist_items i
  JOIN public.site_checklists c ON c.id = i.site_checklist_id
  WHERE c.site_id = v_site;
  IF n = 0 THEN RAISE NOTICE '[PASS] 4c installer sees 0 unassigned-site checklist items';
  ELSE RAISE EXCEPTION '[FAIL] 4c installer sees % checklist items of unassigned site', n;
  END IF;

  SELECT count(*) INTO n FROM public.photos WHERE site_id = v_site;
  IF n = 0 THEN RAISE NOTICE '[PASS] 4d installer sees 0 unassigned-site photos';
  ELSE RAISE EXCEPTION '[FAIL] 4d installer sees % photos of unassigned site', n;
  END IF;
END
$unassigned_access$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. TIME ENTRIES — own-rows only, RPC-only workflow mutations
-- ────────────────────────────────────────────────────────────────────────────
DO $time_entries$
DECLARE
  v_me UUID := NULLIF(current_setting('rls_test.installer_id', true), '')::uuid;
  n BIGINT;
BEGIN
  IF v_me IS NULL THEN
    RAISE NOTICE '[SKIP] section 5: no installer fixture.'; RETURN;
  END IF;

  -- 5a. Other installers' entries invisible.
  SELECT count(*) INTO n FROM public.time_entries WHERE installer_id <> v_me;
  IF n = 0 THEN RAISE NOTICE '[PASS] 5a installer sees 0 foreign time_entries';
  ELSE RAISE EXCEPTION '[FAIL] 5a installer sees % foreign time_entries', n;
  END IF;

  -- 5b. Closed own entries are immutable via direct UPDATE (policy allows
  -- updating only OPEN entries; start/stop flows must go through the RPCs).
  UPDATE public.time_entries SET duration_minutes = duration_minutes
  WHERE installer_id = v_me AND end_time IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE NOTICE '[PASS] 5b installer cannot edit closed time_entries directly';
  ELSE RAISE EXCEPTION '[FAIL] 5b installer edited % CLOSED time_entries directly', n;
  END IF;

  -- 5c. Cannot insert an entry as someone else (WITH CHECK installer_id = uid).
  BEGIN
    INSERT INTO public.time_entries (site_id, installer_id, start_time)
    SELECT s.id, NULLIF(current_setting('rls_test.other_inst_id', true), '')::uuid, NOW()
    FROM public.sites s LIMIT 1;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN
      -- Installer sees no site rows at all → nothing to insert; boundary holds.
      RAISE NOTICE '[PASS] 5c nothing inserted (no visible site to target)';
    ELSE
      RAISE EXCEPTION '[FAIL] 5c installer inserted a time entry for another user!';
    END IF;
  EXCEPTION WHEN insufficient_privilege OR check_violation OR not_null_violation THEN
    RAISE NOTICE '[PASS] 5c foreign-installer_id insert rejected (%)', SQLSTATE;
  WHEN raise_exception THEN
    IF SQLERRM LIKE '[FAIL]%' THEN RAISE; END IF;
    RAISE NOTICE '[PASS] 5c foreign-installer_id insert rejected by trigger';
  END;

  -- 5d. NOTE (manual, not executed here): the sanctioned mutation path is the
  -- SECURITY DEFINER RPCs, e.g.:
  --   select public.start_work('<assigned_site_uuid>', null, null, null);
  --   select public.pause_work('<assigned_site_uuid>');
  -- Run those manually on a dev site if you want to exercise the happy path —
  -- they change real state, so they are deliberately NOT part of this script.
  RAISE NOTICE '[INFO] 5d start/pause/complete RPC happy-path: run manually on dev (see comments)';

  -- 5e. Installer must NOT be able to call the admin time-correction RPCs.
  -- Each RPC checks is_admin() before touching anything, so a random uuid is
  -- safe: the privilege check fires first (and the run is rolled back anyway).
  BEGIN
    PERFORM public.admin_close_time_entry(gen_random_uuid(), NOW(), 'rls smoke bandymas');
    RAISE EXCEPTION '[FAIL] 5e installer called admin_close_time_entry!';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[PASS] 5e admin_close_time_entry denied to installer';
  WHEN undefined_function THEN
    RAISE NOTICE '[SKIP] 5e admin_close_time_entry not deployed yet';
  END;
  BEGIN
    PERFORM public.admin_correct_time_entry(gen_random_uuid(), NOW() - interval '1 hour', NOW(), 'rls smoke bandymas', true);
    RAISE EXCEPTION '[FAIL] 5f installer called admin_correct_time_entry!';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[PASS] 5f admin_correct_time_entry denied to installer';
  WHEN undefined_function THEN
    RAISE NOTICE '[SKIP] 5f admin_correct_time_entry not deployed yet';
  END;
  BEGIN
    PERFORM public.mark_time_entry_reviewed(gen_random_uuid(), 'rls smoke bandymas');
    RAISE EXCEPTION '[FAIL] 5g installer called mark_time_entry_reviewed!';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[PASS] 5g mark_time_entry_reviewed denied to installer';
  WHEN undefined_function THEN
    RAISE NOTICE '[SKIP] 5g mark_time_entry_reviewed not deployed yet';
  END;
END
$time_entries$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. STORAGE (site_files / site-photos) — manual notes, not testable from SQL
-- ────────────────────────────────────────────────────────────────────────────
-- storage.objects policies act on real objects and are exercised via the
-- storage API, so verify them from the app (or supabase-js) on dev:
--   • Path convention: <siteId>/<filename> — the first path segment drives
--     is_assigned_to_site() in every site_files policy.
--   • As ADMIN: list/upload/update/delete anything in site_files → allowed.
--   • As an ASSIGNED installer: list files of the assigned site, upload a
--     blueprint from mobile, re-upload (upsert → UPDATE), delete an
--     annotation attachment → all allowed by current product flow.
--   • As an UNASSIGNED installer: list/upload to another site's prefix →
--     must be rejected (RLS).
--   • NOTE: getSiteFiles() renders via getPublicUrl(); direct object URLs are
--     link-addressable while the bucket is public — the policies above govern
--     the API surface (list/upload/delete). Signed-URL migration is tracked
--     as a post-beta task.
DO $$ BEGIN RAISE NOTICE '[INFO] 6 storage policies: verify manually via app/storage API (see comments)'; END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. admin_activity_view — security_invoker must scope rows per user
-- ────────────────────────────────────────────────────────────────────────────
DO $activity_view_installer$
DECLARE
  v_me UUID := NULLIF(current_setting('rls_test.installer_id', true), '')::uuid;
  n BIGINT;
BEGIN
  IF v_me IS NULL THEN
    RAISE NOTICE '[SKIP] 7a: no installer fixture.'; RETURN;
  END IF;
  -- Still impersonating the installer here.
  SELECT count(*) INTO n FROM public.admin_activity_view WHERE installer_id <> v_me;
  IF n = 0 THEN RAISE NOTICE '[PASS] 7a admin_activity_view leaks 0 foreign rows to installer';
  ELSE RAISE EXCEPTION '[FAIL] 7a admin_activity_view exposes % foreign rows — is security_invoker=true applied?', n;
  END IF;
END
$activity_view_installer$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.impersonate('rls_test.admin_id');

DO $activity_view_admin$
DECLARE n_view BIGINT; n_entries BIGINT;
BEGIN
  SELECT count(*) INTO n_view FROM public.admin_activity_view;
  SELECT count(*) INTO n_entries FROM public.time_entries;
  IF n_view = n_entries THEN
    RAISE NOTICE '[PASS] 7b admin sees full activity (% rows = time_entries)', n_view;
  ELSE
    RAISE EXCEPTION '[FAIL] 7b admin sees % view rows but % time_entries', n_view, n_entries;
  END IF;
END
$activity_view_admin$;

RESET ROLE;

DO $$ BEGIN RAISE NOTICE '=== RLS SMOKE TEST FINISHED — review [PASS]/[SKIP]/[INFO] notices above ==='; END $$;

-- Nothing persists: forbidden writes either failed or matched 0 rows, and the
-- whole run is rolled back regardless.
ROLLBACK;
