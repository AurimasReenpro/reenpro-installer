import { describe, expect, it } from 'vitest';
import { average, calculateLaborAnalyticsKpis, excludeAnomalousSites, groupByModuleModel, median, serializeLaborFilters, type LaborAnalyticsSite } from './reportAnalytics';

const site = (overrides: Partial<LaborAnalyticsSite> = {}): LaborAnalyticsSite => ({
  site_id: 'site-1', site_code: 'OBJ-1', client_name: 'Klientas', completed_at: '2026-06-10T10:00:00Z', team_id: null, team_name: null,
  kwp: 5, system_type: null, has_bess: false, optimizer_count: 0, module_count: 10, module_type: 'Moduliai', module_model: 'Jinko 500W', module_manufacturer: 'Jinko', module_wattage_w: 500,
  inverter_count: 1, roof_type: null, roof_slope: null, total_installer_hours: 5, calendar_hours: 5, installer_count: 2, h_per_kwp: 1, h_per_module: 0.5, h_per_optimizer: null,
  is_anomaly: false, anomaly_reasons: [], ...overrides,
});

describe('labor analytics helpers', () => {
  it('serializes all-time filters without a month', () => {
    expect(serializeLaborFilters({ period_mode: 'all_time', year: 2026, month: 6, has_bess: false }))
      .toEqual({ period_mode: 'all_time', has_bess: false });
  });

  it('serializes the selected month', () => {
    expect(serializeLaborFilters({ period_mode: 'month', year: 2026, month: 6 }))
      .toEqual({ period_mode: 'month', year: 2026, month: 6 });
  });

  it('calculates h/kWp and h/module averages and medians', () => {
    const kpis = calculateLaborAnalyticsKpis([site({ h_per_kwp: 1, h_per_module: 0.4 }), site({ site_id: 'site-2', h_per_kwp: 3, h_per_module: 0.6 })]);
    expect(kpis.avg_h_per_kwp).toBe(2);
    expect(kpis.median_h_per_kwp).toBe(2);
    expect(kpis.avg_h_per_module).toBe(0.5);
    expect(kpis.median_h_per_module).toBe(0.5);
    expect(average([])).toBeNull();
    expect(median([])).toBeNull();
  });

  it('groups rows by module model and manufacturer', () => {
    const rows = groupByModuleModel([site(), site({ site_id: 'site-2', module_count: 12, h_per_module: 0.6 }), site({ site_id: 'site-3', module_model: 'Trina 450W', module_manufacturer: 'Trina', module_count: 8 })]);
    expect(rows[0]).toMatchObject({ module_model: 'Jinko 500W', manufacturer: 'Jinko', site_count: 2, module_count: 22, avg_h_per_module: 0.55 });
    expect(rows[1]).toMatchObject({ module_model: 'Trina 450W', manufacturer: 'Trina', site_count: 1 });
  });

  it('excludes anomaly rows when requested', () => {
    const rows = [site(), site({ site_id: 'site-2', is_anomaly: true, anomaly_reasons: ['Nenurodytas kWp'] })];
    expect(excludeAnomalousSites(rows, true)).toHaveLength(1);
    expect(excludeAnomalousSites(rows, false)).toHaveLength(2);
  });
});
