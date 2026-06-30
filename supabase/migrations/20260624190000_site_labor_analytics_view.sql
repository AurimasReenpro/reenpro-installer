-- Stable, site-level labor analytics source for the admin Reports page.
-- One row is returned for every completed site. Archived sites with actual_end
-- are kept for historical analytics because archiving is represented as status.
--
-- Equipment parsing assumptions:
--   * Modern sites.equipment_details is a JSONB array of EquipmentItem objects:
--     { category, model, quantity, unit, notes, capacity_kwh? }.
--   * Module, optimizer, BESS, and inverter recognition is category/model text based.
--   * equipment_catalog is not joined because equipment_details has no catalog-item ID.
--
-- Known limitations:
--   * Legacy object-shaped equipment_details is intentionally ignored by this view.
--   * Manufacturer is the first word of the module model; multi-word brands are not exact.
--   * Module wattage is parsed from the first W/Wp value in the model text.
--   * For mixed module systems, the scalar module fields describe the largest module row.

CREATE OR REPLACE VIEW public.site_labor_analytics_v
WITH (security_invoker = true)
AS
WITH closed_time AS (
  SELECT
    te.site_id,
    SUM(COALESCE(
      te.duration_minutes::numeric / 60,
      EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 3600
    )) AS total_installer_hours,
    COUNT(*)::integer AS closed_entry_count,
    COUNT(DISTINCT te.installer_id)::integer AS installer_count,
    BOOL_OR(COALESCE(
      te.duration_minutes::numeric / 60,
      EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 3600
    ) > 24) AS has_long_entry
  FROM public.time_entries te
  WHERE te.end_time IS NOT NULL
  GROUP BY te.site_id
),
equipment_rows AS (
  SELECT
    s.id AS site_id,
    COALESCE(NULLIF(btrim(e->>'category'), ''), '') AS category,
    COALESCE(NULLIF(btrim(e->>'model'), ''), '') AS model,
    CASE
      WHEN (e->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN GREATEST((e->>'quantity')::numeric, 0)
      ELSE 0
    END AS quantity
  FROM public.sites s
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(s.equipment_details) = 'array' THEN s.equipment_details
      ELSE '[]'::jsonb
    END
  ) AS e
),
equipment_parsed AS (
  SELECT
    site_id,
    category,
    model,
    quantity,
    lower(category) AS category_normalized,
    lower(model) AS model_normalized,
    CASE
      WHEN substring(model FROM '([0-9]+(?:\.[0-9]+)?)\s*[Ww](?:[Pp])?') IS NOT NULL
        THEN substring(model FROM '([0-9]+(?:\.[0-9]+)?)\s*[Ww](?:[Pp])?')::numeric
      ELSE NULL
    END AS module_wattage_w
  FROM equipment_rows
),
equipment_rollup AS (
  SELECT
    site_id,
    COALESCE(BOOL_OR(
      category_normalized = 'bess'
      OR category_normalized LIKE '%kaupiklis%'
      OR category_normalized LIKE '%baterij%'
      OR category_normalized LIKE '%battery%'
    ), false) AS has_bess,
    COALESCE(SUM(quantity) FILTER (
      WHERE model_normalized LIKE '%optim%'
         OR category_normalized LIKE '%optim%'
    ), 0) AS optimizer_count,
    COALESCE(SUM(quantity) FILTER (
      WHERE category_normalized LIKE '%inverter%'
    ), 0) AS inverter_count,
    COALESCE(SUM(quantity) FILTER (
      WHERE category_normalized LIKE '%modul%'
    ), 0) AS module_count,
    (ARRAY_AGG(category ORDER BY quantity DESC, model NULLS LAST) FILTER (
      WHERE category_normalized LIKE '%modul%'
    ))[1] AS module_type,
    (ARRAY_AGG(NULLIF(model, '') ORDER BY quantity DESC, model NULLS LAST) FILTER (
      WHERE category_normalized LIKE '%modul%'
    ))[1] AS module_model,
    (ARRAY_AGG(NULLIF(split_part(model, ' ', 1), '') ORDER BY quantity DESC, model NULLS LAST) FILTER (
      WHERE category_normalized LIKE '%modul%'
    ))[1] AS module_manufacturer,
    (ARRAY_AGG(module_wattage_w ORDER BY quantity DESC, model NULLS LAST) FILTER (
      WHERE category_normalized LIKE '%modul%'
    ))[1] AS module_wattage_w
  FROM equipment_parsed
  GROUP BY site_id
),
site_metrics AS (
  SELECT
    s.id AS site_id,
    s.code AS site_code,
    s.client_name,
    s.actual_end AS completed_at,
    s.team_id,
    t.name AS team_name,
    s.kwp,
    s.system_type,
    COALESCE(er.has_bess, false) AS has_bess,
    COALESCE(er.optimizer_count, 0) AS optimizer_count,
    COALESCE(er.module_count, 0) AS module_count,
    er.module_type,
    er.module_model,
    er.module_manufacturer,
    er.module_wattage_w,
    COALESCE(er.inverter_count, 0) AS inverter_count,
    s.roof_type,
    s.roof_angle AS roof_slope,
    COALESCE(ct.total_installer_hours, 0) AS total_installer_hours,
    CASE
      WHEN s.actual_start IS NOT NULL AND s.actual_end IS NOT NULL
        THEN GREATEST(EXTRACT(EPOCH FROM (s.actual_end - s.actual_start)) / 3600, 0)
      ELSE NULL
    END AS calendar_hours,
    COALESCE(ct.installer_count, 0) AS installer_count,
    COALESCE(ct.closed_entry_count, 0) AS closed_entry_count,
    COALESCE(ct.has_long_entry, false) AS has_long_entry
  FROM public.sites s
  LEFT JOIN public.teams t ON t.id = s.team_id
  LEFT JOIN closed_time ct ON ct.site_id = s.id
  LEFT JOIN equipment_rollup er ON er.site_id = s.id
  WHERE s.status = 'completed'
     OR (s.status = 'archived' AND s.actual_end IS NOT NULL)
),
calculated_metrics AS (
  SELECT
    sm.*,
    CASE WHEN sm.kwp > 0 THEN sm.total_installer_hours / sm.kwp ELSE NULL END AS h_per_kwp,
    CASE WHEN sm.module_count > 0 THEN sm.total_installer_hours / sm.module_count ELSE NULL END AS h_per_module,
    CASE WHEN sm.optimizer_count > 0 THEN sm.total_installer_hours / sm.optimizer_count ELSE NULL END AS h_per_optimizer
  FROM site_metrics sm
),
flagged AS (
  SELECT
    cm.*,
    to_jsonb(array_remove(ARRAY[
      CASE WHEN cm.has_long_entry THEN 'Laiko įrašas ilgesnis nei 24 val.' END,
      CASE WHEN cm.closed_entry_count = 0 THEN 'Užbaigtas objektas neturi uždarytų laiko įrašų' END,
      CASE WHEN COALESCE(cm.kwp, 0) <= 0 THEN 'Nenurodytas kWp' END,
      CASE WHEN cm.h_per_kwp > 20 THEN 'Neįprastai didelis h/kWp' END,
      CASE WHEN cm.module_count <= 0 THEN 'Nenurodytas modulių kiekis' END
    ], NULL::text)) AS anomaly_reasons
  FROM calculated_metrics cm
)
SELECT
  site_id,
  site_code,
  client_name,
  completed_at,
  team_id,
  team_name,
  kwp,
  system_type,
  has_bess,
  optimizer_count,
  module_count,
  module_type,
  module_model,
  module_manufacturer,
  module_wattage_w,
  inverter_count,
  roof_type,
  roof_slope,
  total_installer_hours,
  calendar_hours,
  installer_count,
  h_per_kwp,
  h_per_module,
  h_per_optimizer,
  jsonb_array_length(anomaly_reasons) > 0 AS is_anomaly,
  anomaly_reasons
FROM flagged;

REVOKE ALL ON TABLE public.site_labor_analytics_v FROM PUBLIC;
GRANT SELECT ON TABLE public.site_labor_analytics_v TO authenticated;

-- Verification queries after applying:
-- SELECT COUNT(*) AS completed_sites FROM public.site_labor_analytics_v;
--
-- SELECT site_code, completed_at, anomaly_reasons
-- FROM public.site_labor_analytics_v
-- WHERE is_anomaly
-- ORDER BY completed_at DESC NULLS LAST;
--
-- SELECT site_code, h_per_kwp, total_installer_hours, kwp
-- FROM public.site_labor_analytics_v
-- ORDER BY h_per_kwp DESC NULLS LAST
-- LIMIT 10;
--
-- SELECT module_model, module_manufacturer, module_wattage_w,
--        COUNT(*) AS site_count, SUM(module_count) AS installed_modules,
--        ROUND(AVG(h_per_module)::numeric, 3) AS avg_h_per_module
-- FROM public.site_labor_analytics_v
-- WHERE module_model IS NOT NULL
-- GROUP BY module_model, module_manufacturer, module_wattage_w
-- ORDER BY installed_modules DESC;

SELECT pg_notify('pgrst', 'reload schema');
