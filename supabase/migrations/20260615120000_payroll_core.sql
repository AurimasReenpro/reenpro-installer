-- ============================================================
-- Migration: Payroll core (Phase 9A — database only)
-- Pay model: a FIXED fee per site, split EQUALLY among the
-- installers who actually worked it. Money is ADMIN-ONLY — every
-- object here is gated behind is_admin(), so installers can never
-- read or write compensation/earnings via the API.
--
-- Adds:
--   1. site_compensation   — the per-site fixed fee (no columns on `sites`)
--   2. payroll_periods     — one row per (year, month), open→review→locked
--   3. earnings_entries    — APPEND-ONLY ledger (corrections = reversal rows)
--   4. recalculate_period()— rebuilds the auto site_share rows for a period
--   5. lock_period()       — freezes a period once every site has a fee
--
-- Idempotent: safe to re-run (IF NOT EXISTS / CREATE OR REPLACE /
-- DROP ... IF EXISTS), matching the project's migration style.
-- ============================================================

-- Month bucketing for payroll uses Lithuanian local time so a site closed at
-- e.g. 2026-01-31 23:30 +02 lands in January, not February. Centralised here so
-- recalculate_period() and lock_period() agree byte-for-byte.
-- (Inlined as 'Europe/Vilnius' literals below — Postgres has no SQL-level const.)

-- ════════════════════════════════════════════════════════════
-- 1. site_compensation — fixed fee per site
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.site_compensation (
  site_id    UUID PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  fixed_fee  NUMERIC(10,2) NOT NULL CHECK (fixed_fee >= 0),
  currency   CHAR(3)       NOT NULL DEFAULT 'EUR',
  notes      TEXT,
  updated_by UUID REFERENCES public.user_profiles(id),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Stamp updated_at / updated_by on every write so the fee history is auditable
-- without trusting the client to send them. SECURITY INVOKER → auth.uid() is the
-- acting admin.
CREATE OR REPLACE FUNCTION public.set_site_compensation_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  NEW.updated_at := NOW();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_compensation_audit ON public.site_compensation;
CREATE TRIGGER trg_site_compensation_audit
  BEFORE INSERT OR UPDATE ON public.site_compensation
  FOR EACH ROW EXECUTE FUNCTION public.set_site_compensation_audit();

-- ════════════════════════════════════════════════════════════
-- 2. payroll_periods — one accounting month
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year          INT  NOT NULL,
  month         INT  NOT NULL CHECK (month BETWEEN 1 AND 12),
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'review', 'locked')),
  locked_by     UUID REFERENCES public.user_profiles(id),
  locked_at     TIMESTAMPTZ,
  unlock_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month)
);

-- ════════════════════════════════════════════════════════════
-- 3. earnings_entries — APPEND-ONLY ledger
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.earnings_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id    UUID NOT NULL REFERENCES public.payroll_periods(id) ON DELETE RESTRICT,
  installer_id UUID NOT NULL REFERENCES public.user_profiles(id),
  -- Nullable + SET NULL: a deleted site must never erase money already owed.
  site_id      UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  entry_type   TEXT NOT NULL
               CHECK (entry_type IN ('site_share', 'bonus', 'deduction', 'adjustment')),
  amount       NUMERIC(10,2) NOT NULL,
  description  TEXT,
  source       TEXT NOT NULL CHECK (source IN ('auto', 'manual')),
  created_by   UUID REFERENCES public.user_profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Negative amounts only make sense for deductions / adjustments.
  CONSTRAINT earnings_entries_amount_sign CHECK (
    amount >= 0 OR entry_type IN ('deduction', 'adjustment')
  )
);

CREATE INDEX IF NOT EXISTS idx_earnings_entries_period      ON public.earnings_entries(period_id);
CREATE INDEX IF NOT EXISTS idx_earnings_entries_installer   ON public.earnings_entries(installer_id);
CREATE INDEX IF NOT EXISTS idx_earnings_entries_site        ON public.earnings_entries(site_id);
CREATE INDEX IF NOT EXISTS idx_earnings_entries_period_auto ON public.earnings_entries(period_id, source);

-- ── 3a. Append-only guards ────────────────────────────────────
-- UPDATE is never allowed: fix mistakes with a reversal entry, not an edit.
CREATE OR REPLACE FUNCTION public.earnings_entries_block_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'earnings_entries yra tik papildomas žurnalas: redaguoti negalima — klaidos taisomos atvirkštiniais (reversal) įrašais.'
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- DELETE is blocked too, with ONE exception: recalculate_period() may remove its
-- own source='auto' rows. The recalc RPC sets a transaction-local GUC flag right
-- before its DELETE; nothing else can forge it, and SET LOCAL evaporates when the
-- transaction ends. current_setting(..., true) returns NULL when the flag is unset.
CREATE OR REPLACE FUNCTION public.earnings_entries_guard_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF OLD.source = 'auto'
     AND current_setting('app.allow_auto_ledger_delete', true) = 'on' THEN
    RETURN OLD;  -- permitted: recalculation rebuilding auto rows
  END IF;
  RAISE EXCEPTION 'earnings_entries yra tik papildomas žurnalas: trinti galima tik auto eilutes perskaičiavimo metu.'
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- No new entries may land in a LOCKED period (manual or auto).
CREATE OR REPLACE FUNCTION public.earnings_entries_block_locked_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM public.payroll_periods WHERE id = NEW.period_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Nežinomas payroll periodas (period_id=%).', NEW.period_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'Periodas užrakintas (locked): naujų earnings_entries kurti negalima.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_earnings_block_update ON public.earnings_entries;
CREATE TRIGGER trg_earnings_block_update
  BEFORE UPDATE ON public.earnings_entries
  FOR EACH ROW EXECUTE FUNCTION public.earnings_entries_block_update();

DROP TRIGGER IF EXISTS trg_earnings_guard_delete ON public.earnings_entries;
CREATE TRIGGER trg_earnings_guard_delete
  BEFORE DELETE ON public.earnings_entries
  FOR EACH ROW EXECUTE FUNCTION public.earnings_entries_guard_delete();

DROP TRIGGER IF EXISTS trg_earnings_block_locked_insert ON public.earnings_entries;
CREATE TRIGGER trg_earnings_block_locked_insert
  BEFORE INSERT ON public.earnings_entries
  FOR EACH ROW EXECUTE FUNCTION public.earnings_entries_block_locked_insert();

-- ════════════════════════════════════════════════════════════
-- 4. RLS — admin-only on all three tables
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.site_compensation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earnings_entries  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_compensation tik adminams" ON public.site_compensation;
CREATE POLICY "site_compensation tik adminams" ON public.site_compensation
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "payroll_periods tik adminams" ON public.payroll_periods;
CREATE POLICY "payroll_periods tik adminams" ON public.payroll_periods
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "earnings_entries tik adminams" ON public.earnings_entries;
CREATE POLICY "earnings_entries tik adminams" ON public.earnings_entries
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Grants. RLS still gates every row to admins. earnings_entries deliberately gets
-- NO UPDATE/DELETE for the API role (append-only) — recalc deletes its auto rows
-- via SECURITY DEFINER (table owner), which bypasses grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_compensation TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_periods   TO authenticated;
GRANT SELECT, INSERT                 ON public.earnings_entries   TO authenticated;

-- ════════════════════════════════════════════════════════════
-- 5. RPC recalculate_period(p_period_id)
--    Rebuilds the auto 'site_share' rows for one period.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.recalculate_period(p_period_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year         INT;
  v_month        INT;
  v_status       TEXT;
  v_uid          UUID := auth.uid();
  v_site         RECORD;
  v_participants UUID[];
  v_used_fallback BOOLEAN;
  v_n            INT;
  v_fee_cents    BIGINT;   -- whole fee in cents
  v_base_cents   BIGINT;   -- floored per-participant share, in cents
  v_remainder    INT;      -- leftover cents (0 .. n-1)
  v_share_cents  BIGINT;
  v_sum_cents    BIGINT;
  v_i            INT;
  v_desc         TEXT;
  v_sites_processed INT := 0;
  v_total        NUMERIC(12,2) := 0;
  v_skipped_ids  UUID[] := '{}';
BEGIN
  -- ── admin gate ──
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali perskaičiuoti payroll periodą.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT year, month, status INTO v_year, v_month, v_status
  FROM public.payroll_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll periodas nerastas (id=%).', p_period_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- ── abort on locked ──
  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'Periodas užrakintas — perskaičiuoti negalima.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- ── wipe previous auto rows (guarded by the transaction-local flag) ──
  SET LOCAL app.allow_auto_ledger_delete = 'on';
  DELETE FROM public.earnings_entries
  WHERE period_id = p_period_id AND source = 'auto';
  SET LOCAL app.allow_auto_ledger_delete = 'off';

  -- ── completed sites in this month that are MISSING a fee → reported, skipped ──
  SELECT COALESCE(array_agg(s.id), '{}')
  INTO v_skipped_ids
  FROM public.sites s
  WHERE s.status = 'completed'
    AND s.actual_end IS NOT NULL
    AND EXTRACT(YEAR  FROM (s.actual_end AT TIME ZONE 'Europe/Vilnius')) = v_year
    AND EXTRACT(MONTH FROM (s.actual_end AT TIME ZONE 'Europe/Vilnius')) = v_month
    AND NOT EXISTS (
      SELECT 1 FROM public.site_compensation sc WHERE sc.site_id = s.id
    );

  -- ── completed sites WITH a fee → split it ──
  FOR v_site IN
    SELECT s.id AS site_id, s.code AS site_code, sc.fixed_fee
    FROM public.sites s
    JOIN public.site_compensation sc ON sc.site_id = s.id
    WHERE s.status = 'completed'
      AND s.actual_end IS NOT NULL
      AND EXTRACT(YEAR  FROM (s.actual_end AT TIME ZONE 'Europe/Vilnius')) = v_year
      AND EXTRACT(MONTH FROM (s.actual_end AT TIME ZONE 'Europe/Vilnius')) = v_month
    ORDER BY s.id
  LOOP
    -- Participants = DISTINCT installers with >= 1 CLOSED time_entry, lowest id first.
    SELECT array_agg(DISTINCT te.installer_id ORDER BY te.installer_id)
    INTO v_participants
    FROM public.time_entries te
    WHERE te.site_id = v_site.site_id
      AND te.end_time IS NOT NULL;

    v_used_fallback := FALSE;

    -- Fallback: no closed time entries → use the site's assignments instead.
    IF v_participants IS NULL OR array_length(v_participants, 1) IS NULL THEN
      SELECT array_agg(DISTINCT sa.installer_id ORDER BY sa.installer_id)
      INTO v_participants
      FROM public.site_assignments sa
      WHERE sa.site_id = v_site.site_id;
      v_used_fallback := TRUE;
    END IF;

    -- Nobody to pay (no time entries AND no assignments) → leave it for a human.
    IF v_participants IS NULL OR array_length(v_participants, 1) IS NULL THEN
      CONTINUE;
    END IF;

    v_n          := array_length(v_participants, 1);
    v_fee_cents  := ROUND(v_site.fixed_fee * 100)::BIGINT;   -- exact: fee has 2 dp
    v_base_cents := v_fee_cents / v_n;                        -- floor (fee >= 0)
    v_remainder  := (v_fee_cents - v_base_cents * v_n)::INT;  -- 0 .. n-1

    v_desc := 'Objekto ' || v_site.site_code || ' atlygio dalis';
    IF v_used_fallback THEN
      v_desc := v_desc || ' [be laiko įrašų]';
    END IF;

    -- Insert one share per participant. The LOWEST installer_id (index 1, since the
    -- array is sorted) absorbs ALL the remainder cents.
    v_sum_cents := 0;
    FOR v_i IN 1 .. v_n LOOP
      v_share_cents := v_base_cents + CASE WHEN v_i = 1 THEN v_remainder ELSE 0 END;

      INSERT INTO public.earnings_entries
        (period_id, installer_id, site_id, entry_type, amount, description, source, created_by)
      VALUES
        (p_period_id, v_participants[v_i], v_site.site_id, 'site_share',
         (v_share_cents::NUMERIC) / 100, v_desc, 'auto', v_uid);

      v_sum_cents := v_sum_cents + v_share_cents;
    END LOOP;

    -- Hard invariant: the shares must reconstruct the fee to the exact cent.
    IF v_sum_cents <> v_fee_cents THEN
      RAISE EXCEPTION 'Apvalinimo invariantas pažeistas objektui %: shares=% ct, fee=% ct.',
        v_site.site_id, v_sum_cents, v_fee_cents;
    END IF;

    v_sites_processed := v_sites_processed + 1;
    v_total           := v_total + v_site.fixed_fee;
  END LOOP;

  RETURN jsonb_build_object(
    'period_id',                 p_period_id,
    'sites_processed',           v_sites_processed,
    'sites_skipped_missing_fee', to_jsonb(v_skipped_ids),
    'skipped_count',             COALESCE(array_length(v_skipped_ids, 1), 0),
    'total_amount',              v_total
  );
END;
$$;

-- ════════════════════════════════════════════════════════════
-- 6. RPC lock_period(p_period_id)
--    Freezes a period — but only once every completed site has a fee.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.lock_period(p_period_id UUID)
RETURNS public.payroll_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year    INT;
  v_month   INT;
  v_status  TEXT;
  v_missing UUID[];
  v_row     public.payroll_periods;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali užrakinti payroll periodą.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT year, month, status INTO v_year, v_month, v_status
  FROM public.payroll_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll periodas nerastas (id=%).', p_period_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Idempotent: already locked → return as-is.
  IF v_status = 'locked' THEN
    SELECT * INTO v_row FROM public.payroll_periods WHERE id = p_period_id;
    RETURN v_row;
  END IF;

  -- Refuse if any completed site in the month has no fee set.
  SELECT COALESCE(array_agg(s.id), '{}')
  INTO v_missing
  FROM public.sites s
  WHERE s.status = 'completed'
    AND s.actual_end IS NOT NULL
    AND EXTRACT(YEAR  FROM (s.actual_end AT TIME ZONE 'Europe/Vilnius')) = v_year
    AND EXTRACT(MONTH FROM (s.actual_end AT TIME ZONE 'Europe/Vilnius')) = v_month
    AND NOT EXISTS (
      SELECT 1 FROM public.site_compensation sc WHERE sc.site_id = s.id
    );

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Negalima užrakinti: % užbaigtų objektų be site_compensation: %.',
      array_length(v_missing, 1), v_missing
      USING ERRCODE = 'restrict_violation';
  END IF;

  UPDATE public.payroll_periods
  SET status    = 'locked',
      locked_by = auth.uid(),
      locked_at = NOW()
  WHERE id = p_period_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ── RPC grants (functions self-check is_admin()) ──────────────
REVOKE ALL ON FUNCTION public.recalculate_period(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_period(UUID)         FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_period(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_period(UUID)         TO authenticated;

-- ============================================================
-- END migration.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- TEST: rounding invariant — fee 1000.00 split among 3 participants
-- ────────────────────────────────────────────────────────────
-- Mirrors the exact cents arithmetic in recalculate_period():
--   fee_cents  = 100000
--   base_cents = 100000 / 3 = 33333   (floor)
--   remainder  = 100000 - 33333*3 = 1 cent  → goes to lowest installer_id
--   shares     = [333.34, 333.33, 333.33]  → sum = 1000.00  ✓
--
-- Plain-SQL self-check (run in psql; raises if the invariant ever breaks):
--
-- DO $test$
-- DECLARE
--   fee        NUMERIC(10,2) := 1000.00;
--   n          INT           := 3;
--   fee_cents  BIGINT        := ROUND(fee * 100);          -- 100000
--   base_cents BIGINT        := fee_cents / n;             -- 33333
--   remainder  INT           := (fee_cents - base_cents*n)::INT;  -- 1
--   shares     NUMERIC(10,2)[];
--   s          NUMERIC(10,2);
--   total_cts  BIGINT := 0;
-- BEGIN
--   shares := ARRAY[
--     ((base_cents + remainder)::NUMERIC) / 100,  -- lowest id  → 333.34
--     (base_cents::NUMERIC) / 100,                --            → 333.33
--     (base_cents::NUMERIC) / 100                 --            → 333.33
--   ];
--   FOREACH s IN ARRAY shares LOOP total_cts := total_cts + ROUND(s * 100); END LOOP;
--   ASSERT total_cts = fee_cents,
--     format('SUM(shares)=%s ct != fee=%s ct', total_cts, fee_cents);
--   ASSERT shares[1] = 333.34 AND shares[2] = 333.33 AND shares[3] = 333.33,
--     format('unexpected distribution: %s', shares);
--   RAISE NOTICE 'OK  333.34 + 333.33 + 333.33 = 1000.00';
-- END
-- $test$;
--
-- pgTAP equivalent (if the extension is installed):
--   BEGIN;
--   SELECT plan(2);
--   SELECT is( (33334 + 33333 + 33333)::BIGINT, 100000::BIGINT,
--              'shares sum to the fee, to the cent' );
--   SELECT is( ((33334::NUMERIC)/100), 333.34::NUMERIC,
--              'lowest installer_id absorbs the remainder cent' );
--   SELECT * FROM finish();
--   ROLLBACK;
-- ════════════════════════════════════════════════════════════
