-- ============================================================
-- Migration: Per-site payroll rule overrides + recalc hardening
-- (Follow-up to 20260615130000_payroll_rate_cards.sql, which is already applied.)
--
-- Adds:
--   1. payroll_site_rule_overrides — per (period, site, rule) auto/force_apply/force_skip
--   2. payroll_compute_site_rules() — single source of truth for "which rules apply
--      to a site and for how much", honouring overrides (used by recalc + UI)
--   3. get_payroll_site_rule_state() — admin RPC powering the "Taisyklės" modal
--   4. set_payroll_site_rule_override() — admin RPC to set/clear an override
--   5. recalculate_payroll_period() — REWRITTEN: override-aware, rule-by-rule
--      calculation_breakdown, and HARDENED so it can never silently leave an
--      included snapshot (participants>0, pool>0) without auto site_share earnings.
--
-- Money math stays INTEGER CENTS. Append-only ledger rules unchanged; auto rows
-- are still deleted only via the app.allow_auto_ledger_delete GUC bypass.
-- Idempotent (CREATE ... IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS).
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. payroll_site_rule_overrides
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.payroll_site_rule_overrides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id         UUID NOT NULL REFERENCES public.payroll_periods(id)    ON DELETE CASCADE,
  site_id           UUID NOT NULL REFERENCES public.sites(id)             ON DELETE CASCADE,
  rate_rule_id      UUID NOT NULL REFERENCES public.payroll_rate_rules(id) ON DELETE CASCADE,
  mode              TEXT NOT NULL DEFAULT 'auto'
                    CHECK (mode IN ('auto', 'force_apply', 'force_skip')),
  quantity_override NUMERIC,
  amount_override   NUMERIC(10,2),
  note              TEXT,
  updated_by        UUID REFERENCES public.user_profiles(id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (period_id, site_id, rate_rule_id)
);

CREATE INDEX IF NOT EXISTS idx_site_rule_overrides_period_site ON public.payroll_site_rule_overrides(period_id, site_id);
CREATE INDEX IF NOT EXISTS idx_site_rule_overrides_rule        ON public.payroll_site_rule_overrides(rate_rule_id);

ALTER TABLE public.payroll_site_rule_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_site_rule_overrides tik adminams" ON public.payroll_site_rule_overrides;
CREATE POLICY "payroll_site_rule_overrides tik adminams" ON public.payroll_site_rule_overrides
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_site_rule_overrides TO authenticated;

-- ════════════════════════════════════════════════════════════
-- 2. payroll_compute_site_rules(period, site, card)
--    One row per ACTIVE rule on the card, with default applicability, the
--    override (if any) and the resulting effective quantity/amount. This is the
--    SINGLE place that decides money-per-rule — recalc and the UI both use it,
--    so they can never disagree.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.payroll_compute_site_rules(
  p_period_id    UUID,
  p_site_id      UUID,
  p_rate_card_id UUID
)
RETURNS TABLE (
  rate_rule_id        UUID,
  code                TEXT,
  label               TEXT,
  rule_type           TEXT,
  amount              NUMERIC,
  unit                TEXT,
  params              JSONB,
  default_applicable  BOOLEAN,
  detected_quantity   NUMERIC,
  mode                TEXT,
  quantity_override   NUMERIC,
  amount_override     NUMERIC,
  note                TEXT,
  effective_quantity  NUMERIC,
  effective_amount    NUMERIC,
  effective_applied   BOOLEAN,
  reason              TEXT,
  source              TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_kwp      NUMERIC;
  v_equip    JSONB;
  v_has_bess BOOLEAN;
  v_opt      NUMERIC;
  v_hours    NUMERIC;
BEGIN
  SELECT s.kwp, s.equipment_details INTO v_kwp, v_equip FROM public.sites s WHERE s.id = p_site_id;
  v_has_bess := public.payroll_site_has_bess(v_equip);
  v_opt      := public.payroll_optimizer_count(v_equip);
  SELECT COALESCE(SUM(COALESCE(te.duration_minutes, EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 60.0)), 0) / 60.0
    INTO v_hours
  FROM public.time_entries te
  WHERE te.site_id = p_site_id AND te.end_time IS NOT NULL;

  RETURN QUERY
  WITH base AS (
    SELECT
      r.id, r.code, r.label, r.rule_type, r.amount, r.unit, r.params,
      o.mode AS o_mode, o.quantity_override AS o_qty, o.amount_override AS o_amt, o.note AS o_note,
      CASE r.rule_type
        WHEN 'base_site_fee'      THEN TRUE
        WHEN 'bess_fixed'         THEN v_has_bess
        WHEN 'optimizer_per_unit' THEN (v_opt > 0)
        WHEN 'efficiency_bonus'   THEN (
          CASE
            WHEN r.params ? 'target_hours'         THEN v_hours <= (r.params->>'target_hours')::numeric
            WHEN r.params ? 'target_hours_per_kwp' THEN v_hours <= COALESCE(v_kwp, 0) * (r.params->>'target_hours_per_kwp')::numeric
            ELSE FALSE
          END)
        ELSE FALSE
      END AS def_app,
      CASE WHEN r.rule_type = 'optimizer_per_unit' THEN v_opt ELSE NULL END AS det_qty
    FROM public.payroll_rate_rules r
    LEFT JOIN public.payroll_site_rule_overrides o
      ON o.rate_rule_id = r.id AND o.period_id = p_period_id AND o.site_id = p_site_id
    WHERE r.rate_card_id = p_rate_card_id AND r.is_active
  ),
  calc AS (
    SELECT
      b.*,
      COALESCE(b.o_mode, 'auto') AS m,
      CASE COALESCE(b.o_mode, 'auto')
        WHEN 'force_skip'  THEN FALSE
        WHEN 'force_apply' THEN TRUE
        ELSE b.def_app
      END AS eff_applied,
      COALESCE(b.o_amt, b.amount) AS unit_amount,
      CASE WHEN b.unit = 'per_unit' THEN COALESCE(b.o_qty, b.det_qty, 0) ELSE NULL END AS eff_qty
    FROM base b
  )
  SELECT
    c.id, c.code, c.label, c.rule_type, c.amount, c.unit, c.params,
    c.def_app, c.det_qty,
    c.m, c.o_qty, c.o_amt, c.o_note,
    c.eff_qty,
    CASE
      WHEN NOT c.eff_applied      THEN 0::numeric
      WHEN c.unit = 'per_unit'    THEN c.unit_amount * c.eff_qty
      ELSE c.unit_amount
    END AS eff_amount,
    c.eff_applied,
    CASE
      WHEN c.m = 'force_skip'  THEN 'Praleista rankiniu būdu' || COALESCE(' — ' || c.o_note, '')
      WHEN c.m = 'force_apply' THEN 'Pritaikyta rankiniu būdu' || COALESCE(' — ' || c.o_note, '')
      WHEN c.eff_applied       THEN 'Automatinis'
      ELSE 'Netaikoma (numatytasis)'
    END AS reason,
    CASE
      WHEN NOT c.eff_applied THEN 'skipped'
      WHEN c.m <> 'auto' OR c.o_amt IS NOT NULL OR c.o_qty IS NOT NULL THEN 'manual_override'
      ELSE 'detected'
    END AS source
  FROM calc c
  ORDER BY c.rule_type, c.code;
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_compute_site_rules(UUID, UUID, UUID) FROM PUBLIC;

-- ════════════════════════════════════════════════════════════
-- 3. get_payroll_site_rule_state(period, site) — admin RPC
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_payroll_site_rule_state(p_period_id UUID, p_site_id UUID)
RETURNS TABLE (
  rate_rule_id        UUID,
  code                TEXT,
  label               TEXT,
  rule_type           TEXT,
  amount              NUMERIC,
  unit                TEXT,
  params              JSONB,
  default_applicable  BOOLEAN,
  detected_quantity   NUMERIC,
  mode                TEXT,
  quantity_override   NUMERIC,
  amount_override     NUMERIC,
  note                TEXT,
  effective_quantity  NUMERIC,
  effective_amount    NUMERIC,
  effective_applied   BOOLEAN,
  reason              TEXT,
  source              TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_card UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali matyti įkainių būseną.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT rate_card_id INTO v_card FROM public.payroll_periods WHERE id = p_period_id;
  IF v_card IS NULL THEN
    RAISE EXCEPTION 'Periodas neturi priskirtos tarifų kortelės — pirma perskaičiuokite.' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN QUERY SELECT * FROM public.payroll_compute_site_rules(p_period_id, p_site_id, v_card);
END;
$$;

REVOKE ALL ON FUNCTION public.get_payroll_site_rule_state(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payroll_site_rule_state(UUID, UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════
-- 4. set_payroll_site_rule_override(...) — admin RPC
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_payroll_site_rule_override(
  p_period_id        UUID,
  p_site_id          UUID,
  p_rate_rule_id     UUID,
  p_mode             TEXT,
  p_quantity_override NUMERIC,
  p_amount_override  NUMERIC,
  p_note             TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status   TEXT;
  v_unit     TEXT;
  v_card     UUID;
  v_equip    JSONB;
  v_det_qty  NUMERIC;
  v_row      public.payroll_site_rule_overrides;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali keisti įkainių taikymą.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status, rate_card_id INTO v_status, v_card FROM public.payroll_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll periodas nerastas (id=%).', p_period_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'Periodas užrakintas — taisyklių keisti negalima.' USING ERRCODE = 'restrict_violation';
  END IF;

  IF p_mode NOT IN ('auto', 'force_apply', 'force_skip') THEN
    RAISE EXCEPTION 'Neleistinas režimas: %.', p_mode USING ERRCODE = 'check_violation';
  END IF;

  SELECT unit INTO v_unit FROM public.payroll_rate_rules WHERE id = p_rate_rule_id AND rate_card_id = v_card;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Taisyklė nepriklauso šio periodo tarifų kortelei.' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- mode='auto' → clear the override entirely (back to system detection).
  IF p_mode = 'auto' THEN
    DELETE FROM public.payroll_site_rule_overrides
    WHERE period_id = p_period_id AND site_id = p_site_id AND rate_rule_id = p_rate_rule_id;
    RETURN jsonb_build_object('cleared', true);
  END IF;

  -- force_apply / force_skip need a note (audit trail).
  IF p_note IS NULL OR char_length(btrim(p_note)) < 5 THEN
    RAISE EXCEPTION 'Pastaba privaloma (bent 5 simboliai) keičiant taisyklės taikymą.' USING ERRCODE = 'check_violation';
  END IF;

  -- force_apply on a per_unit rule needs a quantity unless one is detected.
  IF p_mode = 'force_apply' AND v_unit = 'per_unit' AND p_quantity_override IS NULL THEN
    SELECT equipment_details INTO v_equip FROM public.sites WHERE id = p_site_id;
    v_det_qty := public.payroll_optimizer_count(v_equip);
    IF v_det_qty IS NULL OR v_det_qty <= 0 THEN
      RAISE EXCEPTION 'Šiai „už vnt." taisyklei reikia nurodyti kiekį (kiekis nenustatytas automatiškai).'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.payroll_site_rule_overrides
    (period_id, site_id, rate_rule_id, mode, quantity_override, amount_override, note, updated_by, updated_at)
  VALUES
    (p_period_id, p_site_id, p_rate_rule_id, p_mode, p_quantity_override, p_amount_override, btrim(p_note), auth.uid(), NOW())
  ON CONFLICT (period_id, site_id, rate_rule_id) DO UPDATE
    SET mode = EXCLUDED.mode,
        quantity_override = EXCLUDED.quantity_override,
        amount_override = EXCLUDED.amount_override,
        note = EXCLUDED.note,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.set_payroll_site_rule_override(UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_payroll_site_rule_override(UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════
-- 5. recalculate_payroll_period — REWRITTEN (override-aware + hardened)
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
  v_rule            RECORD;
  v_participants    UUID[];
  v_override        JSONB;
  v_excluded        BOOLEAN;
  v_source          TEXT;
  v_used_fallback   BOOLEAN;
  v_included        BOOLEAN;
  v_n               INT;
  v_snapshot_id     UUID;
  v_kept_site_ids   UUID[] := '{}';

  -- Money, INTEGER CENTS.
  v_amt_cents       BIGINT;
  v_base_cents      BIGINT;
  v_addon_cents     BIGINT;
  v_bonus_cents     BIGINT;
  v_pool_cents      BIGINT;

  v_has_bess        BOOLEAN;
  v_opt_count       NUMERIC;
  v_n_base          INT;
  v_n_bess          INT;
  v_n_opt           INT;

  -- Equal split.
  v_share_base      BIGINT;
  v_remainder       INT;
  v_share_cents     BIGINT;
  v_sum_cents       BIGINT;
  v_inserted        INT;
  v_db_auto_entries INT;
  v_db_auto_cents   BIGINT;
  v_i               INT;
  v_desc            TEXT;

  v_site_warnings   JSONB;
  v_rules_json      JSONB;
  v_breakdown       JSONB;
  v_processed       INT := 0;
  v_snapshots       INT := 0;
  v_auto_earnings   INT := 0;
  v_skipped         INT := 0;
  v_total_pool_c    BIGINT := 0;
  v_warnings        JSONB := '[]'::jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali perskaičiuoti payroll periodą.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Netinkamas mėnuo: %.', p_month USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payroll_rate_cards WHERE id = p_rate_card_id) THEN
    RAISE EXCEPTION 'Tarifų kortelė nerasta (rate_card_id=%).', p_rate_card_id USING ERRCODE = 'no_data_found';
  END IF;

  SELECT id, status INTO v_period_id, v_status FROM public.payroll_periods WHERE year = p_year AND month = p_month;
  IF FOUND THEN
    IF v_status = 'locked' THEN
      RAISE EXCEPTION 'Periodas užrakintas — perskaičiuoti negalima.' USING ERRCODE = 'restrict_violation';
    END IF;
    UPDATE public.payroll_periods SET rate_card_id = p_rate_card_id WHERE id = v_period_id;
  ELSE
    INSERT INTO public.payroll_periods (year, month, status, rate_card_id)
    VALUES (p_year, p_month, 'open', p_rate_card_id)
    ON CONFLICT (year, month) DO UPDATE SET rate_card_id = EXCLUDED.rate_card_id
    RETURNING id INTO v_period_id;
  END IF;

  -- Rule presence for warnings (independent of any single site).
  SELECT
    COUNT(*) FILTER (WHERE rule_type = 'base_site_fee'),
    COUNT(*) FILTER (WHERE rule_type = 'bess_fixed'),
    COUNT(*) FILTER (WHERE rule_type = 'optimizer_per_unit')
  INTO v_n_base, v_n_bess, v_n_opt
  FROM public.payroll_rate_rules WHERE rate_card_id = p_rate_card_id AND is_active;

  PERFORM set_config('app.allow_snapshot_write', 'on', true);

  FOR v_site IN
    SELECT s.id AS site_id, s.code AS site_code, s.equipment_details
    FROM public.sites s
    WHERE s.status = 'completed'
      AND s.actual_end IS NOT NULL
      AND EXTRACT(YEAR  FROM (s.actual_end AT TIME ZONE 'Europe/Vilnius')) = p_year
      AND EXTRACT(MONTH FROM (s.actual_end AT TIME ZONE 'Europe/Vilnius')) = p_month
    ORDER BY s.id
  LOOP
    v_kept_site_ids := array_append(v_kept_site_ids, v_site.site_id);
    v_site_warnings := '[]'::jsonb;

    -- Preserve manual override / exclusion already on the snapshot.
    SELECT participant_override_ids, COALESCE(is_manually_excluded, false)
    INTO v_override, v_excluded
    FROM public.payroll_site_snapshots WHERE period_id = v_period_id AND site_id = v_site.site_id;
    v_excluded := COALESCE(v_excluded, false);

    -- Resolve participants (override wins → time_entries → assignments).
    v_used_fallback := FALSE;
    IF v_override IS NOT NULL THEN
      SELECT array_agg(val::uuid ORDER BY val::uuid) INTO v_participants
      FROM jsonb_array_elements_text(v_override) AS t(val);
      v_source := 'manual';
      v_site_warnings := v_site_warnings || to_jsonb('Naudotas rankinis dalyvių sąrašas (override).'::text);
    ELSE
      SELECT array_agg(DISTINCT te.installer_id ORDER BY te.installer_id) INTO v_participants
      FROM public.time_entries te WHERE te.site_id = v_site.site_id AND te.end_time IS NOT NULL;
      IF v_participants IS NOT NULL AND array_length(v_participants, 1) IS NOT NULL THEN
        v_source := 'time_entries';
      ELSE
        SELECT array_agg(DISTINCT sa.installer_id ORDER BY sa.installer_id) INTO v_participants
        FROM public.site_assignments sa WHERE sa.site_id = v_site.site_id;
        IF v_participants IS NOT NULL AND array_length(v_participants, 1) IS NOT NULL THEN
          v_source := 'assignments'; v_used_fallback := TRUE;
          v_site_warnings := v_site_warnings || to_jsonb('Nėra uždarytų laiko įrašų — naudoti priskirti montuotojai.'::text);
        ELSE
          v_source := 'auto';
        END IF;
      END IF;
    END IF;
    v_n := COALESCE(array_length(v_participants, 1), 0);

    -- ── Rule-by-rule calculation via the shared compute function (honours
    --    per-site overrides). Build pool + a per-rule breakdown array. ──
    v_base_cents := 0; v_addon_cents := 0; v_bonus_cents := 0; v_pool_cents := 0;
    v_rules_json := '[]'::jsonb;
    FOR v_rule IN
      SELECT * FROM public.payroll_compute_site_rules(v_period_id, v_site.site_id, p_rate_card_id)
    LOOP
      v_amt_cents := ROUND(v_rule.effective_amount * 100)::bigint;
      IF v_rule.effective_applied THEN
        v_pool_cents := v_pool_cents + v_amt_cents;
        IF v_rule.rule_type = 'base_site_fee' THEN
          v_base_cents := v_base_cents + v_amt_cents;
        ELSIF v_rule.rule_type IN ('efficiency_bonus', 'quality_bonus') THEN
          v_bonus_cents := v_bonus_cents + v_amt_cents;
        ELSE
          v_addon_cents := v_addon_cents + v_amt_cents;
        END IF;
      END IF;
      v_rules_json := v_rules_json || jsonb_build_object(
        'rule_id',            v_rule.rate_rule_id,
        'code',               v_rule.code,
        'label',              v_rule.label,
        'rule_type',          v_rule.rule_type,
        'mode',               v_rule.mode,
        'default_applicable', v_rule.default_applicable,
        'applied',            v_rule.effective_applied,
        'quantity',           v_rule.effective_quantity,
        'unit_amount',        COALESCE(v_rule.amount_override, v_rule.amount),
        'amount',             v_rule.effective_amount,
        'source',             v_rule.source,
        'note',               v_rule.note
      );
    END LOOP;

    -- Site facts for warnings.
    v_has_bess  := public.payroll_site_has_bess(v_site.equipment_details);
    v_opt_count := public.payroll_optimizer_count(v_site.equipment_details);
    IF v_n_base = 0 THEN
      v_site_warnings := v_site_warnings || to_jsonb('Nėra aktyvios base_site_fee taisyklės — bazinis mokestis 0.'::text);
    END IF;
    IF v_has_bess AND v_n_bess = 0 THEN
      v_site_warnings := v_site_warnings || to_jsonb('Aptiktas BESS, bet nėra aktyvios bess_fixed taisyklės.'::text);
    END IF;
    IF v_opt_count > 0 AND v_n_opt = 0 THEN
      v_site_warnings := v_site_warnings || to_jsonb('Aptikti optimizatoriai, bet nėra aktyvios optimizer_per_unit taisyklės.'::text);
    END IF;
    IF v_pool_cents = 0 THEN
      v_site_warnings := v_site_warnings || to_jsonb('Objekto fondas yra 0 €.'::text);
    END IF;

    v_included := NOT v_excluded;
    IF v_excluded THEN
      v_site_warnings := v_site_warnings || to_jsonb('Objektas rankiniu būdu pašalintas iš atlygio — auto įrašai nekuriami.'::text);
    ELSIF v_n = 0 THEN
      v_site_warnings := v_site_warnings || to_jsonb('Nėra dalyvių — montuotojų įrašai nesukurti.'::text);
    END IF;

    v_breakdown := jsonb_build_object(
      'rate_card_id',          p_rate_card_id,
      'participant_source',    v_source,
      'manually_excluded',     v_excluded,
      'has_bess',              v_has_bess,
      'optimizer_count',       v_opt_count,
      'participant_count',     v_n,
      'rules',                 v_rules_json,
      'pool_cents',            v_pool_cents
    );

    -- Upsert snapshot. Manual-override columns are deliberately left untouched.
    INSERT INTO public.payroll_site_snapshots AS ss
      (period_id, site_id, included, participant_ids, participant_source,
       base_amount, addon_amount, bonus_amount, deduction_amount,
       total_pool, calculation_breakdown, warnings, recalculated_at)
    VALUES
      (v_period_id, v_site.site_id, v_included,
       to_jsonb(COALESCE(v_participants, '{}'::uuid[])), v_source,
       (v_base_cents)::numeric / 100, (v_addon_cents)::numeric / 100, (v_bonus_cents)::numeric / 100, 0,
       (v_pool_cents)::numeric / 100, v_breakdown, v_site_warnings, NOW())
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
    v_snapshots := v_snapshots + 1;

    -- Clear this snapshot's previous AUTO ledger rows immediately before
    -- rebuilding them. Manual ledger rows are append-only and are not touched.
    PERFORM set_config('app.allow_auto_ledger_delete', 'on', true);
    DELETE FROM public.earnings_entries
    WHERE period_id = v_period_id
      AND site_snapshot_id = v_snapshot_id
      AND source = 'auto';
    PERFORM set_config('app.allow_auto_ledger_delete', 'off', true);

    IF jsonb_array_length(v_site_warnings) > 0 THEN
      SELECT v_warnings || COALESCE(jsonb_agg(format('Objektas %s: %s', v_site.site_code, w.value)), '[]'::jsonb)
      INTO v_warnings FROM jsonb_array_elements_text(v_site_warnings) AS w(value);
    END IF;

    -- Excluded or participant-less → snapshot stays, pay nobody.
    IF v_excluded OR v_n = 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- pool 0 with participants: nothing to split (no entries), but not an error.
    IF v_pool_cents = 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- ── Equal split (deterministic cents → lowest installer_id absorbs remainder) ──
    v_share_base := v_pool_cents / v_n;
    v_remainder  := (v_pool_cents - v_share_base * v_n)::INT;
    v_desc := 'Objekto ' || v_site.site_code || ' atlygio dalis';
    IF v_source = 'manual' THEN v_desc := v_desc || ' [rankinis dalyvių sąrašas]';
    ELSIF v_used_fallback THEN v_desc := v_desc || ' [be laiko įrašų]'; END IF;

    v_sum_cents := 0; v_inserted := 0;
    FOR v_i IN 1 .. v_n LOOP
      v_share_cents := v_share_base + CASE WHEN v_i = 1 THEN v_remainder ELSE 0 END;
      INSERT INTO public.earnings_entries
        (period_id, site_snapshot_id, installer_id, entry_type, amount, source, description, created_by)
      VALUES
        (v_period_id, v_snapshot_id, v_participants[v_i], 'site_share', (v_share_cents)::numeric / 100, 'auto', v_desc, v_uid);
      v_sum_cents := v_sum_cents + v_share_cents;
      v_inserted  := v_inserted + 1;
    END LOOP;

    -- ── HARDENING: an included, funded, participant-bearing site MUST end up
    --    with exactly N auto site_share rows summing to the pool. Otherwise we
    --    RAISE (rolling back) rather than return a misleading "success". ──
    IF v_inserted <> v_n THEN
      RAISE EXCEPTION 'Atlygio įrašų kiekis neatitinka dalyvių objektui %: įrašyta %, dalyvių %.',
        v_site.site_code, v_inserted, v_n;
    END IF;
    IF v_sum_cents <> v_pool_cents THEN
      RAISE EXCEPTION 'Apvalinimo invariantas pažeistas objektui %: shares=% ct, pool=% ct.',
        v_site.site_code, v_sum_cents, v_pool_cents;
    END IF;
    SELECT
      COUNT(*)::int,
      COALESCE(ROUND(SUM(e.amount) * 100), 0)::bigint
    INTO v_db_auto_entries, v_db_auto_cents
    FROM public.earnings_entries e
    WHERE e.period_id = v_period_id
      AND e.site_snapshot_id = v_snapshot_id
      AND e.source = 'auto'
      AND e.entry_type = 'site_share';

    IF v_db_auto_entries <> v_n THEN
      RAISE EXCEPTION 'Po įrašymo objektas % neturi laukto auto įrašų skaičiaus: DB įrašai %, dalyviai %.',
        v_site.site_code, v_db_auto_entries, v_n;
    END IF;
    IF v_db_auto_cents <> v_pool_cents THEN
      RAISE EXCEPTION 'Po įrašymo objektas % neturi laukto auto sumos invariant: DB=% ct, pool=% ct.',
        v_site.site_code, v_db_auto_cents, v_pool_cents;
    END IF;

    v_auto_earnings := v_auto_earnings + v_inserted;
    v_processed     := v_processed + 1;
    v_total_pool_c  := v_total_pool_c + v_pool_cents;
  END LOOP;

  -- Stale snapshots (site no longer qualifies) → excluded from lock.
  UPDATE public.payroll_site_snapshots SET included = FALSE
  WHERE period_id = v_period_id AND NOT (site_id = ANY (v_kept_site_ids));

  -- Stale snapshots also lose previous AUTO ledger rows. Manual corrections
  -- remain append-only and visible for audit/history.
  PERFORM set_config('app.allow_auto_ledger_delete', 'on', true);
  DELETE FROM public.earnings_entries e
  USING public.payroll_site_snapshots s
  WHERE e.period_id = v_period_id
    AND e.site_snapshot_id = s.id
    AND e.source = 'auto'
    AND s.period_id = v_period_id
    AND NOT (s.site_id = ANY (v_kept_site_ids));
  PERFORM set_config('app.allow_auto_ledger_delete', 'off', true);

  PERFORM set_config('app.allow_snapshot_write', 'off', true);

  UPDATE public.payroll_periods SET status = 'review' WHERE id = v_period_id AND status <> 'locked';

  RETURN jsonb_build_object(
    'period_id',                   v_period_id,
    'year',                        p_year,
    'month',                       p_month,
    'rate_card_id',                p_rate_card_id,
    'processed_sites',             v_processed,
    'snapshots_created_or_updated', v_snapshots,
    'auto_earnings_created',       v_auto_earnings,
    'skipped_sites',               v_skipped,
    'total_pool',                  (v_total_pool_c)::numeric / 100,
    'total_entries',               v_auto_earnings,
    'warnings',                    v_warnings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_payroll_period(INT, INT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_payroll_period(INT, INT, UUID) TO authenticated;

-- ============================================================
-- END migration.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- SMOKE TESTS (illustrative; run in psql on dev — see prior migration for the
-- request.jwt.claims impersonation pattern needed because is_admin() reads auth.uid()).
-- ────────────────────────────────────────────────────────────
-- (a) 2 participants, pool 500 → two 250.00 rows; 1 participant, pool 300 → one 300.00:
--     SELECT public.recalculate_payroll_period(2026, 6, '<card>');
--     select
--       s.id as snapshot_id,
--       s.site_id,
--       s.total_pool,
--       jsonb_array_length(s.participant_ids) as participants,
--       coalesce(sum(e.amount) filter (
--         where e.source='auto' and e.entry_type='site_share'
--       ), 0) as auto_sum,
--       count(e.id) filter (
--         where e.source='auto' and e.entry_type='site_share'
--       ) as auto_entries
--     from public.payroll_site_snapshots s
--     left join public.earnings_entries e on e.site_snapshot_id = s.id
--     where s.included
--     group by s.id, s.site_id, s.total_pool, s.participant_ids
--     order by s.total_pool desc;
--     -- EXPECT when total_pool > 0 and participants > 0:
--     --   auto_sum = total_pool
--     --   auto_entries = participants
--
-- (b) force_skip BESS removes 150, force_apply re-adds it:
--     SELECT public.set_payroll_site_rule_override('<period>','<site>','<bess_rule>','force_skip',NULL,NULL,'be QC dok.');
--     SELECT public.recalculate_payroll_period(2026,6,'<card>');   -- site total -150
--     SELECT public.set_payroll_site_rule_override('<period>','<site>','<bess_rule>','force_apply',NULL,NULL,'klientas patvirtino');
--     SELECT public.recalculate_payroll_period(2026,6,'<card>');   -- site total +150
--
-- (c) optimizer quantity_override:
--     SELECT public.set_payroll_site_rule_override('<period>','<site>','<opt_rule>','force_apply',24,NULL,'24 vnt. pagal aktą');
--     -- after recalc: optimizer amount = 24 × unit rate
--
-- (d) manual override survives recalc: set_payroll_site_rule_override(...) then recalc twice → override persists.
-- (e) locked period: set_payroll_site_rule_override on a locked period → ERROR 23001 (restrict_violation).
-- (f) earnings sum equals total_pool after any override combination (asserted in-RPC).
-- ════════════════════════════════════════════════════════════
