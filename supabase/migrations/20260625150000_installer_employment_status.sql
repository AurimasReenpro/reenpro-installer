-- Add soft employment status fields for installers without deleting history.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS employment_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deactivated_by UUID NULL REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT NULL;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_employment_status_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_employment_status_check
  CHECK (employment_status IN ('active', 'inactive', 'invited', 'suspended', 'archived'));

CREATE INDEX IF NOT EXISTS idx_user_profiles_employment_status
  ON public.user_profiles(employment_status);

CREATE INDEX IF NOT EXISTS idx_user_profiles_team_employment_status
  ON public.user_profiles(team_id, employment_status);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Existing policy "Visi mato profilius" already covers authenticated reads.
-- Add explicit admin UPDATE access for lifecycle/status management.
DROP POLICY IF EXISTS "Adminai gali atnaujinti profilius" ON public.user_profiles;
CREATE POLICY "Adminai gali atnaujinti profilius"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Extend the existing sensitive-column guard so non-admin users cannot mutate
-- employment lifecycle fields even through the self-update profile policy.
CREATE OR REPLACE FUNCTION public.guard_user_profile_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role                 IS DISTINCT FROM OLD.role
  OR NEW.hourly_rate          IS DISTINCT FROM OLD.hourly_rate
  OR NEW.team_id              IS DISTINCT FROM OLD.team_id
  OR NEW.employment_status    IS DISTINCT FROM OLD.employment_status
  OR NEW.deactivated_at       IS DISTINCT FROM OLD.deactivated_at
  OR NEW.deactivated_by       IS DISTINCT FROM OLD.deactivated_by
  OR NEW.deactivation_reason  IS DISTINCT FROM OLD.deactivation_reason THEN
    RAISE EXCEPTION 'Tik administratorius gali keisti role, hourly_rate, team_id ar montuotojo statuso laukus.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_profile_columns ON public.user_profiles;
CREATE TRIGGER trg_guard_user_profile_columns
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_profile_columns();

SELECT pg_notify('pgrst', 'reload schema');
