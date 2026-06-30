export type ReportPeriodMode = 'all_time' | 'month';

export interface LaborAnalyticsFilters {
  period_mode: ReportPeriodMode;
  year: number | null;
  month: number | null;
  team_id?: string;
  installer_id?: string;
  has_bess?: boolean;
  has_optimizers?: boolean;
  module_model?: string;
  module_manufacturer?: string;
  kwp_min?: number;
  kwp_max?: number;
  exclude_anomalies?: boolean;
}

export interface LaborAnalyticsSite {
  site_id: string;
  site_code: string;
  client_name: string;
  completed_at: string | null;
  team_id: string | null;
  team_name: string | null;
  kwp: number | null;
  system_type: string | null;
  has_bess: boolean;
  optimizer_count: number;
  module_count: number;
  module_type: string | null;
  module_model: string | null;
  module_manufacturer: string | null;
  module_wattage_w: number | null;
  inverter_count: number;
  roof_type: string | null;
  roof_slope: string | null;
  total_installer_hours: number;
  calendar_hours: number | null;
  installer_count: number;
  h_per_kwp: number | null;
  h_per_module: number | null;
  h_per_optimizer: number | null;
  is_anomaly: boolean;
  anomaly_reasons: string[];
}

export interface LaborAnalyticsKpis {
  avg_h_per_kwp: number | null;
  median_h_per_kwp: number | null;
  avg_h_per_module: number | null;
  median_h_per_module: number | null;
  total_installer_hours: number;
  completed_sites: number;
  anomaly_count: number;
}

export interface ModulePerformanceRow {
  module_model: string | null;
  manufacturer: string | null;
  site_count: number;
  module_count: number;
  avg_h_per_module: number | null;
  median_h_per_module: number | null;
  avg_h_per_kwp: number | null;
  anomaly_count: number;
}

export function serializeLaborFilters(filters: LaborAnalyticsFilters): Record<string, string | number | boolean> {
  const payload = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined && value !== null),
  ) as Record<string, string | number | boolean>;
  if (filters.period_mode === 'all_time') {
    delete payload.year;
    delete payload.month;
  }
  return payload;
}

export function median(values: Array<number | null | undefined>): number | null {
  const sorted = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

export function average(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return valid.length === 0 ? null : valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export function excludeAnomalousSites(sites: LaborAnalyticsSite[], exclude: boolean): LaborAnalyticsSite[] {
  return exclude ? sites.filter((site) => !site.is_anomaly) : sites;
}

export function calculateLaborAnalyticsKpis(sites: LaborAnalyticsSite[]): LaborAnalyticsKpis {
  return {
    avg_h_per_kwp: average(sites.map((site) => site.h_per_kwp)),
    median_h_per_kwp: median(sites.map((site) => site.h_per_kwp)),
    avg_h_per_module: average(sites.map((site) => site.h_per_module)),
    median_h_per_module: median(sites.map((site) => site.h_per_module)),
    total_installer_hours: sites.reduce((sum, site) => sum + (Number.isFinite(site.total_installer_hours) ? site.total_installer_hours : 0), 0),
    completed_sites: sites.length,
    anomaly_count: sites.filter((site) => site.is_anomaly).length,
  };
}

export function groupByModuleModel(sites: LaborAnalyticsSite[]): ModulePerformanceRow[] {
  const groups = new Map<string, LaborAnalyticsSite[]>();
  for (const site of sites) {
    if (!site.module_model) continue;
    const key = `${site.module_model}|${site.module_manufacturer ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), site]);
  }
  return [...groups.values()].map((group) => ({
    module_model: group[0]!.module_model,
    manufacturer: group[0]!.module_manufacturer,
    site_count: group.length,
    module_count: group.reduce((sum, site) => sum + site.module_count, 0),
    avg_h_per_module: average(group.map((site) => site.h_per_module)),
    median_h_per_module: median(group.map((site) => site.h_per_module)),
    avg_h_per_kwp: average(group.map((site) => site.h_per_kwp)),
    anomaly_count: group.filter((site) => site.is_anomaly).length,
  })).sort((a, b) => b.module_count - a.module_count);
}

export function anomalyLabel(reasons: string[]): string {
  return reasons.length === 0 ? 'Be anomalijų' : reasons.join('; ');
}
