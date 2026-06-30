-- Add safe, reversible team status fields.
-- Teams are never hard-deleted by this migration; historical references remain intact.

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_by UUID NULL REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS archive_reason TEXT NULL;

ALTER TABLE public.teams
  DROP CONSTRAINT IF EXISTS teams_status_check;

ALTER TABLE public.teams
  ADD CONSTRAINT teams_status_check
  CHECK (status IN ('active', 'inactive', 'archived'));

CREATE INDEX IF NOT EXISTS idx_teams_status
  ON public.teams(status);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Existing read policy stays unchanged. Admin-only management is re-declared so
-- team status/archive fields can be updated only by admins through the API.
DROP POLICY IF EXISTS "Valdyti komandas tik adminams" ON public.teams;
CREATE POLICY "Valdyti komandas tik adminams" ON public.teams
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

SELECT pg_notify('pgrst', 'reload schema');
