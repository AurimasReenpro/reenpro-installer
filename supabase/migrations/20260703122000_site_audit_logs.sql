-- ============================================================
-- Migration: track public.site_audit_logs in the repo
--
-- The table is consumed by the admin "Istorija" tab
-- (src/pages/admin/site-details/AuditLogTab.tsx: select
--   id, action, entity_type, old_data, new_data, created_at,
--   actor:user_profiles(full_name)  ← resolved via the actor_id FK)
-- and typed in src/types/database.types.ts, but until now existed only in
-- the live DB (schema drift). This migration converges fresh environments;
-- IF NOT EXISTS makes it a no-op where the table already exists.
--
-- Shape matches database.types.ts exactly: entity_type NOT NULL,
-- actor_id nullable, old/new_data nullable jsonb.
-- No triggers and no backfill here (separate task).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.site_audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES public.user_profiles(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  old_data    JSONB,
  new_data    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AuditLogTab reads per-site, newest first (limit 200).
CREATE INDEX IF NOT EXISTS idx_site_audit_logs_site_created
  ON public.site_audit_logs(site_id, created_at DESC);
-- For future "actor activity" views.
CREATE INDEX IF NOT EXISTS idx_site_audit_logs_actor_created
  ON public.site_audit_logs(actor_id, created_at DESC);

ALTER TABLE public.site_audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: admin-only (only the admin Istorija tab reads it).
DROP POLICY IF EXISTS "site_audit_logs: matyti tik adminams" ON public.site_audit_logs;
CREATE POLICY "site_audit_logs: matyti tik adminams" ON public.site_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- INSERT: any authenticated user, but only as themselves (or anonymous NULL).
-- Audit rows are produced by triggers/RPCs firing under the acting user's role
-- (installers generate checklist_update / status_change events), so a blanket
-- admin-only INSERT would silently drop installer activity. No UPDATE/DELETE
-- policies exist → the log is append-only through the API.
DROP POLICY IF EXISTS "site_audit_logs: rašyti savo vardu" ON public.site_audit_logs;
CREATE POLICY "site_audit_logs: rašyti savo vardu" ON public.site_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL OR public.is_admin());

GRANT SELECT, INSERT ON public.site_audit_logs TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
