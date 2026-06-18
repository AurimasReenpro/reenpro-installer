-- ============================================================
-- Migration: Payroll rate-card engine (Phase 9B — database only)
--
-- Pay model (REPLACES the fixed-fee-per-site model):
--   Completed sites are paid from a CONFIGURABLE rate card. No money is
--   stored on `sites`. Every completed site appears automatically; its
--   payable pool is COMPUTED from payroll_rate_rules at recalc time and
--   frozen into payroll_site_snapshots. The pool is then split equally
--   among the installers who actually worked the site.
--
-- All money is ADMIN-ONLY: every table is gated behind public.is_admin()
-- so installers can never read or write compensation via the API.
--
-- Coexistence: the earlier 20260615120000_payroll_core.sql (fixed-fee
-- `site_compensation` model + recalculate_period()/lock_period()) is LEFT
-- IN PLACE on purpose. This migration adds the rate-card model alongside it
-- using DISTINCT RPC names (recalculate_payroll_period / lock_payroll_period).
--
-- Idempotent + DB-state-agnostic: safe to run whether or not the prior
-- payroll migration was applied. payroll_periods / earnings_entries are
-- created IF NOT EXISTS (full new schema for a fresh DB) and then patched
-- with ALTER ... ADD COLUMN IF NOT EXISTS for the new columns, so the table
-- converges to the required shape either way.
--
-- Money math: INTEGER CENTS only (BIGINT). Never floats. See the
-- "ROUNDING INVARIANT" block in recalculate_payroll_period().
--
-- Month bucketing uses Lithuanian local time ('Europe/Vilnius') so a site
-- closed at 2026-01-31 23:30 +02 lands in January — matching the prior
-- migration byte-for-byte.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 0. Equipment helpers (parse sites.equipment_details JSONB)
--    equipment_details is an EquipmentItem[] in the modern format:
--      [{ "category", "model", "quantity", "unit", "capacity_kwh"? }, ...]
--    Legacy rows may be a JSON object — guarded with jsonb_typeof().
-- ════════════════════════════════════════════════════════════

-- True when any equipment row is an energy-storage / battery unit.
-- Mirrors isBatteryCategory() in src/types/equipment.types.ts.
CREATE OR REPLACE FUNCTION public.payroll_site_has_bess(p_equip jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_equip) = 'array' THEN EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_equip) AS e
      WHERE lower(coalesce(e->>'category','')) = 'bess'
         OR lower(coalesce(e->>'category','')) LIKE '%kaupiklis%'
         OR lower(coalesce(e->>'category','')) LIKE '%baterij%'
         OR lower(coalesce(e->>'category','')) LIKE '%battery%'
    )
    ELSE false
  END;
$$;

-- Total optimizer units across the equipment list. There is no dedicated
-- "Optimizatoriai" category, so we match the model/category text. Quantities
-- are validated against a numeric regex before casting (junk → 0).
CREATE OR REPLACE FUNCTION public.payroll_optimizer_count(p_equip jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN (e->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN GREATEST((e->>'quantity')::numeric, 0)
      ELSE 0
    END
  ), 0)
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_equip) = 'array' THEN p_equip ELSE '[]'::jsonb END
  ) AS e
  WHERE lower(coalesce(e->>'model',''))    LIKE '%optim%'
     OR lower(coalesce(e->>'category','')) LIKE '%optim%';
$$;

-- ════════════════════════════════════════════════════════════
-- 1. payroll_rate_cards — a named, versioned set of pay rules
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.payroll_rate_cards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  valid_from  DATE,
  valid_to    DATE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES public.user_profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════
-- 2. payroll_rate_rules — the individual lines of a rate card
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.payroll_rate_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id UUID NOT NULL REFERENCES public.payroll_rate_cards(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  label        TEXT NOT NULL,
  rule_type    TEXT NOT NULL CHECK (rule_type IN (
                 'base_site_fee',
                 'kwp_band',
                 'bess_fixed',
                 'optimizer_per_unit',
                 'inverter_extra',
                 'efficiency_bonus',
                 'quality_bonus',
                 'manual_template'
               )),
  amount       NUMERIC(10,2) NOT NULL,
  -- Nullable: an explicit NULL passes the check (x IN (...) is unknown for NULL).
  unit         TEXT CHECK (unit IS NULL OR unit IN ('fixed', 'per_unit', 'percent')),
  params       JSONB NOT NULL DEFAULT '{}',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_rules_card        ON public.payroll_rate_rules(rate_card_id);
CREATE INDEX IF NOT EXISTS idx_rate_rules_card_active ON public.payroll_rate_rules(rate_card_id, rule_type, is_active);

-- ════════════════════════════════════════════════════════════
-- 3. payroll_periods — one accounting month
--    Created with the full new schema on a fresh DB; if the prior migration
--    already made this table, only rate_card_id is added.
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year         INT  NOT NULL,
  month        INT  NOT NULL CHECK (month BETWEEN 1 AND 12),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'review', 'locked')),
  rate_card_id UUID REFERENCES public.payroll_rate_cards(id),
  locked_by    UUID REFERENCES public.user_profiles(id),
  locked_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month)
);
-- Patch path for a DB where the prior migration already created the table.
ALTER TABLE public.payroll_periods
  ADD COLUMN IF NOT EXISTS rate_card_id UUID REFERENCES public.payroll_rate_cards(id);

-- ════════════════════════════════════════════════════════════
-- 4. payroll_site_snapshots — frozen per-site calculation for a period
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.payroll_site_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id             UUID NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  site_id               UUID REFERENCES public.sites(id),
  included              BOOLEAN NOT NULL DEFAULT true,
  participant_ids       JSONB NOT NULL DEFAULT '[]',
  -- ── Manual-override fields. Owned by the admin RPCs; recalc PRESERVES these
  --    (it never writes participant_override_ids / is_manually_excluded /
  --    manual_note). participant_source records where participants came from. ──
  is_manually_excluded     BOOLEAN NOT NULL DEFAULT false,
  participant_source       TEXT NOT NULL DEFAULT 'auto'
                           CHECK (participant_source IN ('auto', 'time_entries', 'assignments', 'manual')),
  participant_override_ids JSONB,
  manual_note              TEXT,
  warnings                 JSONB NOT NULL DEFAULT '[]',
  recalculated_at          TIMESTAMPTZ,
  base_amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
  addon_amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  bonus_amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  deduction_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_pool            NUMERIC(10,2) NOT NULL DEFAULT 0,
  calculation_breakdown JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (period_id, site_id)
);
CREATE INDEX IF NOT EXISTS idx_site_snapshots_period ON public.payroll_site_snapshots(period_id);

-- ════════════════════════════════════════════════════════════
-- 5. earnings_entries — APPEND-ONLY ledger
--    Fresh DB: full new schema (links to a site snapshot). Prior-migration DB:
--    table already exists (with site_id) — we just add site_snapshot_id.
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.earnings_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id        UUID NOT NULL REFERENCES public.payroll_periods(id),
  site_snapshot_id UUID REFERENCES public.payroll_site_snapshots(id),
  installer_id     UUID NOT NULL REFERENCES public.user_profiles(id),
  entry_type       TEXT NOT NULL CHECK (entry_type IN ('site_share', 'bonus', 'deduction', 'adjustment')),
  amount           NUMERIC(10,2) NOT NULL,
  source           TEXT NOT NULL CHECK (source IN ('auto', 'manual')),
  description      TEXT NOT NULL,
  created_by       UUID REFERENCES public.user_profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Patch path: add the snapshot link on a prior-migration DB (where the table
-- already exists with the old site_id column). The old column is left intact.
ALTER TABLE public.earnings_entries
  ADD COLUMN IF NOT EXISTS site_snapshot_id UUID REFERENCES public.payroll_site_snapshots(id);

CREATE INDEX IF NOT EXISTS idx_earnings_entries_period      ON public.earnings_entries(period_id);
CREATE INDEX IF NOT EXISTS idx_earnings_entries_installer   ON public.earnings_entries(installer_id);
CREATE INDEX IF NOT EXISTS idx_earnings_entries_snapshot    ON public.earnings_entries(site_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_earnings_entries_period_auto ON public.earnings_entries(period_id, source);

-- ── 5a. Append-only guards (idempotent; reused from the prior migration) ──────
-- UPDATE is never allowed: fix mistakes with a reversal entry, not an edit.
CREATE OR REPLACE FUNCTION public.earnings_entries_block_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'earnings_entries yra tik papildomas žurnalas: redaguoti negalima — klaidos taisomos atvirkštiniais (reversal) įrašais.'
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- DELETE is blocked too, with ONE exception: a recalc may remove its own
-- source='auto' rows. The recalc RPC sets a transaction-local GUC right before
-- its DELETE; nothing else can forge it, and SET LOCAL evaporates at COMMIT.
-- current_setting(..., true) returns NULL when the flag is unset.
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

-- ── 5b. Snapshot lock guard ───────────────────────────────────────────────────
-- payroll_site_snapshots is immutable once its period is LOCKED. The ONLY way
-- to write while locked is through the internal recalc, which raises the
-- transaction-local app.allow_snapshot_write flag — but recalc also refuses to
-- run on a locked period, so in practice snapshots are only ever written before
-- lock. The flag is belt-and-suspenders for the "internal function" carve-out.
CREATE OR REPLACE FUNCTION public.payroll_snapshots_guard_locked()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status TEXT;
  v_period UUID;
BEGIN
  v_period := COALESCE(NEW.period_id, OLD.period_id);
  SELECT status INTO v_status FROM public.payroll_periods WHERE id = v_period;
  IF v_status = 'locked'
     AND COALESCE(current_setting('app.allow_snapshot_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Periodas užrakintas (locked): payroll_site_snapshots keisti negalima.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshots_guard_locked ON public.payroll_site_snapshots;
CREATE TRIGGER trg_snapshots_guard_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_site_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.payroll_snapshots_guard_locked();

-- ════════════════════════════════════════════════════════════
-- 6. RLS — admin-only on every payroll table
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.payroll_rate_cards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_rate_rules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_site_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earnings_entries        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_rate_cards tik adminams" ON public.payroll_rate_cards;
CREATE POLICY "payroll_rate_cards tik adminams" ON public.payroll_rate_cards
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "payroll_rate_rules tik adminams" ON public.payroll_rate_rules;
CREATE POLICY "payroll_rate_rules tik adminams" ON public.payroll_rate_rules
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "payroll_periods tik adminams" ON public.payroll_periods;
CREATE POLICY "payroll_periods tik adminams" ON public.payroll_periods
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "payroll_site_snapshots tik adminams" ON public.payroll_site_snapshots;
CREATE POLICY "payroll_site_snapshots tik adminams" ON public.payroll_site_snapshots
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "earnings_entries tik adminams" ON public.earnings_entries;
CREATE POLICY "earnings_entries tik adminams" ON public.earnings_entries
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Grants. RLS still gates every row to admins. earnings_entries gets NO
-- UPDATE/DELETE for the API role (append-only) — the recalc deletes its own auto
-- rows via SECURITY DEFINER (table owner), which bypasses column/row grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_rate_cards     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_rate_rules     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_periods        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_site_snapshots TO authenticated;
GRANT SELECT, INSERT                 ON public.earnings_entries        TO authenticated;

-- ════════════════════════════════════════════════════════════
-- 6.5 Indexes that the recalc + payroll UI lean on
-- ════════════════════════════════════════════════════════════
-- Recalc scans completed sites by month, then participants/hours per site.
CREATE INDEX IF NOT EXISTS idx_sites_status_actual_end
  ON public.sites(status, actual_end);
CREATE INDEX IF NOT EXISTS idx_time_entries_site_installer_end
  ON public.time_entries(site_id, installer_id, end_time);
CREATE INDEX IF NOT EXISTS idx_site_assignments_site_installer
  ON public.site_assignments(site_id, installer_id);
-- payroll_site_snapshots(period_id, site_id) is ALREADY provided by the table's
-- UNIQUE (period_id, site_id) constraint index — no separate index needed.
CREATE INDEX IF NOT EXISTS idx_site_snapshots_period_excluded
  ON public.payroll_site_snapshots(period_id, is_manually_excluded);
CREATE INDEX IF NOT EXISTS idx_earnings_entries_period_installer
  ON public.earnings_entries(period_id, installer_id);
-- earnings_entries(site_snapshot_id) already exists above as
-- idx_earnings_entries_snapshot — kept here for the checklist's completeness.
CREATE INDEX IF NOT EXISTS idx_rate_rules_card_isactive
  ON public.payroll_rate_rules(rate_card_id, is_active);

-- ════════════════════════════════════════════════════════════
-- 7. RPC recalculate_payroll_period(p_year, p_month, p_rate_card_id)
--    Rebuilds auto site_share earnings + per-site snapshots for one month.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.recalculate_payroll_period(
  p_year         INT,
  p_month        INT,
  p_rate_card_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID := auth.uid();
  v_period_id       UUID;
  v_status          TEXT;
  v_site            RECORD;
  v_participants    UUID[];
  v_override        JSONB;     -- snapshot.participant_override_ids (preserved)
  v_excluded        BOOLEAN;   -- snapshot.is_manually_excluded (preserved)
  v_source          TEXT;      -- where the participants came from
  v_used_fallback   BOOLEAN;
  v_included        BOOLEAN;
  v_n               INT;
  v_snapshot_id     UUID;
  v_kept_site_ids   UUID[] := '{}';

  -- Rule counts + amounts. Money is INTEGER CENTS (BIGINT) — never floats.
  v_n_base          INT;
  v_n_bess          INT;
  v_n_opt           INT;
  v_base_cents      BIGINT;
  v_bess_amt_cents  BIGINT;   -- bess_fixed rate sum (applied only if has_bess)
  v_bess_cents      BIGINT;
  v_opt_unit_cents  BIGINT;   -- per-unit optimizer rate (cents)
  v_opt_cents       BIGINT;
  v_eff_cents       BIGINT;
  v_pool_cents      BIGINT;

  -- Per-site derived facts.
  v_has_bess        BOOLEAN;
  v_opt_count       NUMERIC;
  v_actual_hours    NUMERIC;
  v_target_hours    NUMERIC;
  v_eff_applies     BOOLEAN;

  -- efficiency_bonus rule (amount + params drive the target-hours calc).
  v_eff_amount      NUMERIC(10,2);
  v_eff_params      JSONB;

  -- Equal-split bookkeeping (cents).
  v_share_base      BIGINT;
  v_remainder       INT;
  v_share_cents     BIGINT;
  v_sum_cents       BIGINT;
  v_i               INT;
  v_desc            TEXT;

  v_site_warnings   JSONB;     -- warnings for the CURRENT site (persisted)
  v_breakdown       JSONB;
  v_processed       INT := 0;
  v_skipped         INT := 0;
  v_total_entries   INT := 0;
  v_total_pool_c    BIGINT := 0;     -- sum of distributed pools (cents)
  v_warnings        JSONB := '[]'::jsonb;
BEGIN
  -- ── admin gate ──
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali perskaičiuoti payroll periodą.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Netinkamas mėnuo: %.', p_month USING ERRCODE = 'check_violation';
  END IF;

  -- ── rate card must exist ──
  IF NOT EXISTS (SELECT 1 FROM public.payroll_rate_cards WHERE id = p_rate_card_id) THEN
    RAISE EXCEPTION 'Tarifų kortelė nerasta (rate_card_id=%).', p_rate_card_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- ── create or reuse the period; refuse if locked ──
  SELECT id, status INTO v_period_id, v_status
  FROM public.payroll_periods
  WHERE year = p_year AND month = p_month;

  IF FOUND THEN
    IF v_status = 'locked' THEN
      RAISE EXCEPTION 'Periodas užrakintas — perskaičiuoti negalima.'
        USING ERRCODE = 'restrict_violation';
    END IF;
    UPDATE public.payroll_periods
      SET rate_card_id = p_rate_card_id
      WHERE id = v_period_id;
  ELSE
    INSERT INTO public.payroll_periods (year, month, status, rate_card_id)
    VALUES (p_year, p_month, 'open', p_rate_card_id)
    ON CONFLICT (year, month) DO UPDATE SET rate_card_id = EXCLUDED.rate_card_id
    RETURNING id INTO v_period_id;
  END IF;

  -- Pre-load the efficiency_bonus rule (first active one on this card).
  SELECT amount, params INTO v_eff_amount, v_eff_params
  FROM public.payroll_rate_rules
  WHERE rate_card_id = p_rate_card_id AND is_active AND rule_type = 'efficiency_bonus'
  ORDER BY created_at
  LIMIT 1;

  -- ── wipe previous AUTO earnings for this period (guarded by the GUC flag).
  --    Snapshots are NOT deleted (manual entries may reference them and the
  --    ledger is append-only, so a SET NULL cascade would be blocked); they are
  --    upserted below instead. ──
  PERFORM set_config('app.allow_auto_ledger_delete', 'on', true);
  DELETE FROM public.earnings_entries
  WHERE period_id = v_period_id AND source = 'auto';
  PERFORM set_config('app.allow_auto_ledger_delete', 'off', true);

  -- Allow snapshot writes for the remainder of this transaction.
  PERFORM set_config('app.allow_snapshot_write', 'on', true);

  -- ── iterate completed sites whose actual_end falls in the month (local tz) ──
  FOR v_site IN
    SELECT s.id AS site_id, s.code AS site_code, s.kwp, s.equipment_details
    FROM public.sites s
    WHERE s.status = 'completed'
      AND s.actual_end IS NOT NULL
      AND EXTRACT(YEAR  FROM (s.actual_end AT TIME ZONE 'Europe/Vilnius')) = p_year
      AND EXTRACT(MONTH FROM (s.actual_end AT TIME ZONE 'Europe/Vilnius')) = p_month
    ORDER BY s.id
  LOOP
    v_kept_site_ids := array_append(v_kept_site_ids, v_site.site_id);
    v_site_warnings := '[]'::jsonb;

    -- Preserve any manual override / exclusion already stored on this snapshot.
    -- (No row yet on the first recalc → both stay NULL/false.)
    SELECT participant_override_ids, COALESCE(is_manually_excluded, false)
    INTO v_override, v_excluded
    FROM public.payroll_site_snapshots
    WHERE period_id = v_period_id AND site_id = v_site.site_id;
    v_excluded := COALESCE(v_excluded, false);

    -- Resolve participants + their source. A manual override always wins.
    v_used_fallback := FALSE;
    IF v_override IS NOT NULL THEN
      SELECT array_agg(val::uuid ORDER BY val::uuid)
      INTO v_participants
      FROM jsonb_array_elements_text(v_override) AS t(val);
      v_source := 'manual';
      v_site_warnings := v_site_warnings
        || to_jsonb('Naudotas rankinis dalyvių sąrašas (override).'::text);
    ELSE
      -- Participants = DISTINCT installers with >= 1 CLOSED time_entry, sorted.
      SELECT array_agg(DISTINCT te.installer_id ORDER BY te.installer_id)
      INTO v_participants
      FROM public.time_entries te
      WHERE te.site_id = v_site.site_id
        AND te.end_time IS NOT NULL;

      IF v_participants IS NOT NULL AND array_length(v_participants, 1) IS NOT NULL THEN
        v_source := 'time_entries';
      ELSE
        -- Fallback: no closed time entries → use the site's assignments.
        SELECT array_agg(DISTINCT sa.installer_id ORDER BY sa.installer_id)
        INTO v_participants
        FROM public.site_assignments sa
        WHERE sa.site_id = v_site.site_id;

        IF v_participants IS NOT NULL AND array_length(v_participants, 1) IS NOT NULL THEN
          v_source := 'assignments';
          v_used_fallback := TRUE;
          v_site_warnings := v_site_warnings
            || to_jsonb('Nėra uždarytų laiko įrašų — naudoti priskirti montuotojai.'::text);
        ELSE
          v_source := 'auto';  -- nothing resolved → initial/default state
        END IF;
      END IF;
    END IF;

    v_n := COALESCE(array_length(v_participants, 1), 0);

    -- ── derive per-site facts ──
    v_has_bess  := public.payroll_site_has_bess(v_site.equipment_details);
    v_opt_count := public.payroll_optimizer_count(v_site.equipment_details);

    SELECT COALESCE(SUM(
             COALESCE(te.duration_minutes, EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 60.0)
           ), 0) / 60.0
    INTO v_actual_hours
    FROM public.time_entries te
    WHERE te.site_id = v_site.site_id AND te.end_time IS NOT NULL;

    -- ── rule counts + amounts for this card, in CENTS, in ONE pass ──
    SELECT
      COUNT(*) FILTER (WHERE rule_type = 'base_site_fee'),
      COALESCE(SUM(ROUND(amount * 100)) FILTER (WHERE rule_type = 'base_site_fee'), 0),
      COUNT(*) FILTER (WHERE rule_type = 'bess_fixed'),
      COALESCE(SUM(ROUND(amount * 100)) FILTER (WHERE rule_type = 'bess_fixed'), 0),
      COUNT(*) FILTER (WHERE rule_type = 'optimizer_per_unit'),
      COALESCE(SUM(ROUND(amount * 100)) FILTER (WHERE rule_type = 'optimizer_per_unit'), 0)
    INTO v_n_base, v_base_cents, v_n_bess, v_bess_amt_cents, v_n_opt, v_opt_unit_cents
    FROM public.payroll_rate_rules
    WHERE rate_card_id = p_rate_card_id AND is_active;

    IF v_n_base = 0 THEN
      v_site_warnings := v_site_warnings
        || to_jsonb('Nėra aktyvios base_site_fee taisyklės — bazinis mokestis 0.'::text);
    END IF;

    -- bess_fixed: applied only when the site has an energy-storage unit.
    v_bess_cents := 0;
    IF v_has_bess THEN
      IF v_n_bess = 0 THEN
        v_site_warnings := v_site_warnings
          || to_jsonb('Aptiktas BESS, bet nėra aktyvios bess_fixed taisyklės.'::text);
      ELSE
        v_bess_cents := v_bess_amt_cents;
      END IF;
    END IF;

    -- optimizer_per_unit: per-unit rate × optimizer count (integer cents).
    v_opt_cents := 0;
    IF v_opt_count > 0 THEN
      IF v_n_opt = 0 THEN
        v_site_warnings := v_site_warnings
          || to_jsonb('Aptikti optimizatoriai, bet nėra aktyvios optimizer_per_unit taisyklės.'::text);
      ELSE
        v_opt_cents := ROUND(v_opt_unit_cents * v_opt_count);
      END IF;
    END IF;

    -- efficiency_bonus: flat amount when actual hours <= target hours.
    -- Target hours are CONFIGURABLE via the rule's params:
    --   {"target_hours": 8}            → fixed target, or
    --   {"target_hours_per_kwp": 1.5}  → target = site.kwp × 1.5
    -- With neither key, the target is undefined → the bonus is skipped (warned).
    v_eff_cents   := 0;
    v_eff_applies := FALSE;
    v_target_hours := NULL;
    IF v_eff_amount IS NOT NULL THEN
      IF v_eff_params ? 'target_hours' THEN
        v_target_hours := (v_eff_params->>'target_hours')::numeric;
      ELSIF v_eff_params ? 'target_hours_per_kwp' THEN
        v_target_hours := COALESCE(v_site.kwp, 0) * (v_eff_params->>'target_hours_per_kwp')::numeric;
      END IF;

      IF v_target_hours IS NULL THEN
        v_site_warnings := v_site_warnings
          || to_jsonb('efficiency_bonus praleistas — trūksta target_hours / target_hours_per_kwp.'::text);
      ELSIF v_actual_hours <= v_target_hours THEN
        v_eff_cents   := ROUND(v_eff_amount * 100);
        v_eff_applies := TRUE;
      END IF;
    END IF;

    v_pool_cents := v_base_cents + v_bess_cents + v_opt_cents + v_eff_cents;
    v_included   := NOT v_excluded;

    -- Exclusion / zero-participant notes (also persisted into the snapshot).
    IF v_excluded THEN
      v_site_warnings := v_site_warnings
        || to_jsonb('Objektas rankiniu būdu pašalintas iš atlygio — auto įrašai nekuriami.'::text);
    ELSIF v_n = 0 THEN
      v_site_warnings := v_site_warnings
        || to_jsonb('Nėra dalyvių — objektas praleistas, atlygis nepaskirstytas.'::text);
    END IF;

    -- ── breakdown JSON (audit trail of exactly what was applied) ──
    v_breakdown := jsonb_build_object(
      'rate_card_id',             p_rate_card_id,
      'participant_source',       v_source,
      'manually_excluded',        v_excluded,
      'has_bess',                 v_has_bess,
      'optimizer_count',          v_opt_count,
      'actual_hours',             round(v_actual_hours, 2),
      'target_hours',             v_target_hours,
      'efficiency_applies',       v_eff_applies,
      'used_assignment_fallback', v_used_fallback,
      'participant_count',        v_n,
      'components_cents', jsonb_build_object(
        'base_site_fee',      v_base_cents,
        'bess_fixed',         v_bess_cents,
        'optimizer_per_unit', v_opt_cents,
        'efficiency_bonus',   v_eff_cents
      ),
      'pool_cents',               v_pool_cents
    );

    -- ── upsert the snapshot. Recalc OWNS the computed columns but NEVER the
    --    manual-override columns: participant_override_ids, is_manually_excluded
    --    and manual_note are deliberately absent from both the INSERT column list
    --    (they take table defaults on a brand-new row) and the DO UPDATE SET list
    --    (so an existing admin override/exclusion/note survives recalculation). ──
    INSERT INTO public.payroll_site_snapshots AS ss
      (period_id, site_id, included, participant_ids, participant_source,
       base_amount, addon_amount, bonus_amount, deduction_amount,
       total_pool, calculation_breakdown, warnings, recalculated_at)
    VALUES
      (v_period_id, v_site.site_id, v_included,
       to_jsonb(COALESCE(v_participants, '{}'::uuid[])), v_source,
       (v_base_cents)::numeric / 100,
       (v_bess_cents + v_opt_cents)::numeric / 100,
       (v_eff_cents)::numeric / 100,
       0,
       (v_pool_cents)::numeric / 100,
       v_breakdown, v_site_warnings, NOW())
    ON CONFLICT (period_id, site_id) DO UPDATE
      SET included              = EXCLUDED.included,
          participant_ids       = EXCLUDED.participant_ids,
          participant_source    = EXCLUDED.participant_source,
          base_amount           = EXCLUDED.base_amount,
          addon_amount          = EXCLUDED.addon_amount,
          bonus_amount          = EXCLUDED.bonus_amount,
          deduction_amount      = EXCLUDED.deduction_amount,
          total_pool            = EXCLUDED.total_pool,
          calculation_breakdown = EXCLUDED.calculation_breakdown,
          warnings              = EXCLUDED.warnings,
          recalculated_at       = EXCLUDED.recalculated_at
    RETURNING ss.id INTO v_snapshot_id;

    -- Mirror this site's warnings into the RPC return list, tagged with the code.
    IF jsonb_array_length(v_site_warnings) > 0 THEN
      SELECT v_warnings
             || COALESCE(jsonb_agg(format('Objektas %s: %s', v_site.site_code, w.value)), '[]'::jsonb)
      INTO v_warnings
      FROM jsonb_array_elements_text(v_site_warnings) AS w(value);
    END IF;

    -- ── pay nobody for excluded or participant-less sites; snapshot stays ──
    IF v_excluded OR v_n = 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- ════════════════════════════════════════════════════════
    -- ROUNDING INVARIANT (equal split, exact to the cent)
    --   pool_cents is an integer. Floor-divide by N for the base share;
    --   the leftover 0..N-1 cents are ALL handed to the lowest installer_id
    --   (array index 1, since v_participants is sorted ascending). Therefore
    --   SUM(shares) == pool_cents EXACTLY — asserted right after the loop.
    --   No floating point is ever involved.
    -- ════════════════════════════════════════════════════════
    v_share_base := v_pool_cents / v_n;                       -- floor (pool >= 0)
    v_remainder  := (v_pool_cents - v_share_base * v_n)::INT; -- 0 .. N-1

    v_desc := 'Objekto ' || v_site.site_code || ' atlygio dalis';
    IF v_source = 'manual' THEN
      v_desc := v_desc || ' [rankinis dalyvių sąrašas]';
    ELSIF v_used_fallback THEN
      v_desc := v_desc || ' [be laiko įrašų]';
    END IF;

    v_sum_cents := 0;
    FOR v_i IN 1 .. v_n LOOP
      v_share_cents := v_share_base + CASE WHEN v_i = 1 THEN v_remainder ELSE 0 END;

      INSERT INTO public.earnings_entries
        (period_id, site_snapshot_id, installer_id, entry_type, amount, source, description, created_by)
      VALUES
        (v_period_id, v_snapshot_id, v_participants[v_i], 'site_share',
         (v_share_cents)::numeric / 100, 'auto', v_desc, v_uid);

      v_sum_cents     := v_sum_cents + v_share_cents;
      v_total_entries := v_total_entries + 1;
    END LOOP;

    -- Hard invariant: shares must reconstruct the pool to the exact cent.
    IF v_sum_cents <> v_pool_cents THEN
      RAISE EXCEPTION 'Apvalinimo invariantas pažeistas objektui %: shares=% ct, pool=% ct.',
        v_site.site_id, v_sum_cents, v_pool_cents;
    END IF;

    v_processed    := v_processed + 1;
    v_total_pool_c := v_total_pool_c + v_pool_cents;
  END LOOP;

  -- Stale snapshots: sites that no longer qualify this month (e.g. reopened)
  -- are marked excluded so lock_payroll_period() ignores them. We keep the rows
  -- (manual entries may reference them) but they no longer block the lock.
  UPDATE public.payroll_site_snapshots
  SET included = FALSE
  WHERE period_id = v_period_id
    AND NOT (site_id = ANY (v_kept_site_ids));

  PERFORM set_config('app.allow_snapshot_write', 'off', true);

  -- After a successful recalc the period moves to 'review' (unless locked —
  -- impossible here, since recalc refuses to run on a locked period).
  UPDATE public.payroll_periods
  SET status = 'review'
  WHERE id = v_period_id AND status <> 'locked';

  RETURN jsonb_build_object(
    'period_id',       v_period_id,
    'year',            p_year,
    'month',           p_month,
    'rate_card_id',    p_rate_card_id,
    'processed_sites', v_processed,
    'skipped_sites',   v_skipped,
    'total_pool',      (v_total_pool_c)::numeric / 100,
    'total_entries',   v_total_entries,
    'warnings',        v_warnings
  );
END;
$$;

-- ════════════════════════════════════════════════════════════
-- 8. RPC lock_payroll_period(p_period_id)
--    Freezes a period once it has snapshots and every included site has
--    at least one participant.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.lock_payroll_period(p_period_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status      TEXT;
  v_snap_count  INT;
  v_missing     UUID[];
  v_row         public.payroll_periods;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali užrakinti payroll periodą.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status INTO v_status FROM public.payroll_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll periodas nerastas (id=%).', p_period_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Idempotent: already locked → return as-is.
  IF v_status = 'locked' THEN
    SELECT * INTO v_row FROM public.payroll_periods WHERE id = p_period_id;
    RETURN to_jsonb(v_row);
  END IF;

  -- Refuse if there are no snapshots at all (nothing was recalculated).
  SELECT COUNT(*) INTO v_snap_count
  FROM public.payroll_site_snapshots WHERE period_id = p_period_id;
  IF v_snap_count = 0 THEN
    RAISE EXCEPTION 'Negalima užrakinti: periodas neturi jokių objektų momentinių kopijų (snapshots). Pirma perskaičiuokite.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Refuse if any INCLUDED site has zero participants.
  SELECT COALESCE(array_agg(site_id), '{}')
  INTO v_missing
  FROM public.payroll_site_snapshots
  WHERE period_id = p_period_id
    AND included = TRUE
    AND jsonb_array_length(participant_ids) = 0;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Negalima užrakinti: % įtrauktų objektų be dalyvių: %.',
      array_length(v_missing, 1), v_missing
      USING ERRCODE = 'restrict_violation';
  END IF;

  UPDATE public.payroll_periods
  SET status    = 'locked',
      locked_by = auth.uid(),
      locked_at = NOW()
  WHERE id = p_period_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

-- ── RPC grants (functions self-check is_admin()) ──────────────
REVOKE ALL ON FUNCTION public.recalculate_payroll_period(INT, INT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_payroll_period(UUID)                   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_payroll_period(INT, INT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_payroll_period(UUID)                   TO authenticated;

-- ════════════════════════════════════════════════════════════
-- 9. Safe admin-only RPCs for the future payroll UI
--    Every function: admin-gated via public.is_admin(), SECURITY DEFINER,
--    SET search_path = public, EXECUTE granted to authenticated only and
--    revoked from PUBLIC (which covers anon). Manual override columns are the
--    ONLY way to change participants/exclusion; the ledger stays append-only.
-- ════════════════════════════════════════════════════════════

-- ── 9A. set_payroll_site_included — exclude/include a site (keeps the row) ──
CREATE OR REPLACE FUNCTION public.set_payroll_site_included(
  p_period_id UUID,
  p_site_id   UUID,
  p_included  BOOLEAN,
  p_reason    TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_row    public.payroll_site_snapshots;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali keisti objekto įtraukimą.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status INTO v_status FROM public.payroll_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll periodas nerastas (id=%).', p_period_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'Periodas užrakintas — keisti negalima.' USING ERRCODE = 'restrict_violation';
  END IF;

  -- Does not delete the snapshot, and does not touch manual earnings.
  UPDATE public.payroll_site_snapshots
  SET is_manually_excluded = NOT p_included,
      included             = p_included,
      manual_note          = p_reason
  WHERE period_id = p_period_id AND site_id = p_site_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Objekto kopija nerasta (period=%, site=%) — pirma perskaičiuokite.', p_period_id, p_site_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

-- ── 9B. set_payroll_site_participants — manual participant override ──
CREATE OR REPLACE FUNCTION public.set_payroll_site_participants(
  p_period_id       UUID,
  p_site_id         UUID,
  p_participant_ids UUID[],
  p_reason          TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status   TEXT;
  v_distinct UUID[];
  v_valid    INT;
  v_row      public.payroll_site_snapshots;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali keisti dalyvius.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status INTO v_status FROM public.payroll_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll periodas nerastas (id=%).', p_period_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'Periodas užrakintas — keisti negalima.' USING ERRCODE = 'restrict_violation';
  END IF;

  IF p_participant_ids IS NULL OR array_length(p_participant_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Reikia bent vieno dalyvio.' USING ERRCODE = 'check_violation';
  END IF;

  -- Deduplicate + sort (sorted order keeps the cent-remainder allocation stable).
  SELECT array_agg(DISTINCT pid ORDER BY pid) INTO v_distinct
  FROM unnest(p_participant_ids) AS pid;

  -- Every participant must be a known installer/admin (the app's role model).
  SELECT COUNT(*) INTO v_valid
  FROM public.user_profiles
  WHERE id = ANY(v_distinct) AND role IN ('admin', 'installer');

  IF v_valid <> array_length(v_distinct, 1) THEN
    RAISE EXCEPTION 'Kai kurie dalyviai neegzistuoja arba neturi montuotojo/administratoriaus rolės.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Store the override; participant_ids mirrors it so the UI updates immediately.
  -- recalculate_payroll_period() reads participant_override_ids and keeps it.
  UPDATE public.payroll_site_snapshots
  SET participant_override_ids = to_jsonb(v_distinct),
      participant_ids          = to_jsonb(v_distinct),
      participant_source       = 'manual',
      manual_note              = p_reason
  WHERE period_id = p_period_id AND site_id = p_site_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Objekto kopija nerasta (period=%, site=%) — pirma perskaičiuokite.', p_period_id, p_site_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

-- ── 9C. add_manual_payroll_entry — bonus / deduction / adjustment ──
CREATE OR REPLACE FUNCTION public.add_manual_payroll_entry(
  p_period_id        UUID,
  p_installer_id     UUID,
  p_site_snapshot_id UUID,
  p_entry_type       TEXT,
  p_amount           NUMERIC,
  p_description      TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_amount NUMERIC(10,2);
  v_row    public.earnings_entries;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali pridėti įrašus.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_entry_type NOT IN ('bonus', 'deduction', 'adjustment') THEN
    RAISE EXCEPTION 'Neleistinas įrašo tipas: % (galima: bonus, deduction, adjustment).', p_entry_type
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT status INTO v_status FROM public.payroll_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll periodas nerastas (id=%).', p_period_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'Periodas užrakintas — naujų įrašų kurti negalima.' USING ERRCODE = 'restrict_violation';
  END IF;

  IF p_description IS NULL OR char_length(btrim(p_description)) < 5 THEN
    RAISE EXCEPTION 'Aprašymas privalomas (bent 5 simboliai).' USING ERRCODE = 'check_violation';
  END IF;

  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'Suma turi būti nelygi nuliui.' USING ERRCODE = 'check_violation';
  END IF;

  -- Sign rules: bonus always positive; deduction ALWAYS stored negative (even if
  -- the UI sends a positive magnitude); adjustment may be positive or negative.
  IF p_entry_type = 'bonus' THEN
    IF p_amount <= 0 THEN
      RAISE EXCEPTION 'Premijos (bonus) suma turi būti teigiama.' USING ERRCODE = 'check_violation';
    END IF;
    v_amount := p_amount;
  ELSIF p_entry_type = 'deduction' THEN
    v_amount := -abs(p_amount);
  ELSE  -- adjustment
    v_amount := p_amount;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = p_installer_id AND role IN ('admin', 'installer')
  ) THEN
    RAISE EXCEPTION 'Nurodytas montuotojas neegzistuoja arba neturi tinkamos rolės.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF p_site_snapshot_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.payroll_site_snapshots
      WHERE id = p_site_snapshot_id AND period_id = p_period_id
    ) THEN
      RAISE EXCEPTION 'Nurodyta objekto kopija nepriklauso šiam periodui.'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  INSERT INTO public.earnings_entries
    (period_id, site_snapshot_id, installer_id, entry_type, amount, source, description, created_by)
  VALUES
    (p_period_id, p_site_snapshot_id, p_installer_id, p_entry_type, v_amount, 'manual',
     btrim(p_description), auth.uid())
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

-- ── 9D. reverse_manual_payroll_entry — storno via opposite-amount adjustment ──
CREATE OR REPLACE FUNCTION public.reverse_manual_payroll_entry(
  p_entry_id UUID,
  p_reason   TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_orig   public.earnings_entries;
  v_status TEXT;
  v_row    public.earnings_entries;
  v_desc   TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali atšaukti įrašus.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_orig FROM public.earnings_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Įrašas nerastas (id=%).', p_entry_id USING ERRCODE = 'no_data_found';
  END IF;

  -- Only MANUAL entries are reversible (auto rows are rebuilt by recalc).
  IF v_orig.source <> 'manual' THEN
    RAISE EXCEPTION 'Atšaukti galima tik rankinius (manual) įrašus.' USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT status INTO v_status FROM public.payroll_periods WHERE id = v_orig.period_id;
  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'Periodas užrakintas — atšaukti negalima.' USING ERRCODE = 'restrict_violation';
  END IF;

  v_desc := format('STORNO: %s — %s', COALESCE(v_orig.description, ''), COALESCE(p_reason, ''));

  -- Append a NEW opposite-amount adjustment; the original is never touched.
  INSERT INTO public.earnings_entries
    (period_id, site_snapshot_id, installer_id, entry_type, amount, source, description, created_by)
  VALUES
    (v_orig.period_id, v_orig.site_snapshot_id, v_orig.installer_id, 'adjustment',
     -v_orig.amount, 'manual', v_desc, auth.uid())
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

-- ── 9E. set_payroll_period_status — guarded open/review/locked transitions ──
CREATE OR REPLACE FUNCTION public.set_payroll_period_status(
  p_period_id UUID,
  p_status    TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current TEXT;
  v_row     public.payroll_periods;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali keisti periodo būseną.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_status NOT IN ('open', 'review', 'locked') THEN
    RAISE EXCEPTION 'Neleistina būsena: % (galima: open, review, locked).', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT status INTO v_current FROM public.payroll_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll periodas nerastas (id=%).', p_period_id USING ERRCODE = 'no_data_found';
  END IF;

  -- A locked period can only be reopened by a dedicated unlock function (not here).
  IF v_current = 'locked' AND p_status <> 'locked' THEN
    RAISE EXCEPTION 'Periodas užrakintas — atrakinti galima tik atskira (unlock) funkcija.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF p_status = 'locked' THEN
    -- Reuse the full lock validation + side effects (snapshots exist, no
    -- included site without participants, sets locked_by / locked_at).
    RETURN public.lock_payroll_period(p_period_id);

  ELSIF p_status = 'review' THEN
    IF v_current NOT IN ('open', 'review') THEN
      RAISE EXCEPTION 'Į „review" galima pereiti tik iš „open".' USING ERRCODE = 'restrict_violation';
    END IF;
    UPDATE public.payroll_periods SET status = 'review' WHERE id = p_period_id RETURNING * INTO v_row;

  ELSE  -- 'open' — allowed only while not locked (already enforced above)
    UPDATE public.payroll_periods SET status = 'open' WHERE id = p_period_id RETURNING * INTO v_row;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

-- ── grants: authenticated only; revoke from PUBLIC (covers anon) ──
REVOKE ALL ON FUNCTION public.set_payroll_site_included(UUID, UUID, BOOLEAN, TEXT)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_payroll_site_participants(UUID, UUID, UUID[], TEXT)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_manual_payroll_entry(UUID, UUID, UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_manual_payroll_entry(UUID, TEXT)                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_payroll_period_status(UUID, TEXT)                     FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_payroll_site_included(UUID, UUID, BOOLEAN, TEXT)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_payroll_site_participants(UUID, UUID, UUID[], TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_manual_payroll_entry(UUID, UUID, UUID, TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_manual_payroll_entry(UUID, TEXT)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_payroll_period_status(UUID, TEXT)                     TO authenticated;

-- ════════════════════════════════════════════════════════════
-- 10. Mark LEGACY fixed-fee objects (from 20260615120000_payroll_core.sql)
--     These are NOT removed (the old frontend still depends on them). The new
--     rate-card RPCs above have distinct names and are the ONLY backend API the
--     future payroll UI should call. Comments are added only if the objects
--     exist, so this is safe whether or not the prior migration was applied.
-- ════════════════════════════════════════════════════════════
DO $legacy$
BEGIN
  IF to_regclass('public.site_compensation') IS NOT NULL THEN
    EXECUTE 'COMMENT ON TABLE public.site_compensation IS '
      || quote_literal('LEGACY (fixed-fee model, 20260615120000). Superseded by payroll_rate_cards/payroll_rate_rules + payroll_site_snapshots. Do not use for new code.');
  END IF;
  IF to_regprocedure('public.recalculate_period(uuid)') IS NOT NULL THEN
    EXECUTE 'COMMENT ON FUNCTION public.recalculate_period(uuid) IS '
      || quote_literal('LEGACY fixed-fee recalc. Superseded by recalculate_payroll_period(int,int,uuid).');
  END IF;
  IF to_regprocedure('public.lock_period(uuid)') IS NOT NULL THEN
    EXECUTE 'COMMENT ON FUNCTION public.lock_period(uuid) IS '
      || quote_literal('LEGACY fixed-fee lock. Superseded by lock_payroll_period(uuid).');
  END IF;
END
$legacy$;

-- ============================================================
-- END migration.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- ROUNDING-INVARIANT SELF-CHECK (illustrative; run in psql if desired)
-- pool 1000.00 split among 3 participants:
--   pool_cents  = 100000
--   share_base  = 100000 / 3 = 33333          (floor)
--   remainder   = 100000 - 33333*3 = 1 cent   → lowest installer_id
--   shares      = [333.34, 333.33, 333.33]    → sum = 1000.00  ✓
--
-- DO $test$
-- DECLARE
--   pool_cents BIGINT := 100000;
--   n          INT    := 3;
--   base       BIGINT := pool_cents / n;                 -- 33333
--   remainder  INT    := (pool_cents - base*n)::INT;     -- 1
--   shares     BIGINT[] := ARRAY[base + remainder, base, base];
--   s          BIGINT; total BIGINT := 0;
-- BEGIN
--   FOREACH s IN ARRAY shares LOOP total := total + s; END LOOP;
--   ASSERT total = pool_cents, format('sum=%s != pool=%s', total, pool_cents);
--   ASSERT shares[1] = 33334, 'lowest installer_id absorbs the remainder cent';
--   RAISE NOTICE 'OK  333.34 + 333.33 + 333.33 = 1000.00';
-- END
-- $test$;
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- SEED (OPTIONAL — COMMENTED OUT ON PURPOSE; DO NOT RUN IN PROD UNCONFIRMED)
-- Sample rate card "Standartinė 2026". Uncomment + run manually in a dev DB
-- (or ask before seeding production). created_by is left NULL here; set it to
-- an admin user_profiles.id if you want attribution.
-- ────────────────────────────────────────────────────────────
-- WITH card AS (
--   INSERT INTO public.payroll_rate_cards (name, valid_from, is_active)
--   VALUES ('Standartinė 2026', '2026-01-01', true)
--   RETURNING id
-- )
-- INSERT INTO public.payroll_rate_rules (rate_card_id, code, label, rule_type, amount, unit, params)
-- SELECT card.id, v.code, v.label, v.rule_type, v.amount, v.unit, v.params
-- FROM card,
--   (VALUES
--     ('BASE',  'Bazinis objekto mokestis', 'base_site_fee',      300.00, 'fixed',    '{}'::jsonb),
--     ('BESS',  'BESS priedas',             'bess_fixed',         150.00, 'fixed',    '{}'::jsonb),
--     ('OPT',   'Optimizatorius (vnt.)',    'optimizer_per_unit',   2.00, 'per_unit', '{}'::jsonb),
--     ('EFF',   'Efektyvumo premija',       'efficiency_bonus',    50.00, 'fixed',    '{"target_hours_per_kwp": 1.2}'::jsonb)
--   ) AS v(code, label, rule_type, amount, unit, params);
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- SMOKE TESTS (illustrative; run in psql against a dev DB)
-- ────────────────────────────────────────────────────────────
-- (a) Equal split 1000.00 / 3 → multiset {333.33, 333.33, 333.34}.
--     The extra cent is deterministic: it goes to the LOWEST installer_id.
-- DO $smoke$
-- DECLARE
--   pool_cents BIGINT := 100000; n INT := 3;
--   base BIGINT := pool_cents / n;                 -- 33333
--   rem  INT    := (pool_cents - base*n)::INT;     -- 1
--   shares NUMERIC[] := ARRAY[(base+rem)::numeric/100, base::numeric/100, base::numeric/100];
--   total NUMERIC := shares[1] + shares[2] + shares[3];
-- BEGIN
--   ASSERT total = 1000.00, format('sum=%s', total);
--   ASSERT shares = ARRAY[333.34, 333.33, 333.33]::NUMERIC[], format('got %s', shares);
--   RAISE NOTICE 'OK split → 333.34, 333.33, 333.33 (multiset 333.33/333.33/333.34), sum 1000.00';
-- END $smoke$;
--
-- (b) A LOCKED period rejects manual inserts (expect SQLSTATE 23001):
-- DO $smoke$
-- DECLARE pid UUID;
-- BEGIN
--   SELECT id INTO pid FROM public.payroll_periods WHERE status = 'locked' LIMIT 1;
--   IF pid IS NULL THEN RAISE NOTICE 'no locked period to test'; RETURN; END IF;
--   BEGIN
--     PERFORM public.add_manual_payroll_entry(pid, gen_random_uuid(), NULL, 'bonus', 10.00, 'testas testas');
--     RAISE EXCEPTION 'FAIL: locked period accepted a manual insert';
--   EXCEPTION WHEN SQLSTATE '23001' OR SQLSTATE '2F004' THEN
--     RAISE NOTICE 'OK locked period rejected the manual insert';
--   END;
-- END $smoke$;
--
-- (c) Non-admin cannot read payroll tables. RLS is admin-only on every table
--     (USING public.is_admin()), so as a non-admin JWT every SELECT returns 0
--     rows (RLS filters silently) and writes are rejected:
--     -- as a non-admin session:
--     SELECT count(*) FROM public.payroll_rate_cards;      -- → 0
--     SELECT count(*) FROM public.earnings_entries;        -- → 0
--     SELECT public.recalculate_payroll_period(2026,1,'<uuid>'); -- → ERROR 42501
--
-- (d) Manual participant override survives recalculate_payroll_period:
--     1) SELECT public.recalculate_payroll_period(2026, 1, '<card_uuid>');
--     2) SELECT public.set_payroll_site_participants(
--          '<period_uuid>', '<site_uuid>', ARRAY['<installerA>','<installerB>']::uuid[], 'rankinis');
--     3) SELECT public.recalculate_payroll_period(2026, 1, '<card_uuid>');  -- re-run
--     4) SELECT participant_source, participant_override_ids, participant_ids
--          FROM public.payroll_site_snapshots
--          WHERE period_id = '<period_uuid>' AND site_id = '<site_uuid>';
--        -- EXPECT: participant_source = 'manual' AND participant_override_ids = [A,B]
--        --         AND the auto site_share rows are split between A and B only.
-- ════════════════════════════════════════════════════════════
