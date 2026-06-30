-- Add simple installer work roles for operational planning.
-- This is intentionally separate from user_profiles.role, which controls app access.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS work_role TEXT NOT NULL DEFAULT 'installer';

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_work_role_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_work_role_check
  CHECK (work_role IN ('installer', 'electrician', 'site_manager', 'project_manager'));

CREATE INDEX IF NOT EXISTS idx_user_profiles_work_role
  ON public.user_profiles(work_role);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Admin update access for profile management, including work_role.
-- Existing self-profile read behavior is preserved by not changing SELECT policies.
DROP POLICY IF EXISTS "Adminai gali atnaujinti profilius" ON public.user_profiles;
CREATE POLICY "Adminai gali atnaujinti profilius"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Replacing the trigger guard below ensures non-admin users cannot change work_role
-- through self-profile updates.
CREATE OR REPLACE FUNCTION public.guard_user_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  OR NEW.deactivation_reason  IS DISTINCT FROM OLD.deactivation_reason
  OR NEW.work_role            IS DISTINCT FROM OLD.work_role THEN
    RAISE EXCEPTION 'Tik administratorius gali keisti role, hourly_rate, team_id, work_role ar montuotojo statuso laukus.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_user_profile_columns_trigger ON public.user_profiles;
DROP TRIGGER IF EXISTS trg_guard_user_profile_columns ON public.user_profiles;

CREATE TRIGGER trg_guard_user_profile_columns
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_user_profile_columns();

SELECT pg_notify('pgrst', 'reload schema');
