-- Redefine public.is_assigned_to_site to support both site_assignments and team-based assignments
CREATE OR REPLACE FUNCTION public.is_assigned_to_site(site_id_param UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
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
