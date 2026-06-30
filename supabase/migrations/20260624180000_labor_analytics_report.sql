-- Labor analytics report: one admin RPC returns the filtered report payload.
-- Module labor for mixed-module sites is allocated proportionally by module count.

CREATE INDEX IF NOT EXISTS idx_sites_completed_team_end
  ON public.sites(status, team_id, actual_end);
CREATE INDEX IF NOT EXISTS idx_photos_site_id ON public.photos(site_id);
CREATE INDEX IF NOT EXISTS idx_site_checklists_site_id ON public.site_checklists(site_id);
CREATE INDEX IF NOT EXISTS idx_site_checklist_items_checklist_status
  ON public.site_checklist_items(site_checklist_id, status);

CREATE OR REPLACE FUNCTION public.get_labor_analytics_report(
  p_filters JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_period_mode TEXT := COALESCE(NULLIF(p_filters->>'period_mode', ''), 'all_time');
  v_year INTEGER := NULLIF(p_filters->>'year', '')::integer;
  v_month INTEGER := NULLIF(p_filters->>'month', '')::integer;
  v_team_id UUID := NULLIF(p_filters->>'team_id', '')::uuid;
  v_installer_id UUID := NULLIF(p_filters->>'installer_id', '')::uuid;
  v_roof_type TEXT := NULLIF(p_filters->>'roof_type', '');
  v_roof_slope TEXT := NULLIF(p_filters->>'roof_slope', '');
  v_has_bess BOOLEAN := CASE WHEN p_filters ? 'has_bess' THEN (p_filters->>'has_bess')::boolean END;
  v_has_optimizers BOOLEAN := CASE WHEN p_filters ? 'has_optimizers' THEN (p_filters->>'has_optimizers')::boolean END;
  v_kwp_min NUMERIC := NULLIF(p_filters->>'kwp_min', '')::numeric;
  v_kwp_max NUMERIC := NULLIF(p_filters->>'kwp_max', '')::numeric;
  v_module_type TEXT := NULLIF(p_filters->>'module_type', '');
  v_module_model TEXT := NULLIF(p_filters->>'module_model', '');
  v_module_manufacturer TEXT := NULLIF(p_filters->>'module_manufacturer', '');
  v_module_count_min NUMERIC := NULLIF(p_filters->>'module_count_min', '')::numeric;
  v_module_count_max NUMERIC := NULLIF(p_filters->>'module_count_max', '')::numeric;
  v_exclude_anomalies BOOLEAN := COALESCE((p_filters->>'exclude_anomalies')::boolean, false);
  v_module_analysis_requested BOOLEAN := p_filters ?| ARRAY[
    'module_type', 'module_model', 'module_manufacturer', 'module_count_min', 'module_count_max'
  ];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_period_mode NOT IN ('all_time', 'month') THEN
    RAISE EXCEPTION 'Unsupported period mode: %', v_period_mode USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_period_mode = 'month' AND (v_year IS NULL OR v_month IS NULL OR v_month NOT BETWEEN 1 AND 12) THEN
    RAISE EXCEPTION 'Month mode requires a valid year and month.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN (
    WITH time_rollup AS (
      SELECT
        te.site_id,
        SUM(COALESCE(te.duration_minutes::numeric / 60, EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 3600)) AS total_installer_hours,
        COUNT(DISTINCT te.installer_id)::int AS installer_count,
        BOOL_OR(COALESCE(te.duration_minutes::numeric / 60, EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 3600) > 24) AS has_long_entry
      FROM public.time_entries te
      WHERE te.end_time IS NOT NULL
      GROUP BY te.site_id
    ),
    module_items AS (
      SELECT
        s.id AS site_id,
        COALESCE(NULLIF(e->>'category', ''), 'Moduliai') AS module_type,
        NULLIF(btrim(e->>'model'), '') AS module_model,
        NULLIF(split_part(btrim(e->>'model'), ' ', 1), '') AS manufacturer,
        CASE WHEN (e->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$' THEN GREATEST((e->>'quantity')::numeric, 0) ELSE 0 END AS module_count,
        CASE WHEN substring(e->>'model' FROM '([0-9]+(?:\.[0-9]+)?)\s*[Ww](?:[Pp])?') IS NOT NULL
          THEN substring(e->>'model' FROM '([0-9]+(?:\.[0-9]+)?)\s*[Ww](?:[Pp])?')::numeric
          ELSE NULL END AS module_wattage_w
      FROM public.sites s
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(s.equipment_details) = 'array' THEN s.equipment_details ELSE '[]'::jsonb END
      ) e
      WHERE lower(COALESCE(e->>'category', '')) LIKE '%modul%'
    ),
    module_rollup AS (
      SELECT
        site_id,
        SUM(module_count) AS module_count,
        SUM(module_count * COALESCE(module_wattage_w, 0)) AS total_module_power_w,
        (array_agg(module_type ORDER BY module_count DESC, module_model NULLS LAST))[1] AS module_type,
        (array_agg(module_model ORDER BY module_count DESC, module_model NULLS LAST))[1] AS module_model,
        (array_agg(manufacturer ORDER BY module_count DESC, module_model NULLS LAST))[1] AS module_manufacturer,
        (array_agg(module_wattage_w ORDER BY module_count DESC, module_model NULLS LAST))[1] AS module_wattage_w,
        jsonb_agg(jsonb_build_object(
          'module_type', module_type,
          'module_model', module_model,
          'manufacturer', manufacturer,
          'module_count', module_count,
          'module_wattage_w', module_wattage_w,
          'total_module_power_w', module_count * COALESCE(module_wattage_w, 0)
        ) ORDER BY module_count DESC, module_model NULLS LAST) AS module_mix
      FROM module_items
      WHERE module_count > 0
      GROUP BY site_id
    ),
    site_base AS (
      SELECT
        s.id AS site_id,
        s.code AS site_code,
        s.client_name,
        s.actual_end AS completed_at,
        s.team_id,
        t.name AS team_name,
        s.kwp,
        s.system_type,
        public.payroll_site_has_bess(s.equipment_details) AS has_bess,
        COALESCE(public.payroll_optimizer_count(s.equipment_details), 0) AS optimizer_count,
        COALESCE((
          SELECT SUM(CASE WHEN (e->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$' THEN (e->>'quantity')::numeric ELSE 0 END)
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.equipment_details) = 'array' THEN s.equipment_details ELSE '[]'::jsonb END) e
          WHERE lower(COALESCE(e->>'category', '')) LIKE '%inverter%'
        ), 0) AS inverter_count,
        mr.module_type,
        mr.module_model,
        mr.module_manufacturer,
        mr.module_count,
        mr.total_module_power_w,
        mr.module_wattage_w,
        COALESCE(mr.module_mix, '[]'::jsonb) AS module_mix,
        s.roof_type,
        s.roof_angle AS roof_slope,
        COALESCE(tr.total_installer_hours, 0) AS total_installer_hours,
        CASE WHEN s.actual_start IS NOT NULL AND s.actual_end IS NOT NULL
          THEN GREATEST(EXTRACT(EPOCH FROM (s.actual_end - s.actual_start)) / 3600, 0)
          ELSE NULL END AS calendar_hours,
        COALESCE(tr.installer_count, 0) AS installer_count,
        COALESCE(tr.has_long_entry, false) AS has_long_entry,
        COALESCE((
          SELECT COUNT(*)
          FROM public.site_checklists sc
          JOIN public.site_checklist_items sci ON sci.site_checklist_id = sc.id
          WHERE sc.site_id = s.id AND sci.status = 'fail'
        ), 0)::int AS checklist_fail_count,
        COALESCE((SELECT COUNT(*) FROM public.photos p WHERE p.site_id = s.id), 0)::int AS photo_count
      FROM public.sites s
      LEFT JOIN public.teams t ON t.id = s.team_id
      LEFT JOIN time_rollup tr ON tr.site_id = s.id
      LEFT JOIN module_rollup mr ON mr.site_id = s.id
      WHERE s.status = 'completed'
        AND s.actual_end IS NOT NULL
        AND (
          v_period_mode = 'all_time'
          OR (
            EXTRACT(YEAR FROM (s.actual_end AT TIME ZONE 'Europe/Vilnius')) = v_year
            AND EXTRACT(MONTH FROM (s.actual_end AT TIME ZONE 'Europe/Vilnius')) = v_month
          )
        )
        AND (v_team_id IS NULL OR s.team_id = v_team_id)
        AND (v_installer_id IS NULL OR EXISTS (
          SELECT 1 FROM public.time_entries te WHERE te.site_id = s.id AND te.installer_id = v_installer_id AND te.end_time IS NOT NULL
        ))
        AND (v_roof_type IS NULL OR s.roof_type = v_roof_type)
        AND (v_roof_slope IS NULL OR s.roof_angle = v_roof_slope)
        AND (v_kwp_min IS NULL OR s.kwp >= v_kwp_min)
        AND (v_kwp_max IS NULL OR s.kwp <= v_kwp_max)
        AND (v_has_bess IS NULL OR public.payroll_site_has_bess(s.equipment_details) = v_has_bess)
        AND (v_has_optimizers IS NULL OR (public.payroll_optimizer_count(s.equipment_details) > 0) = v_has_optimizers)
        AND (v_module_count_min IS NULL OR COALESCE(mr.module_count, 0) >= v_module_count_min)
        AND (v_module_count_max IS NULL OR COALESCE(mr.module_count, 0) <= v_module_count_max)
        AND (v_module_type IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(mr.module_mix, '[]'::jsonb)) m WHERE m->>'module_type' = v_module_type))
        AND (v_module_model IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(mr.module_mix, '[]'::jsonb)) m WHERE m->>'module_model' = v_module_model))
        AND (v_module_manufacturer IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(mr.module_mix, '[]'::jsonb)) m WHERE m->>'manufacturer' = v_module_manufacturer))
    ),
    metrics AS (
      SELECT
        sb.*,
        CASE WHEN sb.kwp > 0 THEN sb.total_installer_hours / sb.kwp ELSE NULL END AS h_per_kwp,
        CASE WHEN sb.module_count > 0 THEN sb.total_installer_hours / sb.module_count ELSE NULL END AS h_per_module,
        CASE WHEN sb.optimizer_count > 0 THEN sb.total_installer_hours / sb.optimizer_count ELSE NULL END AS h_per_optimizer
      FROM site_base sb
    ),
    flagged AS (
      SELECT
        m.*,
        to_jsonb(array_remove(ARRAY[
          CASE WHEN m.has_long_entry THEN 'Laiko įrašas ilgesnis nei 24 val.' END,
          CASE WHEN m.h_per_kwp > 20 THEN 'Neįprastai didelis h/kWp' END,
          CASE WHEN m.total_installer_hours = 0 THEN 'Užbaigtas objektas neturi uždarytų laiko įrašų' END,
          CASE WHEN COALESCE(m.kwp, 0) <= 0 THEN 'Nenurodytas kWp' END,
          CASE WHEN v_module_analysis_requested AND COALESCE(m.module_count, 0) <= 0 THEN 'Nenurodytas modulių kiekis' END
        ], NULL::text)) AS anomaly_reasons
      FROM metrics m
    ),
    selected_sites AS (
      SELECT *, jsonb_array_length(anomaly_reasons) > 0 AS is_anomaly
      FROM flagged
    ),
    filtered_sites AS (
      SELECT * FROM selected_sites WHERE NOT v_exclude_anomalies OR jsonb_array_length(anomaly_reasons) = 0
    ),
    module_expanded AS (
      SELECT fs.*, m AS module_item,
        (m->>'module_count')::numeric AS module_item_count
      FROM filtered_sites fs
      CROSS JOIN LATERAL jsonb_array_elements(fs.module_mix) m
      WHERE (m->>'module_count')::numeric > 0
    )
    SELECT jsonb_build_object(
      'kpis', jsonb_build_object(
        'avg_h_per_kwp', (SELECT ROUND(AVG(h_per_kwp)::numeric, 2) FROM filtered_sites),
        'median_h_per_kwp', (SELECT ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY h_per_kwp))::numeric, 2) FROM filtered_sites WHERE h_per_kwp IS NOT NULL),
        'avg_h_per_module', (SELECT ROUND(AVG(h_per_module)::numeric, 3) FROM filtered_sites),
        'median_h_per_module', (SELECT ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY h_per_module))::numeric, 3) FROM filtered_sites WHERE h_per_module IS NOT NULL),
        'total_installer_hours', (SELECT ROUND(COALESCE(SUM(total_installer_hours), 0)::numeric, 2) FROM filtered_sites),
        'completed_sites', (SELECT COUNT(*) FROM filtered_sites),
        'anomaly_count', (SELECT COUNT(*) FROM selected_sites WHERE jsonb_array_length(anomaly_reasons) > 0),
        'avg_team_size', (SELECT ROUND(AVG(installer_count)::numeric, 2) FROM filtered_sites)
      ),
      'by_team', COALESCE((SELECT jsonb_agg(row_data ORDER BY label) FROM (
        SELECT COALESCE(team_name, 'Nepriskirta') AS label, jsonb_build_object('label', COALESCE(team_name, 'Nepriskirta'), 'avg_h_per_kwp', ROUND(AVG(h_per_kwp)::numeric, 2), 'site_count', COUNT(*)) AS row_data
        FROM filtered_sites GROUP BY team_name
      ) grouped), '[]'::jsonb),
      'by_roof', COALESCE((SELECT jsonb_agg(row_data ORDER BY label) FROM (
        SELECT COALESCE(roof_type, 'Nenurodyta') AS label, jsonb_build_object('label', COALESCE(roof_type, 'Nenurodyta'), 'avg_h_per_kwp', ROUND(AVG(h_per_kwp)::numeric, 2), 'site_count', COUNT(*)) AS row_data
        FROM filtered_sites GROUP BY roof_type
      ) grouped), '[]'::jsonb),
      'by_bess', COALESCE((SELECT jsonb_agg(row_data ORDER BY label) FROM (
        SELECT CASE WHEN has_bess THEN 'BESS' ELSE 'Be BESS' END AS label, jsonb_build_object('label', CASE WHEN has_bess THEN 'BESS' ELSE 'Be BESS' END, 'avg_h_per_kwp', ROUND(AVG(h_per_kwp)::numeric, 2), 'site_count', COUNT(*)) AS row_data
        FROM filtered_sites GROUP BY has_bess
      ) grouped), '[]'::jsonb),
      'by_optimizers', COALESCE((SELECT jsonb_agg(row_data ORDER BY label) FROM (
        SELECT CASE WHEN optimizer_count > 0 THEN 'Su optimizatoriais' ELSE 'Be optimizatorių' END AS label, jsonb_build_object('label', CASE WHEN optimizer_count > 0 THEN 'Su optimizatoriais' ELSE 'Be optimizatorių' END, 'avg_h_per_kwp', ROUND(AVG(h_per_kwp)::numeric, 2), 'site_count', COUNT(*)) AS row_data
        FROM filtered_sites GROUP BY optimizer_count > 0
      ) grouped), '[]'::jsonb),
      'by_equipment', COALESCE((SELECT jsonb_agg(row_data ORDER BY label) FROM (
        SELECT COALESCE(system_type, 'Nenurodyta') AS label, jsonb_build_object('label', COALESCE(system_type, 'Nenurodyta'), 'avg_h_per_kwp', ROUND(AVG(h_per_kwp)::numeric, 2), 'site_count', COUNT(*)) AS row_data
        FROM filtered_sites GROUP BY system_type
      ) grouped), '[]'::jsonb),
      'by_module_type', COALESCE((SELECT jsonb_agg(row_data ORDER BY module_type) FROM (
        SELECT module_item->>'module_type' AS module_type, jsonb_build_object(
          'module_type', module_item->>'module_type', 'module_model', NULL, 'manufacturer', NULL,
          'site_count', COUNT(DISTINCT site_id), 'module_count', SUM(module_item_count),
          'total_hours', ROUND(SUM(total_installer_hours * module_item_count / NULLIF(module_count, 0))::numeric, 2),
          'avg_h_per_module', ROUND((SUM(total_installer_hours * module_item_count / NULLIF(module_count, 0)) / NULLIF(SUM(module_item_count), 0))::numeric, 3),
          'median_h_per_module', ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY h_per_module))::numeric, 3),
          'avg_h_per_kwp', ROUND(AVG(h_per_kwp)::numeric, 2), 'anomaly_count', COUNT(*) FILTER (WHERE is_anomaly)
        ) AS row_data
        FROM module_expanded GROUP BY module_item->>'module_type'
      ) grouped), '[]'::jsonb),
      'by_module_model', COALESCE((SELECT jsonb_agg(row_data ORDER BY module_model) FROM (
        SELECT module_item->>'module_model' AS module_model, jsonb_build_object(
          'module_type', module_item->>'module_type', 'module_model', module_item->>'module_model', 'manufacturer', module_item->>'manufacturer',
          'module_wattage_w', NULLIF(module_item->>'module_wattage_w', '')::numeric,
          'site_count', COUNT(DISTINCT site_id), 'module_count', SUM(module_item_count),
          'total_hours', ROUND(SUM(total_installer_hours * module_item_count / NULLIF(module_count, 0))::numeric, 2),
          'avg_h_per_module', ROUND((SUM(total_installer_hours * module_item_count / NULLIF(module_count, 0)) / NULLIF(SUM(module_item_count), 0))::numeric, 3),
          'median_h_per_module', ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY h_per_module))::numeric, 3),
          'avg_h_per_kwp', ROUND(AVG(h_per_kwp)::numeric, 2), 'anomaly_count', COUNT(*) FILTER (WHERE is_anomaly)
        ) AS row_data
        FROM module_expanded
        GROUP BY module_item->>'module_type', module_item->>'module_model', module_item->>'manufacturer', module_item->>'module_wattage_w'
      ) grouped), '[]'::jsonb),
      'sites', COALESCE((SELECT jsonb_agg(to_jsonb(filtered_sites) ORDER BY completed_at DESC) FROM filtered_sites), '[]'::jsonb),
      'anomalies', COALESCE((SELECT jsonb_agg(to_jsonb(selected_sites) ORDER BY completed_at DESC) FROM selected_sites WHERE is_anomaly), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_labor_analytics_report(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_labor_analytics_report(JSONB) TO authenticated;
SELECT pg_notify('pgrst', 'reload schema');

-- Verification after applying:
-- SELECT public.get_labor_analytics_report('{"period_mode":"month","year":2026,"month":6}'::jsonb);
