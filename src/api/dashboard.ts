import { supabase } from '../lib/supabase';
import { getCompanySettings, type CompanySettings } from './settings';
import { OPERATIONAL_SITE_STATUS_FILTER } from '../lib/siteStatus';

export type DashboardAttentionTone = 'critical' | 'warning' | 'info';

export interface DashboardSite {
  id: string;
  code: string;
  clientName: string;
  address: string;
  status: string;
  scheduledStart: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  estimatedHours: number | null;
  latitude: number | null;
  longitude: number | null;
  teamName: string | null;
  assignedCount: number;
  openWorkStartedAt: string | null;
  installerName: string | null;
  installerAvatarUrl: string | null;
  checklistDone: number;
  checklistTotal: number;
  checklistFailures: number;
}

export interface DashboardAttentionItem {
  id: string;
  tone: DashboardAttentionTone;
  title: string;
  detail: string;
  siteId?: string;
}

export interface DashboardActivityItem {
  id: string;
  siteId: string | null;
  siteCode: string | null;
  clientName: string | null;
  installerName: string | null;
  siteStatus: string | null;
  startTime: string | null;
  endTime: string | null;
  latestActionTime: string | null;
}

export interface AdminOperationsDashboard {
  scheduledTodayCount: number;
  workingNowCount: number;
  completedTodayCount: number;
  todaySites: DashboardSite[];
  mapSites: DashboardSite[];
  attention: DashboardAttentionItem[];
  payrollWarningCount: number;
  payrollStatus: string | null;
  completedMissingPdfCount: number;
  companySettings: CompanySettings | null;
  activity: DashboardActivityItem[];
}

interface RawDashboardSite {
  id: string;
  code: string | null;
  client_name: string | null;
  address: string | null;
  status: string | null;
  scheduled_start: string | null;
  actual_start: string | null;
  actual_end: string | null;
  estimated_hours: number | null;
  latitude: number | null;
  longitude: number | null;
  team: { name: string | null } | null;
  site_assignments: { id: string }[] | null;
  time_entries: {
    start_time: string;
    end_time: string | null;
    installer: { full_name: string | null; avatar_url: string | null } | null;
  }[] | null;
  site_checklists: {
    site_checklist_items: { status: string | null }[] | null;
  }[] | null;
}

interface RawPayrollSnapshot {
  site_id: string | null;
  warnings: unknown;
  site: { code: string | null; client_name: string | null } | null;
}

const SITE_SELECT = `
  id, code, client_name, address, status, scheduled_start, actual_start, actual_end,
  estimated_hours, latitude, longitude,
  team:teams(name),
  site_assignments(id),
  time_entries(start_time, end_time, installer:user_profiles(full_name, avatar_url)),
  site_checklists(site_checklist_items(status))
`;

function dayWindow(day: Date) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function asSites(data: unknown): RawDashboardSite[] {
  return (data ?? []) as RawDashboardSite[];
}

function mapSite(site: RawDashboardSite): DashboardSite {
  const entries = site.time_entries ?? [];
  const openEntry = entries
    .filter((entry) => !entry.end_time)
    .sort((a, b) => +new Date(b.start_time) - +new Date(a.start_time))[0] ?? null;
  const checklistItems = (site.site_checklists ?? []).flatMap((checklist) => checklist.site_checklist_items ?? []);
  const checklistDone = checklistItems.filter((item) => item.status === 'pass' || item.status === 'n_a').length;

  return {
    id: site.id,
    code: site.code ?? 'B/N',
    clientName: site.client_name ?? 'Nežinomas klientas',
    address: site.address ?? '',
    status: site.status ?? 'pending',
    scheduledStart: site.scheduled_start,
    actualStart: site.actual_start,
    actualEnd: site.actual_end,
    estimatedHours: site.estimated_hours,
    latitude: site.latitude,
    longitude: site.longitude,
    teamName: site.team?.name ?? null,
    assignedCount: site.site_assignments?.length ?? 0,
    openWorkStartedAt: openEntry?.start_time ?? null,
    installerName: openEntry?.installer?.full_name ?? null,
    installerAvatarUrl: openEntry?.installer?.avatar_url ?? null,
    checklistDone,
    checklistTotal: checklistItems.length,
    checklistFailures: checklistItems.filter((item) => item.status === 'fail').length,
  };
}

function minutesSince(iso: string | null, now: number): number {
  return iso ? Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000)) : 0;
}

function toWarnings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

async function getMissingPdfSiteIds(sites: DashboardSite[]): Promise<Set<string>> {
  const results = await Promise.all(sites.map(async (site) => {
    const { data, error } = await supabase.storage.from('site_files').list(site.id, { limit: 100 });
    if (error) return null;
    return data?.some((file) => file.name.toLowerCase().endsWith('.pdf')) ? null : site.id;
  }));
  return new Set(results.filter((id): id is string => !!id));
}

/**
 * Consolidated admin dashboard read model. It keeps the page free of scattered
 * data-fetching concerns while limiting work to today's and currently active sites.
 */
export async function getAdminOperationsDashboard(day = new Date()): Promise<AdminOperationsDashboard> {
  const { start, end } = dayWindow(day);
  const year = day.getFullYear();
  const month = day.getMonth() + 1;

  const [scheduledResult, activeResult, completedResult, activityResult, settings, periodResult] = await Promise.all([
    supabase
      .from('sites')
      .select(SITE_SELECT)
      .gte('scheduled_start', start)
      .lt('scheduled_start', end)
      .or(OPERATIONAL_SITE_STATUS_FILTER)
      .order('scheduled_start', { ascending: true }),
    supabase
      .from('sites')
      .select(SITE_SELECT)
      .in('status', ['in_progress', 'paused'])
      .order('scheduled_start', { ascending: true }),
    supabase
      .from('sites')
      .select(SITE_SELECT)
      .eq('status', 'completed')
      .gte('actual_end', start)
      .lt('actual_end', end)
      .order('actual_end', { ascending: false }),
    supabase
      .from('admin_activity_view')
      .select('*')
      .order('latest_action_time', { ascending: false })
      .limit(30),
    getCompanySettings(),
    supabase
      .from('payroll_periods')
      .select('id, status')
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),
  ]);

  for (const result of [scheduledResult, activeResult, completedResult, activityResult, periodResult]) {
    if (result.error) throw result.error;
  }

  const scheduledSites = asSites(scheduledResult.data).map(mapSite);
  const activeSites = asSites(activeResult.data).map(mapSite);
  const completedSites = asSites(completedResult.data).map(mapSite);
  const byId = new Map<string, DashboardSite>();
  for (const site of [...scheduledSites, ...activeSites]) byId.set(site.id, site);
  const todaySites = [...byId.values()].sort((a, b) => {
    const priority = (status: string) => status === 'in_progress' ? 0 : status === 'paused' ? 1 : 2;
    return priority(a.status) - priority(b.status)
      || +new Date(a.scheduledStart ?? 0) - +new Date(b.scheduledStart ?? 0);
  });

  const payrollResult = periodResult.data?.id
    ? await supabase
      .from('payroll_site_snapshots')
      .select('site_id, warnings, site:sites(code, client_name)')
      .eq('period_id', periodResult.data.id)
    : { data: [] as RawPayrollSnapshot[], error: null };
  if (payrollResult.error) throw payrollResult.error;

  const snapshots = (payrollResult.data ?? []) as unknown as RawPayrollSnapshot[];
  const now = Date.now();
  const attention: DashboardAttentionItem[] = [];

  for (const site of scheduledSites) {
    if (site.status === 'pending' && site.scheduledStart && +new Date(site.scheduledStart) <= now) {
      attention.push({
        id: `not-started-${site.id}`,
        tone: 'warning',
        title: 'Suplanuotas darbas nepradėtas',
        detail: `${site.code} - ${site.clientName}`,
        siteId: site.id,
      });
    }
    if (site.assignedCount === 0) {
      attention.push({
        id: `unassigned-${site.id}`,
        tone: 'critical',
        title: 'Nėra priskirtų montuotojų',
        detail: `${site.code} - ${site.clientName}`,
        siteId: site.id,
      });
    }
  }

  for (const site of activeSites) {
    const runningMinutes = minutesSince(site.openWorkStartedAt, now);
    const maxMinutes = Math.max((site.estimatedHours ?? 8) * 60 + 120, 600);
    if (site.status === 'in_progress' && runningMinutes > maxMinutes) {
      attention.push({
        id: `long-running-${site.id}`,
        tone: 'warning',
        title: 'Darbas užtruko ilgiau nei planuota',
        detail: `${site.code} vyksta jau ${Math.floor(runningMinutes / 60)} val.`,
        siteId: site.id,
      });
    }
  }

  for (const site of [...scheduledSites, ...activeSites, ...completedSites]) {
    if (site.checklistFailures > 0) {
      attention.push({
        id: `checklist-fail-${site.id}`,
        tone: 'critical',
        title: 'Checklist neatitikimas',
        detail: `${site.code}: ${site.checklistFailures} nepraėję punktai`,
        siteId: site.id,
      });
    }
  }

  const missingPdfSiteIds = await getMissingPdfSiteIds(completedSites);
  for (const site of completedSites) {
    if (missingPdfSiteIds.has(site.id)) {
      attention.push({
        id: `missing-pdf-${site.id}`,
        tone: 'warning',
        title: 'Trūksta PDF ataskaitos',
        detail: `${site.code} - ${site.clientName}`,
        siteId: site.id,
      });
    }
  }

  let payrollWarningCount = 0;
  for (const snapshot of snapshots) {
    const warnings = toWarnings(snapshot.warnings);
    payrollWarningCount += warnings.length;
    for (const warning of warnings.slice(0, 2)) {
      attention.push({
        id: `payroll-warning-${snapshot.site_id ?? 'unknown'}-${warning}`,
        tone: 'warning',
        title: 'Payroll įspėjimas',
        detail: `${snapshot.site?.code ?? 'Objektas'}: ${warning}`,
        siteId: snapshot.site_id ?? undefined,
      });
    }
  }

  return {
    scheduledTodayCount: scheduledSites.length,
    workingNowCount: activeSites.filter((site) => !!site.openWorkStartedAt).length,
    completedTodayCount: completedSites.length,
    todaySites,
    mapSites: [...new Map([...activeSites, ...scheduledSites].map((site) => [site.id, site])).values()],
    attention,
    payrollWarningCount,
    payrollStatus: periodResult.data?.status ?? null,
    completedMissingPdfCount: missingPdfSiteIds.size,
    companySettings: settings,
    activity: (activityResult.data ?? [])
      .filter((entry) => !!entry.id)
      .map((entry) => ({
        id: entry.id as string,
        siteId: entry.site_id,
        siteCode: entry.site_code,
        clientName: entry.client_name,
        installerName: entry.installer_name,
        siteStatus: entry.site_status,
        startTime: entry.start_time,
        endTime: entry.end_time,
        latestActionTime: entry.latest_action_time,
      })),
  };
}
