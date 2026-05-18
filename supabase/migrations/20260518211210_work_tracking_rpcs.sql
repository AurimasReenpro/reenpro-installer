-- start_work
CREATE OR REPLACE FUNCTION public.start_work(
  p_site_id UUID,
  p_start_lat DOUBLE PRECISION DEFAULT NULL,
  p_start_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_new_entry public.time_entries;
BEGIN
  -- 1. Close any open entries for this user on this site
  UPDATE public.time_entries
  SET end_time = NOW(),
      duration_minutes = EXTRACT(EPOCH FROM (NOW() - start_time))/60
  WHERE site_id = p_site_id
    AND installer_id = v_uid
    AND end_time IS NULL;

  -- 2. Create new time entry
  INSERT INTO public.time_entries (site_id, installer_id, start_time, start_lat, start_lng)
  VALUES (p_site_id, v_uid, NOW(), p_start_lat, p_start_lng)
  RETURNING * INTO v_new_entry;

  -- 3. Update site status
  UPDATE public.sites
  SET status = 'in_progress',
      actual_start = COALESCE(actual_start, NOW())
  WHERE id = p_site_id;

  RETURN v_new_entry;
END;
$$;

-- pause_work
CREATE OR REPLACE FUNCTION public.pause_work(p_site_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  -- 1. Close open time entry
  UPDATE public.time_entries
  SET end_time = NOW(),
      duration_minutes = EXTRACT(EPOCH FROM (NOW() - start_time))/60
  WHERE site_id = p_site_id
    AND installer_id = v_uid
    AND end_time IS NULL;

  -- 2. Update site status
  UPDATE public.sites
  SET status = 'paused'
  WHERE id = p_site_id;
END;
$$;

-- complete_work
CREATE OR REPLACE FUNCTION public.complete_work(p_site_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  -- 1. Close open time entry
  UPDATE public.time_entries
  SET end_time = NOW(),
      duration_minutes = EXTRACT(EPOCH FROM (NOW() - start_time))/60
  WHERE site_id = p_site_id
    AND installer_id = v_uid
    AND end_time IS NULL;

  -- 2. Update site status
  UPDATE public.sites
  SET status = 'completed',
      actual_end = NOW()
  WHERE id = p_site_id;
END;
$$;
