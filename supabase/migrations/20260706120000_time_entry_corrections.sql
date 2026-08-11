-- ============================================================
-- Migration: admin time-corrections + stale/forgotten timer handling
--
-- Column naming note: this schema uses start_time / end_time /
-- duration_minutes (not started_at/ended_at), so the review/correction
-- fields adapt accordingly (original_start_time, original_end_time, …).
--
-- Adds to public.time_entries:
--   • review flags   — needs_review, review_reason, reviewed_at/by
--   • correction log — corrected_at/by, correction_reason
--   • originals      — original_start_time/end_time/duration_minutes
--     (preserved ONCE, on the first correction)
-- Adds:
--   • single-open-timer guard: BEFORE INSERT trigger closes the installer's
--     other open entries (installer-initiated job switch, flagged for
--     review — never a silent background auto-close) + a partial unique
--     index (created only when no pre-existing duplicates block it).
--   • 3 admin-only SECURITY DEFINER RPCs (close / correct / mark reviewed),
--     each writing a site_audit_logs row.
--
-- Existing rows are NOT rewritten and NO open entries are auto-closed here.
-- ============================================================

-- ── B1. Columns (idempotent) ─────────────────────────────────────────────────
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS needs_review               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason              TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by                UUID REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS corrected_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS corrected_by               UUID REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS correction_reason          TEXT,
  ADD COLUMN IF NOT EXISTS original_start_time        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_end_time          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_duration_minutes  INTEGER;

-- ── B2. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_time_entries_needs_review
  ON public.time_entries(needs_review) WHERE needs_review;
CREATE INDEX IF NOT EXISTS idx_time_entries_site_needs_review
  ON public.time_entries(site_id, needs_review);
CREATE INDEX IF NOT EXISTS idx_time_entries_installer_start
  ON public.time_entries(installer_id, start_time DESC);

-- ── B3. Single open timer per installer ─────────────────────────────────────
-- start_work() only closes SAME-SITE open entries (idempotency), so an
-- installer switching sites could accumulate parallel open timers. This
-- trigger closes the installer's other open entries at the moment they start
-- a new one — an explicit installer action, and the closed rows are flagged
-- needs_review so an admin verifies the boundary. Runs for any INSERT of an
-- open entry (start_work is SECURITY DEFINER; triggers still fire).
CREATE OR REPLACE FUNCTION public.close_other_open_time_entries()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.end_time IS NULL THEN
    UPDATE public.time_entries
    SET end_time = GREATEST(NEW.start_time, start_time),
        duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM (GREATEST(NEW.start_time, start_time) - start_time)) / 60)::int,
        needs_review = true,
        review_reason = 'Automatiškai uždaryta pradėjus darbą kitame objekte.'
    WHERE installer_id = NEW.installer_id
      AND end_time IS NULL
      AND id IS DISTINCT FROM NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_other_open_time_entries ON public.time_entries;
CREATE TRIGGER trg_close_other_open_time_entries
  BEFORE INSERT ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.close_other_open_time_entries();

-- Belt-and-suspenders unique index. Pre-existing duplicate open entries would
-- make CREATE UNIQUE INDEX fail, so: if duplicates exist, flag them for review
-- (non-destructive; they stay open) and SKIP the index with a loud notice —
-- an admin closes them via the new RPCs, then this migration can be re-run.
DO $one_open$
DECLARE
  v_dupes INT;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT installer_id FROM public.time_entries
    WHERE end_time IS NULL GROUP BY installer_id HAVING count(*) > 1
  ) d;

  IF v_dupes = 0 THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uniq_time_entries_one_open_per_installer
             ON public.time_entries(installer_id) WHERE end_time IS NULL';
    RAISE NOTICE 'Unique open-timer index created.';
  ELSE
    UPDATE public.time_entries te
    SET needs_review = true,
        review_reason = COALESCE(review_reason, 'Keli atviri laiko įrašai — patikrinkite ir uždarykite.')
    WHERE te.end_time IS NULL
      AND te.installer_id IN (
        SELECT installer_id FROM public.time_entries
        WHERE end_time IS NULL GROUP BY installer_id HAVING count(*) > 1
      );
    RAISE NOTICE 'SKIPPED unique open-timer index: % installer(s) have multiple open entries (now flagged needs_review). Close them via admin_close_time_entry and re-run this index statement.', v_dupes;
  END IF;
END
$one_open$;

-- ── C. Admin correction RPCs ─────────────────────────────────────────────────
-- Shared audit-write shape: site_audit_logs(action, entity_type='time_entry',
-- old_data/new_data jsonb, actor_id = auth.uid(), site_id from the entry).

-- C1. Close a forgotten OPEN entry at an admin-chosen end time.
CREATE OR REPLACE FUNCTION public.admin_close_time_entry(
  p_entry_id UUID,
  p_ended_at TIMESTAMPTZ,
  p_reason   TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old public.time_entries;
  v_new public.time_entries;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali uždaryti laiko įrašus.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Korekcijos priežastis privaloma (bent 5 simboliai).' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_old FROM public.time_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Laiko įrašas nerastas (id=%).', p_entry_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_old.end_time IS NOT NULL THEN
    RAISE EXCEPTION 'Įrašas jau uždarytas — naudokite admin_correct_time_entry.' USING ERRCODE = 'restrict_violation';
  END IF;
  IF p_ended_at <= v_old.start_time THEN
    RAISE EXCEPTION 'Pabaiga turi būti po pradžios.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.time_entries
  SET end_time = p_ended_at,
      duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM (p_ended_at - start_time)) / 60)::int,
      corrected_at = NOW(),
      corrected_by = auth.uid(),
      correction_reason = btrim(p_reason)
      -- needs_review deliberately untouched: a stale entry stays flagged until
      -- an admin explicitly reviews it (mark_time_entry_reviewed / correct).
  WHERE id = p_entry_id
  RETURNING * INTO v_new;

  INSERT INTO public.site_audit_logs (site_id, actor_id, action, entity_type, old_data, new_data)
  VALUES (v_old.site_id, auth.uid(), 'time_entry_admin_closed', 'time_entry', to_jsonb(v_old), to_jsonb(v_new));

  RETURN to_jsonb(v_new);
END;
$$;

-- C2. Correct start/end of any entry (open or closed). Originals preserved ONCE.
CREATE OR REPLACE FUNCTION public.admin_correct_time_entry(
  p_entry_id      UUID,
  p_started_at    TIMESTAMPTZ,
  p_ended_at      TIMESTAMPTZ,
  p_reason        TEXT,
  p_mark_reviewed BOOLEAN DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old public.time_entries;
  v_new public.time_entries;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali koreguoti laiko įrašus.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Korekcijos priežastis privaloma (bent 5 simboliai).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_started_at IS NULL OR p_ended_at IS NULL OR p_ended_at <= p_started_at THEN
    RAISE EXCEPTION 'Pabaiga turi būti po pradžios.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_old FROM public.time_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Laiko įrašas nerastas (id=%).', p_entry_id USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.time_entries
  SET original_start_time       = COALESCE(original_start_time, v_old.start_time),
      original_end_time         = COALESCE(original_end_time, v_old.end_time),
      original_duration_minutes = COALESCE(original_duration_minutes, v_old.duration_minutes),
      start_time = p_started_at,
      end_time   = p_ended_at,
      duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM (p_ended_at - p_started_at)) / 60)::int,
      corrected_at = NOW(),
      corrected_by = auth.uid(),
      correction_reason = btrim(p_reason),
      needs_review = CASE WHEN p_mark_reviewed THEN false ELSE needs_review END,
      reviewed_at  = CASE WHEN p_mark_reviewed THEN NOW() ELSE reviewed_at END,
      reviewed_by  = CASE WHEN p_mark_reviewed THEN auth.uid() ELSE reviewed_by END
  WHERE id = p_entry_id
  RETURNING * INTO v_new;

  INSERT INTO public.site_audit_logs (site_id, actor_id, action, entity_type, old_data, new_data)
  VALUES (v_old.site_id, auth.uid(), 'time_entry_admin_corrected', 'time_entry', to_jsonb(v_old), to_jsonb(v_new));

  RETURN to_jsonb(v_new);
END;
$$;

-- C3. Mark an entry reviewed without changing its times.
CREATE OR REPLACE FUNCTION public.mark_time_entry_reviewed(
  p_entry_id UUID,
  p_reason   TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old public.time_entries;
  v_new public.time_entries;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali pažymėti įrašus peržiūrėtais.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_old FROM public.time_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Laiko įrašas nerastas (id=%).', p_entry_id USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.time_entries
  SET needs_review  = false,
      reviewed_at   = NOW(),
      reviewed_by   = auth.uid(),
      review_reason = COALESCE(NULLIF(btrim(p_reason), ''), review_reason)
  WHERE id = p_entry_id
  RETURNING * INTO v_new;

  INSERT INTO public.site_audit_logs (site_id, actor_id, action, entity_type, old_data, new_data)
  VALUES (v_old.site_id, auth.uid(), 'time_entry_reviewed', 'time_entry', to_jsonb(v_old), to_jsonb(v_new));

  RETURN to_jsonb(v_new);
END;
$$;

-- ── Grants (RPCs self-check is_admin(); matches existing pattern) ────────────
REVOKE ALL ON FUNCTION public.admin_close_time_entry(UUID, TIMESTAMPTZ, TEXT)                       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_correct_time_entry(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_time_entry_reviewed(UUID, TEXT)                                  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_close_time_entry(UUID, TIMESTAMPTZ, TEXT)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_correct_time_entry(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_time_entry_reviewed(UUID, TEXT)                                  TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');

-- ════════════════════════════════════════════════════════════
-- SMOKE NOTES (manual, dev):
--   • select public.admin_close_time_entry('<open_entry>', now(), 'pamirštas laikas');
--     → closes, keeps needs_review, writes time_entry_admin_closed audit row.
--   • run twice admin_correct_time_entry on the same entry → original_* stay
--     at the FIRST pre-correction values (COALESCE guard).
--   • as installer: any of the 3 RPCs → ERROR 42501.
-- ════════════════════════════════════════════════════════════
