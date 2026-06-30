-- Per-site payroll rate-card overrides and override-aware recalculation.
-- Keeps manual earnings, participant overrides, and exclusions intact.

CREATE TABLE IF NOT EXISTS public.payroll_site_rate_card_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  rate_card_id UUID NOT NULL REFERENCES public.payroll_rate_cards(id),
  note TEXT,
  updated_by UUID REFERENCES public.user_profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_id, site_id)
);

-- UNIQUE(period_id, site_id) provides the requested period/site lookup index.
CREATE INDEX IF NOT EXISTS idx_payroll_site_rate_card_overrides_site
  ON public.payroll_site_rate_card_overrides(site_id);
CREATE INDEX IF NOT EXISTS idx_payroll_site_rate_card_overrides_rate_card
  ON public.payroll_site_rate_card_overrides(rate_card_id);

ALTER TABLE public.payroll_site_rate_card_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_site_rate_card_overrides tik adminams" ON public.payroll_site_rate_card_overrides;
CREATE POLICY "payroll_site_rate_card_overrides tik adminams"
  ON public.payroll_site_rate_card_overrides
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.payroll_site_rate_card_overrides FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payroll_site_rate_card_overrides TO authenticated;

CREATE OR REPLACE FUNCTION public.get_payroll_site_effective_rate_card(
  p_period_id UUID,
  p_site_id UUID
)
RETURNS TABLE (
  effective_rate_card_id UUID,
  effective_rate_card_name TEXT,
  source TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    CASE WHEN o.rate_card_id IS NULL THEN 'period_default' ELSE 'site_override' END
  FROM public.payroll_periods p
  LEFT JOIN public.payroll_site_rate_card_overrides o
    ON o.period_id = p.id AND o.site_id = p_site_id
  JOIN public.payroll_rate_cards c ON c.id = COALESCE(o.rate_card_id, p.rate_card_id)
  WHERE p.id = p_period_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll period or effective rate card not found.' USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_payroll_site_rate_card_override(
  p_period_id UUID,
  p_site_id UUID,
  p_rate_card_id UUID,
  p_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_row public.payroll_site_rate_card_overrides;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status INTO v_status FROM public.payroll_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll period not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'Payroll period is locked.' USING ERRCODE = 'restrict_violation';
  END IF;

  IF p_rate_card_id IS NULL THEN
    DELETE FROM public.payroll_site_rate_card_overrides
    WHERE period_id = p_period_id AND site_id = p_site_id;
    RETURN jsonb_build_object('cleared', true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payroll_rate_cards WHERE id = p_rate_card_id) THEN
    RAISE EXCEPTION 'Rate card not found.' USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO public.payroll_site_rate_card_overrides
    (period_id, site_id, rate_card_id, note, updated_by, updated_at)
  VALUES
    (p_period_id, p_site_id, p_rate_card_id, NULLIF(btrim(p_note), ''), auth.uid(), now())
  ON CONFLICT (period_id, site_id) DO UPDATE
    SET rate_card_id = EXCLUDED.rate_card_id,
        note = EXCLUDED.note,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

-- Replace the two-argument version so the modal can preview a selected card
-- before it is saved. Omitting p_rate_card_id still uses the persisted effective card.
DROP FUNCTION IF EXISTS public.get_payroll_site_rule_state(UUID, UUID);
CREATE FUNCTION public.get_payroll_site_rule_state(
  p_period_id UUID,
  p_site_id UUID,
  p_rate_card_id UUID DEFAULT NULL
)
RETURNS TABLE (
  rate_rule_id UUID,
  code TEXT,
  label TEXT,
  rule_type TEXT,
  amount NUMERIC,
  unit TEXT,
  params JSONB,
  default_applicable BOOLEAN,
  detected_quantity NUMERIC,
  mode TEXT,
  quantity_override NUMERIC,
  amount_override NUMERIC,
  note TEXT,
  effective_quantity NUMERIC,
  effective_amount NUMERIC,
  effective_applied BOOLEAN,
  reason TEXT,
  source TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_card UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_rate_card_id IS NOT NULL THEN
    v_card := p_rate_card_id;
  ELSE
    SELECT effective_rate_card_id INTO v_card
    FROM public.get_payroll_site_effective_rate_card(p_period_id, p_site_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payroll_rate_cards WHERE id = v_card) THEN
    RAISE EXCEPTION 'Rate card not found.' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY SELECT * FROM public.payroll_compute_site_rules(p_period_id, p_site_id, v_card);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_payroll_site_rule_override(
  p_period_id UUID,
  p_site_id UUID,
  p_rate_rule_id UUID,
  p_mode TEXT,
  p_quantity_override NUMERIC,
  p_amount_override NUMERIC,
  p_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_unit TEXT;
  v_card UUID;
  v_equip JSONB;
  v_det_qty NUMERIC;
  v_row public.payroll_site_rule_overrides;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT status INTO v_status FROM public.payroll_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll period not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'Payroll period is locked.' USING ERRCODE = 'restrict_violation';
  END IF;
  IF p_mode NOT IN ('auto', 'force_apply', 'force_skip') THEN
    RAISE EXCEPTION 'Invalid rule mode.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT effective_rate_card_id INTO v_card
  FROM public.get_payroll_site_effective_rate_card(p_period_id, p_site_id);
  SELECT unit INTO v_unit FROM public.payroll_rate_rules
  WHERE id = p_rate_rule_id AND rate_card_id = v_card;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rule does not belong to the effective rate card.' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF p_mode = 'auto' THEN
    DELETE FROM public.payroll_site_rule_overrides
    WHERE period_id = p_period_id AND site_id = p_site_id AND rate_rule_id = p_rate_rule_id;
    RETURN jsonb_build_object('cleared', true);
  END IF;
  IF p_note IS NULL OR char_length(btrim(p_note)) < 5 THEN
    RAISE EXCEPTION 'Note is required (at least 5 characters).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_mode = 'force_apply' AND v_unit = 'per_unit' AND p_quantity_override IS NULL THEN
    SELECT equipment_details INTO v_equip FROM public.sites WHERE id = p_site_id;
    v_det_qty := public.payroll_optimizer_count(v_equip);
    IF COALESCE(v_det_qty, 0) <= 0 THEN
      RAISE EXCEPTION 'A quantity is required for this per-unit rule.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.payroll_site_rule_overrides
    (period_id, site_id, rate_rule_id, mode, quantity_override, amount_override, note, updated_by, updated_at)
  VALUES
    (p_period_id, p_site_id, p_rate_rule_id, p_mode, p_quantity_override, p_amount_override, btrim(p_note), auth.uid(), now())
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

CREATE OR REPLACE FUNCTION public.recalculate_payroll_period(
  p_year INT,
  p_month INT,
  p_rate_card_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_period_id UUID;
  v_status TEXT;
  v_site RECORD;
  v_rule RECORD;
  v_participants UUID[];
  v_override JSONB;
  v_excluded BOOLEAN;
  v_source TEXT;
  v_used_fallback BOOLEAN;
  v_included BOOLEAN;
  v_n INT;
  v_snapshot_id UUID;
  v_kept_site_ids UUID[] := '{}';
  v_effective_card_id UUID;
  v_effective_card_name TEXT;
  v_card_source TEXT;
  v_amt_cents BIGINT;
  v_base_cents BIGINT;
  v_addon_cents BIGINT;
  v_bonus_cents BIGINT;
  v_pool_cents BIGINT;
  v_has_bess BOOLEAN;
  v_opt_count NUMERIC;
  v_n_base INT;
  v_n_bess INT;
  v_n_opt INT;
  v_share_base BIGINT;
  v_remainder INT;
  v_share_cents BIGINT;
  v_sum_cents BIGINT;
  v_inserted INT;
  v_db_auto_entries INT;
  v_db_auto_cents BIGINT;
  v_i INT;
  v_desc TEXT;
  v_site_warnings JSONB;
  v_rules_json JSONB;
  v_breakdown JSONB;
  v_processed INT := 0;
  v_snapshots INT := 0;
  v_auto_earnings INT := 0;
  v_skipped INT := 0;
  v_total_pool_c BIGINT := 0;
  v_warnings JSONB := '[]'::jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Invalid month.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payroll_rate_cards WHERE id = p_rate_card_id) THEN
    RAISE EXCEPTION 'Rate card not found.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT id, status INTO v_period_id, v_status
  FROM public.payroll_periods WHERE year = p_year AND month = p_month;
  IF FOUND THEN
    IF v_status = 'locked' THEN
      RAISE EXCEPTION 'Payroll period is locked.' USING ERRCODE = 'restrict_violation';
    END IF;
    UPDATE public.payroll_periods SET rate_card_id = p_rate_card_id WHERE id = v_period_id;
  ELSE
    INSERT INTO public.payroll_periods (year, month, status, rate_card_id)
    VALUES (p_year, p_month, 'open', p_rate_card_id)
    ON CONFLICT (year, month) DO UPDATE SET rate_card_id = EXCLUDED.rate_card_id
    RETURNING id INTO v_period_id;
  END IF;

  PERFORM set_config('app.allow_snapshot_write', 'on', true);
  FOR v_site IN
    SELECT s.id AS site_id, s.code AS site_code, s.equipment_details
    FROM public.sites s
    WHERE s.status = 'completed'
      AND s.actual_end IS NOT NULL
      AND EXTRACT(YEAR FROM (s.actual_end AT TIME ZONE 'Europe/Vilnius')) = p_year
      AND EXTRACT(MONTH FROM (s.actual_end AT TIME ZONE 'Europe/Vilnius')) = p_month
    ORDER BY s.id
  LOOP
    v_kept_site_ids := array_append(v_kept_site_ids, v_site.site_id);
    v_site_warnings := '[]'::jsonb;
    SELECT participant_override_ids, COALESCE(is_manually_excluded, false)
    INTO v_override, v_excluded
    FROM public.payroll_site_snapshots
    WHERE period_id = v_period_id AND site_id = v_site.site_id;
    v_excluded := COALESCE(v_excluded, false);

    SELECT c.id, c.name, CASE WHEN o.rate_card_id IS NULL THEN 'period_default' ELSE 'site_override' END
    INTO v_effective_card_id, v_effective_card_name, v_card_source
    FROM public.payroll_rate_cards c
    LEFT JOIN public.payroll_site_rate_card_overrides o
      ON o.period_id = v_period_id AND o.site_id = v_site.site_id
    WHERE c.id = COALESCE(o.rate_card_id, p_rate_card_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Effective rate card missing for site %.', v_site.site_code USING ERRCODE = 'no_data_found';
    END IF;

    v_used_fallback := false;
    v_participants := NULL;
    IF v_override IS NOT NULL THEN
      SELECT array_agg(value::uuid ORDER BY value::uuid) INTO v_participants
      FROM jsonb_array_elements_text(v_override);
      v_source := 'manual';
    ELSE
      SELECT array_agg(DISTINCT te.installer_id ORDER BY te.installer_id) INTO v_participants
      FROM public.time_entries te WHERE te.site_id = v_site.site_id AND te.end_time IS NOT NULL;
      IF COALESCE(array_length(v_participants, 1), 0) > 0 THEN
        v_source := 'time_entries';
      ELSE
        SELECT array_agg(DISTINCT sa.installer_id ORDER BY sa.installer_id) INTO v_participants
        FROM public.site_assignments sa WHERE sa.site_id = v_site.site_id;
        IF COALESCE(array_length(v_participants, 1), 0) > 0 THEN
          v_source := 'assignments';
          v_used_fallback := true;
        ELSE
          v_source := 'auto';
        END IF;
      END IF;
    END IF;
    v_n := COALESCE(array_length(v_participants, 1), 0);

    SELECT
      COUNT(*) FILTER (WHERE rule_type = 'base_site_fee'),
      COUNT(*) FILTER (WHERE rule_type = 'bess_fixed'),
      COUNT(*) FILTER (WHERE rule_type = 'optimizer_per_unit')
    INTO v_n_base, v_n_bess, v_n_opt
    FROM public.payroll_rate_rules
    WHERE rate_card_id = v_effective_card_id AND is_active;

    v_base_cents := 0;
    v_addon_cents := 0;
    v_bonus_cents := 0;
    v_pool_cents := 0;
    v_rules_json := '[]'::jsonb;
    FOR v_rule IN SELECT * FROM public.payroll_compute_site_rules(v_period_id, v_site.site_id, v_effective_card_id)
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
        'rule_id', v_rule.rate_rule_id, 'code', v_rule.code, 'label', v_rule.label,
        'rule_type', v_rule.rule_type, 'mode', v_rule.mode,
        'default_applicable', v_rule.default_applicable, 'applied', v_rule.effective_applied,
        'quantity', v_rule.effective_quantity, 'unit_amount', COALESCE(v_rule.amount_override, v_rule.amount),
        'amount', v_rule.effective_amount, 'source', v_rule.source, 'note', v_rule.note
      );
    END LOOP;

    v_has_bess := public.payroll_site_has_bess(v_site.equipment_details);
    v_opt_count := public.payroll_optimizer_count(v_site.equipment_details);
    IF v_n_base = 0 THEN v_site_warnings := v_site_warnings || to_jsonb('No active base rule.'::text); END IF;
    IF v_has_bess AND v_n_bess = 0 THEN v_site_warnings := v_site_warnings || to_jsonb('BESS detected without an active BESS rule.'::text); END IF;
    IF v_opt_count > 0 AND v_n_opt = 0 THEN v_site_warnings := v_site_warnings || to_jsonb('Optimizers detected without an active optimizer rule.'::text); END IF;
    IF v_pool_cents = 0 THEN v_site_warnings := v_site_warnings || to_jsonb('Site pool is 0 EUR.'::text); END IF;
    IF v_excluded THEN v_site_warnings := v_site_warnings || to_jsonb('Site is manually excluded.'::text); END IF;
    IF NOT v_excluded AND v_n = 0 THEN v_site_warnings := v_site_warnings || to_jsonb('No participants found.'::text); END IF;

    v_included := NOT v_excluded;
    v_breakdown := jsonb_build_object(
      'rate_card_id', v_effective_card_id,
      'rate_card_name', v_effective_card_name,
      'rate_card_source', v_card_source,
      'participant_source', v_source,
      'manually_excluded', v_excluded,
      'has_bess', v_has_bess,
      'optimizer_count', v_opt_count,
      'participant_count', v_n,
      'rules', v_rules_json,
      'pool_cents', v_pool_cents
    );

    INSERT INTO public.payroll_site_snapshots AS ss
      (period_id, site_id, included, participant_ids, participant_source,
       base_amount, addon_amount, bonus_amount, deduction_amount,
       total_pool, calculation_breakdown, warnings, recalculated_at)
    VALUES
      (v_period_id, v_site.site_id, v_included, to_jsonb(COALESCE(v_participants, '{}'::uuid[])), v_source,
       v_base_cents::numeric / 100, v_addon_cents::numeric / 100, v_bonus_cents::numeric / 100, 0,
       v_pool_cents::numeric / 100, v_breakdown, v_site_warnings, now())
    ON CONFLICT (period_id, site_id) DO UPDATE SET
      included = EXCLUDED.included,
      participant_ids = EXCLUDED.participant_ids,
      participant_source = EXCLUDED.participant_source,
      base_amount = EXCLUDED.base_amount,
      addon_amount = EXCLUDED.addon_amount,
      bonus_amount = EXCLUDED.bonus_amount,
      deduction_amount = EXCLUDED.deduction_amount,
      total_pool = EXCLUDED.total_pool,
      calculation_breakdown = EXCLUDED.calculation_breakdown,
      warnings = EXCLUDED.warnings,
      recalculated_at = EXCLUDED.recalculated_at
    RETURNING ss.id INTO v_snapshot_id;
    v_snapshots := v_snapshots + 1;

    PERFORM set_config('app.allow_auto_ledger_delete', 'on', true);
    DELETE FROM public.earnings_entries
    WHERE period_id = v_period_id AND site_snapshot_id = v_snapshot_id AND source = 'auto';
    PERFORM set_config('app.allow_auto_ledger_delete', 'off', true);

    IF jsonb_array_length(v_site_warnings) > 0 THEN
      SELECT v_warnings || COALESCE(jsonb_agg(format('Site %s: %s', v_site.site_code, value)), '[]'::jsonb)
      INTO v_warnings FROM jsonb_array_elements_text(v_site_warnings);
    END IF;
    IF v_excluded OR v_n = 0 OR v_pool_cents = 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_share_base := v_pool_cents / v_n;
    v_remainder := (v_pool_cents - v_share_base * v_n)::int;
    v_desc := 'Objekto ' || v_site.site_code || ' atlygio dalis';
    IF v_source = 'manual' THEN v_desc := v_desc || ' [rankinis dalyviu sarasas]';
    ELSIF v_used_fallback THEN v_desc := v_desc || ' [be laiko irasu]'; END IF;
    v_sum_cents := 0;
    v_inserted := 0;
    FOR v_i IN 1 .. v_n LOOP
      v_share_cents := v_share_base + CASE WHEN v_i = 1 THEN v_remainder ELSE 0 END;
      INSERT INTO public.earnings_entries
        (period_id, site_snapshot_id, installer_id, entry_type, amount, source, description, created_by)
      VALUES
        (v_period_id, v_snapshot_id, v_participants[v_i], 'site_share', v_share_cents::numeric / 100, 'auto', v_desc, v_uid);
      v_sum_cents := v_sum_cents + v_share_cents;
      v_inserted := v_inserted + 1;
    END LOOP;

    SELECT COUNT(*)::int, COALESCE(ROUND(SUM(e.amount) * 100), 0)::bigint
    INTO v_db_auto_entries, v_db_auto_cents
    FROM public.earnings_entries e
    WHERE e.period_id = v_period_id AND e.site_snapshot_id = v_snapshot_id
      AND e.source = 'auto' AND e.entry_type = 'site_share';
    IF v_inserted <> v_n OR v_sum_cents <> v_pool_cents
      OR v_db_auto_entries <> v_n OR v_db_auto_cents <> v_pool_cents THEN
      RAISE EXCEPTION 'Auto earning reconciliation failed for site %.', v_site.site_code;
    END IF;
    v_auto_earnings := v_auto_earnings + v_inserted;
    v_processed := v_processed + 1;
    v_total_pool_c := v_total_pool_c + v_pool_cents;
  END LOOP;

  UPDATE public.payroll_site_snapshots SET included = false
  WHERE period_id = v_period_id AND NOT (site_id = ANY(v_kept_site_ids));
  PERFORM set_config('app.allow_auto_ledger_delete', 'on', true);
  DELETE FROM public.earnings_entries e
  USING public.payroll_site_snapshots s
  WHERE e.period_id = v_period_id AND e.site_snapshot_id = s.id AND e.source = 'auto'
    AND s.period_id = v_period_id AND NOT (s.site_id = ANY(v_kept_site_ids));
  PERFORM set_config('app.allow_auto_ledger_delete', 'off', true);
  PERFORM set_config('app.allow_snapshot_write', 'off', true);

  UPDATE public.payroll_periods SET status = 'review' WHERE id = v_period_id AND status <> 'locked';
  RETURN jsonb_build_object(
    'period_id', v_period_id, 'year', p_year, 'month', p_month, 'rate_card_id', p_rate_card_id,
    'processed_sites', v_processed, 'snapshots_created_or_updated', v_snapshots,
    'auto_earnings_created', v_auto_earnings, 'skipped_sites', v_skipped,
    'total_pool', v_total_pool_c::numeric / 100, 'total_entries', v_auto_earnings, 'warnings', v_warnings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_payroll_site_effective_rate_card(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_payroll_site_rate_card_override(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_payroll_site_rule_state(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_payroll_site_rule_override(UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalculate_payroll_period(INT, INT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payroll_site_effective_rate_card(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_payroll_site_rate_card_override(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payroll_site_rule_state(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_payroll_site_rule_override(UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_payroll_period(INT, INT, UUID) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');

-- Verification after applying this migration:
-- SELECT
--   to_regclass('public.payroll_site_rate_card_overrides') AS site_rate_card_overrides,
--   to_regprocedure('public.set_payroll_site_rate_card_override(uuid,uuid,uuid,text)') AS set_override_rpc,
--   to_regprocedure('public.get_payroll_site_effective_rate_card(uuid,uuid)') AS get_effective_rpc;
