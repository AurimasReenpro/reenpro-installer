-- ============================================================
-- Supabase SQL Editor patch: payroll recalc stale-function fix
--
-- Context:
--   supabase/migrations/20260616120000_payroll_rule_overrides.sql
--   was already applied, then edited afterward. db push will not re-apply
--   that edited migration, so this patch replaces only the functions needed
--   for the live DB to match the latest migration logic.
--
-- Includes:
--   - public.payroll_compute_site_rules(uuid, uuid, uuid)
--   - public.get_payroll_site_rule_state(uuid, uuid)
--   - public.set_payroll_site_rule_override(uuid, uuid, uuid, text, numeric, numeric, text)
--   - public.recalculate_payroll_period(int, int, uuid)
--
-- Does not drop tables, delete payroll_site_snapshots, delete manual
-- earnings_entries, remove legacy payroll objects, or implement XLSX.
-- ============================================================

CREATE OR REPLACE FUNCTION public.payroll_compute_site_rules(
  p_period_id    uuid,
  p_site_id      uuid,
  p_rate_card_id uuid
)
RETURNS TABLE (
  rate_rule_id        uuid,
  code                text,
  label               text,
  rule_type           text,
  amount              numeric,
  unit                text,
  params              jsonb,
  default_applicable  boolean,
  detected_quantity   numeric,
  mode                text,
  quantity_override   numeric,
  amount_override     numeric,
  note                text,
  effective_quantity  numeric,
  effective_amount    numeric,
  effective_applied   boolean,
  reason              text,
  source              text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kwp      numeric;
  v_equip    jsonb;
  v_has_bess boolean;
  v_opt      numeric;
  v_hours    numeric;
BEGIN
  SELECT s.kwp, s.equipment_details
  INTO v_kwp, v_equip
  FROM public.sites s
  WHERE s.id = p_site_id;

  v_has_bess := public.payroll_site_has_bess(v_equip);
  v_opt      := public.payroll_optimizer_count(v_equip);

  SELECT COALESCE(SUM(COALESCE(te.duration_minutes, EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 60.0)), 0) / 60.0
  INTO v_hours
  FROM public.time_entries te
  WHERE te.site_id = p_site_id
    AND te.end_time IS NOT NULL;

  RETURN QUERY
  WITH base AS (
    SELECT
      r.id,
      r.code,
      r.label,
      r.rule_type,
      r.amount,
      r.unit,
      r.params,
      o.mode AS o_mode,
      o.quantity_override AS o_qty,
      o.amount_override AS o_amt,
      o.note AS o_note,
      CASE r.rule_type
        WHEN 'base_site_fee' THEN true
        WHEN 'bess_fixed' THEN v_has_bess
        WHEN 'optimizer_per_unit' THEN (v_opt > 0)
        WHEN 'efficiency_bonus' THEN (
          CASE
            WHEN r.params ? 'target_hours' THEN v_hours <= (r.params->>'target_hours')::numeric
            WHEN r.params ? 'target_hours_per_kwp' THEN v_hours <= COALESCE(v_kwp, 0) * (r.params->>'target_hours_per_kwp')::numeric
            ELSE false
          END
        )
        ELSE false
      END AS def_app,
      CASE
        WHEN r.rule_type = 'optimizer_per_unit' THEN v_opt
        ELSE NULL::numeric
      END AS det_qty
    FROM public.payroll_rate_rules r
    LEFT JOIN public.payroll_site_rule_overrides o
      ON o.rate_rule_id = r.id
     AND o.period_id = p_period_id
     AND o.site_id = p_site_id
    WHERE r.rate_card_id = p_rate_card_id
      AND r.is_active
  ),
  calc AS (
    SELECT
      b.*,
      COALESCE(b.o_mode, 'auto') AS m,
      CASE COALESCE(b.o_mode, 'auto')
        WHEN 'force_skip' THEN false
        WHEN 'force_apply' THEN true
        ELSE b.def_app
      END AS eff_applied,
      COALESCE(b.o_amt, b.amount) AS unit_amount,
      CASE
        WHEN b.unit = 'per_unit' THEN COALESCE(b.o_qty, b.det_qty, 0)
        ELSE NULL::numeric
      END AS eff_qty
    FROM base b
  )
  SELECT
    c.id,
    c.code,
    c.label,
    c.rule_type,
    c.amount,
    c.unit,
    c.params,
    c.def_app,
    c.det_qty,
    c.m,
    c.o_qty,
    c.o_amt,
    c.o_note,
    c.eff_qty,
    CASE
      WHEN NOT c.eff_applied THEN 0::numeric
      WHEN c.unit = 'per_unit' THEN c.unit_amount * c.eff_qty
      ELSE c.unit_amount
    END AS eff_amount,
    c.eff_applied,
    CASE
      WHEN c.m = 'force_skip' THEN 'Praleista rankiniu būdu' || COALESCE(' - ' || c.o_note, '')
      WHEN c.m = 'force_apply' THEN 'Pritaikyta rankiniu būdu' || COALESCE(' - ' || c.o_note, '')
      WHEN c.eff_applied THEN 'Automatinis'
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

REVOKE ALL ON FUNCTION public.payroll_compute_site_rules(uuid, uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_payroll_site_rule_state(
  p_period_id uuid,
  p_site_id uuid
)
RETURNS TABLE (
  rate_rule_id        uuid,
  code                text,
  label               text,
  rule_type           text,
  amount              numeric,
  unit                text,
  params              jsonb,
  default_applicable  boolean,
  detected_quantity   numeric,
  mode                text,
  quantity_override   numeric,
  amount_override     numeric,
  note                text,
  effective_quantity  numeric,
  effective_amount    numeric,
  effective_applied   boolean,
  reason              text,
  source              text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali matyti įkainių būseną.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT rate_card_id
  INTO v_card
  FROM public.payroll_periods
  WHERE id = p_period_id;

  IF v_card IS NULL THEN
    RAISE EXCEPTION 'Periodas neturi priskirtos tarifų kortelės - pirma perskaičiuokite.' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.payroll_compute_site_rules(p_period_id, p_site_id, v_card);
END;
$$;

REVOKE ALL ON FUNCTION public.get_payroll_site_rule_state(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payroll_site_rule_state(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_payroll_site_rule_override(
  p_period_id uuid,
  p_site_id uuid,
  p_rate_rule_id uuid,
  p_mode text,
  p_quantity_override numeric,
  p_amount_override numeric,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status  text;
  v_unit    text;
  v_card    uuid;
  v_equip   jsonb;
  v_det_qty numeric;
  v_row     public.payroll_site_rule_overrides;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Tik administratorius gali keisti įkainių taikymą.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status, rate_card_id
  INTO v_status, v_card
  FROM public.payroll_periods
  WHERE id = p_period_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll periodas nerastas (id=%).', p_period_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'Periodas užrakintas - taisyklių keisti negalima.' USING ERRCODE = 'restrict_violation';
  END IF;

  IF p_mode NOT IN ('auto', 'force_apply', 'force_skip') THEN
    RAISE EXCEPTION 'Neleistinas režimas: %.', p_mode USING ERRCODE = 'check_violation';
  END IF;

  SELECT unit
  INTO v_unit
  FROM public.payroll_rate_rules
  WHERE id = p_rate_rule_id
    AND rate_card_id = v_card;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Taisyklė nepriklauso šio periodo tarifų kortelei.' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF p_mode = 'auto' THEN
    DELETE FROM public.payroll_site_rule_overrides
    WHERE period_id = p_period_id
      AND site_id = p_site_id
      AND rate_rule_id = p_rate_rule_id;

    RETURN jsonb_build_object('cleared', true);
  END IF;

  IF p_note IS NULL OR char_length(btrim(p_note)) < 5 THEN
    RAISE EXCEPTION 'Pastaba privaloma (bent 5 simboliai) keičiant taisyklės taikymą.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_mode = 'force_apply' AND v_unit = 'per_unit' AND p_quantity_override IS NULL THEN
    SELECT equipment_details
    INTO v_equip
    FROM public.sites
    WHERE id = p_site_id;

    v_det_qty := public.payroll_optimizer_count(v_equip);

    IF v_det_qty IS NULL OR v_det_qty <= 0 THEN
      RAISE EXCEPTION 'Šiai "už vnt." taisyklei reikia nurodyti kiekį (kiekis nenustatytas automatiškai).'
        USING ERRCODE = 'check_violation';
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

REVOKE ALL ON FUNCTION public.set_payroll_site_rule_override(uuid, uuid, uuid, text, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_payroll_site_rule_override(uuid, uuid, uuid, text, numeric, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.recalculate_payroll_period(
  p_year int,
  p_month int,
  p_rate_card_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             uuid := auth.uid();
  v_period_id       uuid;
  v_status          text;
  v_site            record;
  v_rule            record;
  v_participants    uuid[];
  v_override        jsonb;
  v_excluded        boolean;
  v_source          text;
  v_used_fallback   boolean;
  v_included        boolean;
  v_n               int;
  v_snapshot_id     uuid;
  v_kept_site_ids   uuid[] := '{}';

  v_amt_cents       bigint;
  v_base_cents      bigint;
  v_addon_cents     bigint;
  v_bonus_cents     bigint;
  v_pool_cents      bigint;

  v_has_bess        boolean;
  v_opt_count       numeric;
  v_n_base          int;
  v_n_bess          int;
  v_n_opt           int;

  v_share_base      bigint;
  v_remainder       int;
  v_share_cents     bigint;
  v_sum_cents       bigint;
  v_inserted        int;
  v_db_auto_entries int;
  v_db_auto_cents   bigint;
  v_i               int;
  v_desc            text;

  v_site_warnings   jsonb;
  v_rules_json      jsonb;
  v_breakdown       jsonb;
  v_processed       int := 0;
  v_snapshots       int := 0;
  v_auto_earnings   int := 0;
  v_skipped         int := 0;
  v_total_pool_c    bigint := 0;
  v_warnings        jsonb := '[]'::jsonb;
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

  SELECT id, status
  INTO v_period_id, v_status
  FROM public.payroll_periods
  WHERE year = p_year
    AND month = p_month;

  IF FOUND THEN
    IF v_status = 'locked' THEN
      RAISE EXCEPTION 'Periodas užrakintas - perskaičiuoti negalima.' USING ERRCODE = 'restrict_violation';
    END IF;
    UPDATE public.payroll_periods
    SET rate_card_id = p_rate_card_id
    WHERE id = v_period_id;
  ELSE
    INSERT INTO public.payroll_periods (year, month, status, rate_card_id)
    VALUES (p_year, p_month, 'open', p_rate_card_id)
    ON CONFLICT (year, month) DO UPDATE
      SET rate_card_id = EXCLUDED.rate_card_id
    RETURNING id INTO v_period_id;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE rule_type = 'base_site_fee'),
    COUNT(*) FILTER (WHERE rule_type = 'bess_fixed'),
    COUNT(*) FILTER (WHERE rule_type = 'optimizer_per_unit')
  INTO v_n_base, v_n_bess, v_n_opt
  FROM public.payroll_rate_rules
  WHERE rate_card_id = p_rate_card_id
    AND is_active;

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
    WHERE period_id = v_period_id
      AND site_id = v_site.site_id;

    v_excluded := COALESCE(v_excluded, false);
    v_used_fallback := false;

    IF v_override IS NOT NULL THEN
      SELECT array_agg(val::uuid ORDER BY val::uuid)
      INTO v_participants
      FROM jsonb_array_elements_text(v_override) AS t(val);

      v_source := 'manual';
      v_site_warnings := v_site_warnings || to_jsonb('Naudotas rankinis dalyvių sąrašas (override).'::text);
    ELSE
      SELECT array_agg(DISTINCT te.installer_id ORDER BY te.installer_id)
      INTO v_participants
      FROM public.time_entries te
      WHERE te.site_id = v_site.site_id
        AND te.end_time IS NOT NULL;

      IF v_participants IS NOT NULL AND array_length(v_participants, 1) IS NOT NULL THEN
        v_source := 'time_entries';
      ELSE
        SELECT array_agg(DISTINCT sa.installer_id ORDER BY sa.installer_id)
        INTO v_participants
        FROM public.site_assignments sa
        WHERE sa.site_id = v_site.site_id;

        IF v_participants IS NOT NULL AND array_length(v_participants, 1) IS NOT NULL THEN
          v_source := 'assignments';
          v_used_fallback := true;
          v_site_warnings := v_site_warnings || to_jsonb('Nėra uždarytų laiko įrašų - naudoti priskirti montuotojai.'::text);
        ELSE
          v_source := 'auto';
        END IF;
      END IF;
    END IF;

    v_n := COALESCE(array_length(v_participants, 1), 0);

    v_base_cents := 0;
    v_addon_cents := 0;
    v_bonus_cents := 0;
    v_pool_cents := 0;
    v_rules_json := '[]'::jsonb;

    FOR v_rule IN
      SELECT *
      FROM public.payroll_compute_site_rules(v_period_id, v_site.site_id, p_rate_card_id)
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

    v_has_bess := public.payroll_site_has_bess(v_site.equipment_details);
    v_opt_count := public.payroll_optimizer_count(v_site.equipment_details);

    IF v_n_base = 0 THEN
      v_site_warnings := v_site_warnings || to_jsonb('Nėra aktyvios base_site_fee taisyklės - bazinis mokestis 0.'::text);
    END IF;
    IF v_has_bess AND v_n_bess = 0 THEN
      v_site_warnings := v_site_warnings || to_jsonb('Aptiktas BESS, bet nėra aktyvios bess_fixed taisyklės.'::text);
    END IF;
    IF v_opt_count > 0 AND v_n_opt = 0 THEN
      v_site_warnings := v_site_warnings || to_jsonb('Aptikti optimizatoriai, bet nėra aktyvios optimizer_per_unit taisyklės.'::text);
    END IF;
    IF v_pool_cents = 0 THEN
      v_site_warnings := v_site_warnings || to_jsonb('Objekto fondas yra 0 EUR.'::text);
    END IF;

    v_included := NOT v_excluded;

    IF v_excluded THEN
      v_site_warnings := v_site_warnings || to_jsonb('Objektas rankiniu būdu pašalintas iš atlygio - auto įrašai nekuriami.'::text);
    ELSIF v_n = 0 THEN
      v_site_warnings := v_site_warnings || to_jsonb('Nėra dalyvių - montuotojų įrašai nesukurti.'::text);
    END IF;

    v_breakdown := jsonb_build_object(
      'rate_card_id',       p_rate_card_id,
      'participant_source', v_source,
      'manually_excluded',  v_excluded,
      'has_bess',           v_has_bess,
      'optimizer_count',    v_opt_count,
      'participant_count',  v_n,
      'rules',              v_rules_json,
      'pool_cents',         v_pool_cents
    );

    INSERT INTO public.payroll_site_snapshots AS ss
      (period_id, site_id, included, participant_ids, participant_source,
       base_amount, addon_amount, bonus_amount, deduction_amount,
       total_pool, calculation_breakdown, warnings, recalculated_at)
    VALUES
      (v_period_id, v_site.site_id, v_included,
       to_jsonb(COALESCE(v_participants, '{}'::uuid[])), v_source,
       (v_base_cents)::numeric / 100,
       (v_addon_cents)::numeric / 100,
       (v_bonus_cents)::numeric / 100,
       0,
       (v_pool_cents)::numeric / 100,
       v_breakdown,
       v_site_warnings,
       now())
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

    PERFORM set_config('app.allow_auto_ledger_delete', 'on', true);
    DELETE FROM public.earnings_entries
    WHERE period_id = v_period_id
      AND site_snapshot_id = v_snapshot_id
      AND source = 'auto';
    PERFORM set_config('app.allow_auto_ledger_delete', 'off', true);

    IF jsonb_array_length(v_site_warnings) > 0 THEN
      SELECT v_warnings || COALESCE(jsonb_agg(format('Objektas %s: %s', v_site.site_code, w.value)), '[]'::jsonb)
      INTO v_warnings
      FROM jsonb_array_elements_text(v_site_warnings) AS w(value);
    END IF;

    IF v_excluded OR v_n = 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_pool_cents = 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_share_base := v_pool_cents / v_n;
    v_remainder := (v_pool_cents - v_share_base * v_n)::int;
    v_desc := 'Objekto ' || v_site.site_code || ' atlygio dalis';

    IF v_source = 'manual' THEN
      v_desc := v_desc || ' [rankinis dalyvių sąrašas]';
    ELSIF v_used_fallback THEN
      v_desc := v_desc || ' [be laiko įrašų]';
    END IF;

    v_sum_cents := 0;
    v_inserted := 0;

    FOR v_i IN 1 .. v_n LOOP
      v_share_cents := v_share_base + CASE WHEN v_i = 1 THEN v_remainder ELSE 0 END;

      INSERT INTO public.earnings_entries
        (period_id, site_snapshot_id, installer_id, entry_type, amount, source, description, created_by)
      VALUES
        (v_period_id, v_snapshot_id, v_participants[v_i], 'site_share', (v_share_cents)::numeric / 100, 'auto', v_desc, v_uid);

      v_sum_cents := v_sum_cents + v_share_cents;
      v_inserted := v_inserted + 1;
    END LOOP;

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
    v_processed := v_processed + 1;
    v_total_pool_c := v_total_pool_c + v_pool_cents;
  END LOOP;

  UPDATE public.payroll_site_snapshots
  SET included = false
  WHERE period_id = v_period_id
    AND NOT (site_id = ANY (v_kept_site_ids));

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

  UPDATE public.payroll_periods
  SET status = 'review'
  WHERE id = v_period_id
    AND status <> 'locked';

  RETURN jsonb_build_object(
    'period_id', v_period_id,
    'year', p_year,
    'month', p_month,
    'rate_card_id', p_rate_card_id,
    'processed_sites', v_processed,
    'snapshots_created_or_updated', v_snapshots,
    'auto_earnings_created', v_auto_earnings,
    'skipped_sites', v_skipped,
    'total_pool', (v_total_pool_c)::numeric / 100,
    'total_entries', v_auto_earnings,
    'warnings', v_warnings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_payroll_period(int, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_payroll_period(int, int, uuid) TO authenticated;

-- Reload PostgREST schema cache so RPC changes are visible immediately.
select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- Verification SQL (run manually after applying this patch).
-- ============================================================

-- A) Check function arguments:
-- select
--   p.proname,
--   pg_get_function_arguments(p.oid) as args,
--   pg_get_function_result(p.oid) as returns
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in (
--     'payroll_compute_site_rules',
--     'get_payroll_site_rule_state',
--     'set_payroll_site_rule_override',
--     'recalculate_payroll_period'
--   )
-- order by p.proname;

-- B) Reconciliation check:
-- select
--   s.id as snapshot_id,
--   s.site_id,
--   s.total_pool,
--   jsonb_array_length(s.participant_ids) as participants,
--   coalesce(sum(e.amount) filter (
--     where e.source='auto' and e.entry_type='site_share'
--   ), 0) as auto_sum,
--   count(e.id) filter (
--     where e.source='auto' and e.entry_type='site_share'
--   ) as auto_entries
-- from public.payroll_site_snapshots s
-- left join public.earnings_entries e on e.site_snapshot_id = s.id
-- where s.included
-- group by s.id, s.site_id, s.total_pool, s.participant_ids
-- order by s.total_pool desc;

-- Expected after running recalculate:
-- - if total_pool > 0 and participants > 0:
--   auto_sum = total_pool
--   auto_entries = participants
