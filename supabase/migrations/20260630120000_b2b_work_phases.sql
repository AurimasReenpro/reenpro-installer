-- Add site work phases and phase-linked time tracking.

CREATE TABLE IF NOT EXISTS public.site_work_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS work_phase_id UUID REFERENCES public.site_work_phases(id);

CREATE INDEX IF NOT EXISTS idx_site_work_phases_site_id
  ON public.site_work_phases(site_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_work_phases_site_code
  ON public.site_work_phases(site_id, code);

CREATE INDEX IF NOT EXISTS idx_time_entries_work_phase_id
  ON public.time_entries(work_phase_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_site_work_phase_id
  ON public.time_entries(site_id, work_phase_id);

ALTER TABLE public.site_work_phases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view site work phases" ON public.site_work_phases;
CREATE POLICY "Authenticated can view site work phases"
  ON public.site_work_phases
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_assigned_to_site(site_id)
  );

DROP POLICY IF EXISTS "Admins can insert site work phases" ON public.site_work_phases;
CREATE POLICY "Admins can insert site work phases"
  ON public.site_work_phases
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update site work phases" ON public.site_work_phases;
CREATE POLICY "Admins can update site work phases"
  ON public.site_work_phases
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete site work phases" ON public.site_work_phases;
CREATE POLICY "Admins can delete site work phases"
  ON public.site_work_phases
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.site_work_phases
  TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_site_work_phase_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.time_entries te
    WHERE te.work_phase_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'PHASE_HAS_TIME_ENTRIES'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_site_work_phase_delete ON public.site_work_phases;
CREATE TRIGGER trg_guard_site_work_phase_delete
  BEFORE DELETE ON public.site_work_phases
  FOR EACH ROW EXECUTE FUNCTION public.guard_site_work_phase_delete();

CREATE OR REPLACE FUNCTION public.seed_default_site_work_phases(
  p_site_id UUID,
  p_site_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(p_site_type, 'b2c') = 'b2b' THEN
    INSERT INTO public.site_work_phases (site_id, code, label, sort_order)
    VALUES
      (p_site_id, 'dc_montavimas', 'DC montavimas', 10),
      (p_site_id, 'balasto_dejimas', 'Balasto dėjimas', 20),
      (p_site_id, 'loveliu_montavimas', 'Lovelių montavimas', 30),
      (p_site_id, 'moduliu_montavimas', 'Modulių montavimas', 40),
      (p_site_id, 'inverteriai', 'Inverteriai', 50),
      (p_site_id, 'paleidimas_patikra', 'Paleidimas / patikra', 60)
    ON CONFLICT (site_id, code) DO NOTHING;
  ELSIF COALESCE(p_site_type, 'b2c') = 'service' THEN
    INSERT INTO public.site_work_phases (site_id, code, label, sort_order)
    VALUES (p_site_id, 'servisas', 'Servisas', 10)
    ON CONFLICT (site_id, code) DO NOTHING;
  ELSE
    INSERT INTO public.site_work_phases (site_id, code, label, sort_order)
    VALUES (p_site_id, 'montavimas', 'Montavimas', 10)
    ON CONFLICT (site_id, code) DO NOTHING;
  END IF;
END;
$$;

SELECT public.seed_default_site_work_phases(s.id, s.site_type)
FROM public.sites s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.site_work_phases swp
  WHERE swp.site_id = s.id
);

REVOKE EXECUTE ON FUNCTION public.seed_default_site_work_phases(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_work(
  p_site_id UUID,
  p_start_lat DOUBLE PRECISION DEFAULT NULL,
  p_start_lng DOUBLE PRECISION DEFAULT NULL,
  p_work_phase_id UUID DEFAULT NULL
)
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_new_entry public.time_entries;
  v_current_status TEXT;
  v_site_type TEXT;
  v_resolved_phase_id UUID;
BEGIN
  SELECT status, COALESCE(site_type, 'b2c')
  INTO v_current_status, v_site_type
  FROM public.sites
  WHERE id = p_site_id;

  IF v_current_status = 'in_progress' THEN
    SELECT * INTO v_new_entry
    FROM public.time_entries
    WHERE site_id = p_site_id
      AND installer_id = v_uid
      AND end_time IS NULL
    ORDER BY start_time DESC
    LIMIT 1;

    RETURN v_new_entry;
  END IF;

  IF v_site_type = 'b2b' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.site_work_phases swp
      WHERE swp.site_id = p_site_id
        AND swp.is_active = true
    ) THEN
      RAISE EXCEPTION 'WORK_PHASE_UNAVAILABLE'
        USING ERRCODE = 'check_violation';
    END IF;

    IF p_work_phase_id IS NULL THEN
      RAISE EXCEPTION 'WORK_PHASE_REQUIRED'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT swp.id
    INTO v_resolved_phase_id
    FROM public.site_work_phases swp
    WHERE swp.id = p_work_phase_id
      AND swp.site_id = p_site_id
      AND swp.is_active = true;

    IF v_resolved_phase_id IS NULL THEN
      RAISE EXCEPTION 'WORK_PHASE_UNAVAILABLE'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF p_work_phase_id IS NOT NULL THEN
      SELECT swp.id
      INTO v_resolved_phase_id
      FROM public.site_work_phases swp
      WHERE swp.id = p_work_phase_id
        AND swp.site_id = p_site_id
        AND swp.is_active = true;
    END IF;

    IF v_resolved_phase_id IS NULL THEN
      SELECT swp.id
      INTO v_resolved_phase_id
      FROM public.site_work_phases swp
      WHERE swp.site_id = p_site_id
        AND swp.is_active = true
      ORDER BY swp.sort_order ASC, swp.label ASC
      LIMIT 1;
    END IF;
  END IF;

  UPDATE public.time_entries
  SET end_time = NOW(),
      duration_minutes = EXTRACT(EPOCH FROM (NOW() - start_time))/60
  WHERE site_id = p_site_id
    AND installer_id = v_uid
    AND end_time IS NULL;

  INSERT INTO public.time_entries (site_id, installer_id, start_time, start_lat, start_lng, work_phase_id)
  VALUES (p_site_id, v_uid, NOW(), p_start_lat, p_start_lng, v_resolved_phase_id)
  RETURNING * INTO v_new_entry;

  UPDATE public.sites
  SET status = 'in_progress',
      actual_start = COALESCE(actual_start, NOW())
  WHERE id = p_site_id;

  RETURN v_new_entry;
END;
$$;

CREATE OR REPLACE VIEW public.site_work_phase_time_v
WITH (security_invoker = true)
AS
SELECT
  s.id AS site_id,
  s.code AS site_code,
  s.client_name,
  s.site_type,
  s.kwp,
  swp.id AS work_phase_id,
  swp.code AS work_phase_code,
  swp.label AS work_phase_label,
  swp.sort_order AS work_phase_sort_order,
  swp.is_active AS work_phase_is_active,
  COUNT(te.id)::INT AS entry_count,
  COUNT(te.id) FILTER (WHERE te.end_time IS NULL)::INT AS open_entry_count,
  COALESCE(
    SUM(
      CASE
        WHEN te.id IS NULL THEN 0
        WHEN te.duration_minutes IS NOT NULL THEN te.duration_minutes::NUMERIC / 60
        WHEN te.end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 3600
        ELSE EXTRACT(EPOCH FROM (NOW() - te.start_time)) / 3600
      END
    ),
    0
  ) AS total_hours,
  CASE
    WHEN COALESCE(s.kwp, 0) > 0 THEN
      COALESCE(
        SUM(
          CASE
            WHEN te.id IS NULL THEN 0
            WHEN te.duration_minutes IS NOT NULL THEN te.duration_minutes::NUMERIC / 60
            WHEN te.end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 3600
            ELSE EXTRACT(EPOCH FROM (NOW() - te.start_time)) / 3600
          END
        ),
        0
      ) / s.kwp
    ELSE NULL
  END AS hours_per_kwp
FROM public.sites s
LEFT JOIN public.site_work_phases swp ON swp.site_id = s.id
LEFT JOIN public.time_entries te ON te.site_id = s.id AND te.work_phase_id = swp.id
GROUP BY
  s.id,
  s.code,
  s.client_name,
  s.site_type,
  s.kwp,
  swp.id,
  swp.code,
  swp.label,
  swp.sort_order,
  swp.is_active
UNION ALL
SELECT
  s.id AS site_id,
  s.code AS site_code,
  s.client_name,
  s.site_type,
  s.kwp,
  NULL::UUID AS work_phase_id,
  NULL::TEXT AS work_phase_code,
  'Be etapo'::TEXT AS work_phase_label,
  2147483647 AS work_phase_sort_order,
  false AS work_phase_is_active,
  COUNT(te.id)::INT AS entry_count,
  COUNT(te.id) FILTER (WHERE te.end_time IS NULL)::INT AS open_entry_count,
  COALESCE(
    SUM(
      CASE
        WHEN te.duration_minutes IS NOT NULL THEN te.duration_minutes::NUMERIC / 60
        WHEN te.end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 3600
        ELSE EXTRACT(EPOCH FROM (NOW() - te.start_time)) / 3600
      END
    ),
    0
  ) AS total_hours,
  CASE
    WHEN COALESCE(s.kwp, 0) > 0 THEN
      COALESCE(
        SUM(
          CASE
            WHEN te.duration_minutes IS NOT NULL THEN te.duration_minutes::NUMERIC / 60
            WHEN te.end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 3600
            ELSE EXTRACT(EPOCH FROM (NOW() - te.start_time)) / 3600
          END
        ),
        0
      ) / s.kwp
    ELSE NULL
  END AS hours_per_kwp
FROM public.sites s
JOIN public.time_entries te ON te.site_id = s.id AND te.work_phase_id IS NULL
GROUP BY
  s.id,
  s.code,
  s.client_name,
  s.site_type,
  s.kwp;

GRANT SELECT ON public.site_work_phase_time_v TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
