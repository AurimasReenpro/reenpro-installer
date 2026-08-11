import { supabase } from '../lib/supabase';
import type { LaborAnalyticsFilters, LaborAnalyticsSite } from '../pages/admin/reportAnalytics';

export type { LaborAnalyticsSite } from '../pages/admin/reportAnalytics';

export interface ReportInstaller {
  id: string;
  full_name: string | null;
}

export type SiteWorkPhaseTimeRollup = {
  site_id: string | null;
  site_code: string | null;
  client_name: string | null;
  site_type: 'b2c' | 'b2b' | 'service' | null;
  kwp: number | null;
  work_phase_id: string | null;
  work_phase_code: string | null;
  work_phase_label: string | null;
  work_phase_sort_order: number | null;
  work_phase_is_active: boolean | null;
  entry_count: number | null;
  open_entry_count: number | null;
  total_hours: number | null;
  hours_per_kwp: number | null;
};

export type SiteChecklistPhaseStatusRollup = {
  site_id: string | null;
  site_type: 'b2c' | 'b2b' | 'service' | null;
  kwp: number | null;
  work_phase_id: string | null;
  work_phase_code: string | null;
  work_phase_label: string | null;
  work_phase_sort_order: number | null;
  checklist_item_count: number | null;
  completed_item_count: number | null;
  missing_photo_item_count: number | null;
  total_logged_hours: number | null;
  logged_hours_per_kwp: number | null;
};

function localMonthBounds(year: number, month: number) {
  return {
    start: new Date(year, month - 1, 1).toISOString(),
    end: new Date(year, month, 1).toISOString(),
  };
}

export async function getLaborAnalyticsReport(filters: LaborAnalyticsFilters): Promise<LaborAnalyticsSite[]> {
  let installerSiteIds: string[] | null = null;
  if (filters.installer_id) {
    const { data, error } = await supabase
      .from('time_entries')
      .select('site_id')
      .eq('installer_id', filters.installer_id)
      .not('end_time', 'is', null);
    if (error) throw error;
    installerSiteIds = [...new Set((data ?? []).map((entry) => entry.site_id))];
    if (installerSiteIds.length === 0) return [];
  }

  let query = supabase.from('site_labor_analytics_v').select('*').order('completed_at', { ascending: false, nullsFirst: false });
  if (filters.period_mode === 'month' && filters.year && filters.month) {
    const { start, end } = localMonthBounds(filters.year, filters.month);
    query = query.gte('completed_at', start).lt('completed_at', end);
  }
  if (filters.team_id) query = query.eq('team_id', filters.team_id);
  if (installerSiteIds) query = query.in('site_id', installerSiteIds);
  if (filters.has_bess !== undefined) query = query.eq('has_bess', filters.has_bess);
  if (filters.has_optimizers === true) query = query.gt('optimizer_count', 0);
  if (filters.has_optimizers === false) query = query.eq('optimizer_count', 0);
  if (filters.module_model) query = query.eq('module_model', filters.module_model);
  if (filters.module_manufacturer) query = query.eq('module_manufacturer', filters.module_manufacturer);
  if (filters.kwp_min !== undefined) query = query.gte('kwp', filters.kwp_min);
  if (filters.kwp_max !== undefined) query = query.lte('kwp', filters.kwp_max);
  if (filters.exclude_anomalies) query = query.eq('is_anomaly', false);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    anomaly_reasons: Array.isArray(row.anomaly_reasons) ? row.anomaly_reasons.filter((reason): reason is string => typeof reason === 'string') : [],
  }));
}

export async function getReportInstallers(): Promise<ReportInstaller[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .in('role', ['installer', 'admin'])
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getSiteWorkPhaseTimeRollup(): Promise<SiteWorkPhaseTimeRollup[]> {
  const { data, error } = await supabase
    .from('site_work_phase_time_v')
    .select('*')
    .order('site_code', { ascending: true })
    .order('work_phase_sort_order', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}

export async function getSiteChecklistPhaseStatusRollup(): Promise<SiteChecklistPhaseStatusRollup[]> {
  const { data, error } = await supabase
    .from('site_checklist_phase_status_v')
    .select('*')
    .order('work_phase_sort_order', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}
