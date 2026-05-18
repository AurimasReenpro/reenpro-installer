CREATE OR REPLACE VIEW public.admin_activity_view AS
SELECT 
  t.id,
  t.start_time,
  t.end_time,
  t.installer_id,
  t.site_id,
  u.full_name as installer_name,
  s.client_name,
  s.code as site_code,
  GREATEST(t.start_time, COALESCE(t.end_time, '1970-01-01'::timestamp)) as latest_action_time
FROM public.time_entries t
LEFT JOIN public.user_profiles u ON t.installer_id = u.id
LEFT JOIN public.sites s ON t.site_id = s.id
ORDER BY latest_action_time DESC;
