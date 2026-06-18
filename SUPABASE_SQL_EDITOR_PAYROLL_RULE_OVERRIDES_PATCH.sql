-- ============================================================
-- Supabase SQL Editor patch: payroll rule override RPCs
--
-- Safe for dev/staging. This patch only adds/updates:
--   - public.payroll_site_rule_overrides
--   - public.get_payroll_site_rule_state(...)
--   - public.set_payroll_site_rule_override(...)
--
-- It does not delete payroll data, earnings_entries, snapshots, or legacy
-- payroll objects. It does not implement XLSX export.
-- ============================================================

-- 1. Per-site rule override table.
CREATE TABLE IF NOT EXISTS public.payroll_site_rule_overrides (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id         uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  site_id           uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  rate_rule_id      uuid NOT NULL REFERENCES public.payroll_rate_rules(id) ON DELETE CASCADE,
  mode              text NOT NULL DEFAULT 'auto',
  quantity_override numeric,
  amount_override   numeric(10,2),
  note              text,
  updated_by        uuid REFERENCES public.user_profiles(id),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Patch path if the table was created partially before.
ALTER TABLE public.payroll_site_rule_overrides
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS rate_rule_id uuid REFERENCES public.payroll_rate_rules(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS quantity_override numeric,
  ADD COLUMN IF NOT EXISTS amount_override numeric(10,2),
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payroll_site_rule_overrides_mode_check'
      AND conrelid = 'public.payroll_site_rule_overrides'::regclass
  ) THEN
    ALTER TABLE public.payroll_site_rule_overrides
      ADD CONSTRAINT payroll_site_rule_overrides_mode_check
      CHECK (mode IN ('auto', 'force_apply', 'force_skip'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_site_rule_overrides_period_site_rule_key
  ON public.payroll_site_rule_overrides(period_id, site_id, rate_rule_id);

-- Required indexes.
CREATE INDEX IF NOT EXISTS payroll_site_rule_overrides_period_site_idx
  ON public.payroll_site_rule_overrides(period_id, site_id);

CREATE INDEX IF NOT EXISTS payroll_site_rule_overrides_rate_rule_idx
  ON public.payroll_site_rule_overrides(rate_rule_id);

-- 2. Admin-only RLS.
ALTER TABLE public.payroll_site_rule_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_site_rule_overrides admin only" ON public.payroll_site_rule_overrides;
CREATE POLICY "payroll_site_rule_overrides admin only"
  ON public.payroll_site_rule_overrides
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.payroll_site_rule_overrides FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payroll_site_rule_overrides TO authenticated;

-- 3. Admin RPC: read the effective rule state for one payroll site snapshot.
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
  v_rate_card_id uuid;
  v_kwp          numeric;
  v_equip        jsonb;
  v_has_bess     boolean := false;
  v_opt_count    numeric := 0;
  v_hours        numeric := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin role required.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT pp.rate_card_id
  INTO v_rate_card_id
  FROM public.payroll_periods pp
  WHERE pp.id = p_period_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll period not found: %.', p_period_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_rate_card_id IS NULL THEN
    RAISE EXCEPTION 'Payroll period has no rate card. Recalculate the period first.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT s.kwp, s.equipment_details
  INTO v_kwp, v_equip
  FROM public.sites s
  WHERE s.id = p_site_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Site not found: %.', p_site_id USING ERRCODE = 'no_data_found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_equip) = 'array' THEN v_equip ELSE '[]'::jsonb END
    ) AS e
    WHERE lower(coalesce(e->>'category', '')) = 'bess'
       OR lower(coalesce(e->>'category', '')) LIKE '%kaupiklis%'
       OR lower(coalesce(e->>'category', '')) LIKE '%baterij%'
       OR lower(coalesce(e->>'category', '')) LIKE '%battery%'
  )
  INTO v_has_bess;

  SELECT COALESCE(SUM(
    CASE
      WHEN (e->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN GREATEST((e->>'quantity')::numeric, 0)
      ELSE 0
    END
  ), 0)
  INTO v_opt_count
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_equip) = 'array' THEN v_equip ELSE '[]'::jsonb END
  ) AS e
  WHERE lower(coalesce(e->>'model', '')) LIKE '%optim%'
     OR lower(coalesce(e->>'category', '')) LIKE '%optim%';

  SELECT COALESCE(
    SUM(COALESCE(te.duration_minutes, EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 60.0)),
    0
  ) / 60.0
  INTO v_hours
  FROM public.time_entries te
  WHERE te.site_id = p_site_id
    AND te.end_time IS NOT NULL;

  RETURN QUERY
  WITH base AS (
    SELECT
      r.id AS rate_rule_id,
      r.code,
      r.label,
      r.rule_type,
      r.amount,
      r.unit,
      r.params,
      o.mode AS override_mode,
      o.quantity_override,
      o.amount_override,
      o.note,
      CASE r.rule_type
        WHEN 'base_site_fee' THEN true
        WHEN 'bess_fixed' THEN v_has_bess
        WHEN 'optimizer_per_unit' THEN v_opt_count > 0
        WHEN 'efficiency_bonus' THEN (
          CASE
            WHEN r.params ? 'target_hours' THEN
              v_hours <= (r.params->>'target_hours')::numeric
            WHEN r.params ? 'target_hours_per_kwp' THEN
              v_hours <= COALESCE(v_kwp, 0) * (r.params->>'target_hours_per_kwp')::numeric
            ELSE false
          END
        )
        ELSE false
      END AS default_applicable,
      CASE
        WHEN r.rule_type = 'optimizer_per_unit' THEN v_opt_count
        ELSE NULL::numeric
      END AS detected_quantity
    FROM public.payroll_rate_rules r
    LEFT JOIN public.payroll_site_rule_overrides o
      ON o.period_id = p_period_id
     AND o.site_id = p_site_id
     AND o.rate_rule_id = r.id
    WHERE r.rate_card_id = v_rate_card_id
      AND r.is_active = true
  ),
  calc AS (
    SELECT
      b.*,
      COALESCE(b.override_mode, 'auto') AS effective_mode,
      CASE COALESCE(b.override_mode, 'auto')
        WHEN 'force_skip' THEN false
        WHEN 'force_apply' THEN true
        ELSE b.default_applicable
      END AS is_applied,
      CASE
        WHEN b.unit = 'per_unit' THEN COALESCE(b.quantity_override, b.detected_quantity, 0)
        ELSE NULL::numeric
      END AS effective_qty,
      COALESCE(b.amount_override, b.amount) AS effective_unit_amount
    FROM base b
  )
  SELECT
    c.rate_rule_id,
    c.code,
    c.label,
    c.rule_type,
    c.amount,
    c.unit,
    c.params,
    c.default_applicable,
    c.detected_quantity,
    c.effective_mode AS mode,
    c.quantity_override,
    c.amount_override,
    c.note,
    c.effective_qty AS effective_quantity,
    CASE
      WHEN NOT c.is_applied THEN 0::numeric
      WHEN c.unit = 'per_unit' THEN c.effective_unit_amount * c.effective_qty
      ELSE c.effective_unit_amount
    END AS effective_amount,
    c.is_applied AS effective_applied,
    CASE
      WHEN c.effective_mode = 'force_skip' THEN 'Skipped manually' || COALESCE(' - ' || c.note, '')
      WHEN c.effective_mode = 'force_apply' THEN 'Applied manually' || COALESCE(' - ' || c.note, '')
      WHEN c.is_applied THEN 'Automatic'
      ELSE 'Not applicable by default'
    END AS reason,
    CASE
      WHEN NOT c.is_applied THEN 'skipped'
      WHEN c.effective_mode <> 'auto' OR c.amount_override IS NOT NULL OR c.quantity_override IS NOT NULL THEN 'manual_override'
      ELSE 'detected'
    END AS source
  FROM calc c
  ORDER BY c.rule_type, c.code;
END;
$$;

REVOKE ALL ON FUNCTION public.get_payroll_site_rule_state(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payroll_site_rule_state(uuid, uuid) TO authenticated;

-- 4. Admin RPC: set or clear one per-site rule override.
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
  v_status    text;
  v_card_id   uuid;
  v_unit      text;
  v_equip     jsonb;
  v_det_qty   numeric := 0;
  v_row       public.payroll_site_rule_overrides;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin role required.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT pp.status, pp.rate_card_id
  INTO v_status, v_card_id
  FROM public.payroll_periods pp
  WHERE pp.id = p_period_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll period not found: %.', p_period_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'Payroll period is locked; rule overrides cannot be changed.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF p_mode NOT IN ('auto', 'force_apply', 'force_skip') THEN
    RAISE EXCEPTION 'Invalid override mode: %.', p_mode USING ERRCODE = 'check_violation';
  END IF;

  SELECT r.unit
  INTO v_unit
  FROM public.payroll_rate_rules r
  WHERE r.id = p_rate_rule_id
    AND r.rate_card_id = v_card_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rate rule does not belong to this payroll period rate card.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF p_mode = 'auto' THEN
    DELETE FROM public.payroll_site_rule_overrides
    WHERE period_id = p_period_id
      AND site_id = p_site_id
      AND rate_rule_id = p_rate_rule_id;

    RETURN jsonb_build_object('cleared', true);
  END IF;

  IF p_note IS NULL OR char_length(btrim(p_note)) < 5 THEN
    RAISE EXCEPTION 'A note of at least 5 characters is required for manual rule overrides.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_mode = 'force_apply' AND v_unit = 'per_unit' AND p_quantity_override IS NULL THEN
    SELECT s.equipment_details
    INTO v_equip
    FROM public.sites s
    WHERE s.id = p_site_id;

    SELECT COALESCE(SUM(
      CASE
        WHEN (e->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN GREATEST((e->>'quantity')::numeric, 0)
        ELSE 0
      END
    ), 0)
    INTO v_det_qty
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_equip) = 'array' THEN v_equip ELSE '[]'::jsonb END
    ) AS e
    WHERE lower(coalesce(e->>'model', '')) LIKE '%optim%'
       OR lower(coalesce(e->>'category', '')) LIKE '%optim%';

    IF v_det_qty IS NULL OR v_det_qty <= 0 THEN
      RAISE EXCEPTION 'This per-unit rule requires a quantity.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.payroll_site_rule_overrides (
    period_id,
    site_id,
    rate_rule_id,
    mode,
    quantity_override,
    amount_override,
    note,
    updated_by,
    updated_at
  )
  VALUES (
    p_period_id,
    p_site_id,
    p_rate_rule_id,
    p_mode,
    p_quantity_override,
    p_amount_override,
    btrim(p_note),
    auth.uid(),
    now()
  )
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

-- Verification queries (uncomment after running this patch):
-- select
--   to_regclass('public.payroll_site_rule_overrides') as overrides_table,
--   to_regprocedure('public.get_payroll_site_rule_state(uuid,uuid)') as get_rule_state_rpc,
--   to_regprocedure('public.set_payroll_site_rule_override(uuid,uuid,uuid,text,numeric,numeric,text)') as set_rule_override_rpc;

select pg_notify('pgrst', 'reload schema');
