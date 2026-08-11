-- ============================================================
-- Migration: secure admin_activity_view with security_invoker
--
-- The view was created (20260518222326, updated 20260521174500) WITHOUT
-- security_invoker, so it executed with the view OWNER's privileges and
-- bypassed RLS on time_entries / user_profiles / sites: any authenticated
-- installer selecting it could read ALL installers' time entries and names.
--
-- Fix: recreate byte-compatible (same columns/aliases as 20260521174500)
-- WITH (security_invoker = true) so the querying user's RLS applies:
--   • admins pass is_admin() policies → see everything (unchanged UX);
--   • installers see only their own time_entries / assigned sites.
-- The only frontend consumer is the admin dashboard (src/api/dashboard.ts).
--
-- CREATE OR REPLACE VIEW cannot change view options reliably across PG
-- versions when the option set differs → DROP + CREATE (non-destructive:
-- views hold no data).
-- ============================================================

DROP VIEW IF EXISTS public.admin_activity_view;

CREATE VIEW public.admin_activity_view
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.start_time,
  t.end_time,
  t.installer_id,
  t.site_id,
  u.full_name as installer_name,
  s.client_name,
  s.code as site_code,
  s.status as site_status,
  s.actual_end as site_actual_end,
  GREATEST(t.start_time, COALESCE(t.end_time, '1970-01-01'::timestamp)) as latest_action_time
FROM public.time_entries t
LEFT JOIN public.user_profiles u ON t.installer_id = u.id
LEFT JOIN public.sites s ON t.site_id = s.id
ORDER BY latest_action_time DESC;

GRANT SELECT ON public.admin_activity_view TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');

-- ════════════════════════════════════════════════════════════
-- VERIFICATION (commented; run manually in the SQL editor on dev)
-- ────────────────────────────────────────────────────────────
-- (a) Non-admin must see ONLY their own rows (RLS now applies):
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     (select json_build_object('sub', id, 'role', 'authenticated')::text
--        from public.user_profiles where role = 'installer' limit 1), true);
--   select count(*) from public.admin_activity_view;
--   -- EXPECT: count of THAT installer's time_entries only (not all rows)
-- rollback;
--
-- (b) Admin still sees everything:
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     (select json_build_object('sub', id, 'role', 'authenticated')::text
--        from public.user_profiles where role = 'admin' limit 1), true);
--   select count(*) from public.admin_activity_view;
--   -- EXPECT: same as select count(*) from time_entries (as postgres)
-- rollback;
--
-- (c) Option is set:
-- select reloptions from pg_class where relname = 'admin_activity_view';
--   -- EXPECT: {security_invoker=true}
-- ════════════════════════════════════════════════════════════
