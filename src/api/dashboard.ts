import { supabase } from '../lib/supabase';
import { getCompanySettings, type CompanySettings } from './settings';
import { OPERATIONAL_SITE_STATUS_FILTER } from '../lib/siteStatus';
import { SITE_FILES_BUCKET } from './sites';
import { FORGOTTEN_OPEN_HOURS } from '../lib/timeEntryReview';

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

type DashboardSupabaseError = {
  code?: string;
  message?: string;
  details?: unknown;
  hint?: string | null;
};

export class DashboardLoadError extends Error {
  section: string;
  code: string | undefined;
  details?: unknown;
  hint: string | null | undefined;

  constructor(section: string, error: unknown) {
    const supabaseError = toSupabaseError(error);
    const message = supabaseError.message ?? (error instanceof Error ? error.message : 'Nezinoma Dashboard uzklausos klaida.');
    super(`Dashboard data source failed: ${section}: ${message}`);
    this.name = 'DashboardLoadError';
    this.section = section;
    this.code = supabaseError.code;
    this.details = supabaseError.details;
    this.hint = supabaseError.hint;
  }

  isMissingMigration(): boolean {
    const text = [
      this.code,
      this.message,
      typeof this.details === 'string' ? this.details : JSON.stringify(this.details ?? ''),
      this.hint ?? '',
    ].join(' ').toLowerCase();

    return this.code === '42703'
      || this.code === '42P01'
      || this.code === 'PGRST200'
      || this.code === 'PGRST201'
      || this.code === 'PGRST204'
      || text.includes('column')
      || text.includes('relationship')
      || text.includes('schema cache')
      || text.includes('does not exist');
  }

  toDevMessage(): string {
    const message = this.message.replace(/^Dashboard data source failed: [^:]+: /, '');
    const parts = [
      `Saltinis: ${this.section}`,
      this.code ? `Kodas: ${this.code}` : null,
      `Klaida: ${message}`,
      this.hint ? `Hint: ${this.hint}` : null,
      this.details ? `Details: ${typeof this.details === 'string' ? this.details : JSON.stringify(this.details)}` : null,
      this.isMissingMigration() ? 'Patikrinkite, ar pritaikytos naujausios migracijos ir perkrauta PostgREST schema.' : null,
    ].filter(Boolean);
    return parts.join('\n');
  }
}

function toSupabaseError(error: unknown): DashboardSupabaseError {
  if (error && typeof error === 'object') return error;
  return {};
}

function throwDashboardLoadError(section: string, error: unknown): never {
  throw new DashboardLoadError(section, error);
}

async function readCompanySettingsForDashboard(): Promise<CompanySettings | null> {
  try {
    return await getCompanySettings();
  } catch (error) {
    throwDashboardLoadError('company_settings', error);
  }
}

export const DASHBOARD_SITE_SELECT = `
  id, code, client_name, address, status, scheduled_start, actual_start, actual_end,
  estimated_hours, latitude, longitude,
  team:teams(name),
  site_assignments(id),
  time_entries(start_time, end_time, installer:user_profiles!time_entries_installer_id_fkey(full_name, avatar_url)),
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

async function getMissingPdfSiteIds(sites: DashboardSite[]): Promise<Set<string>> {
  const results = await Promise.all(sites.map(async (site) => {
    const { data, error } = await supabase.storage.from(SITE_FILES_BUCKET).list(site.id, { limit: 100 });
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

  const [scheduledResult, activeResult, completedResult, activityResult, settings] = await Promise.all([
    supabase
      .from('sites')
      .select(DASHBOARD_SITE_SELECT)
      .gte('scheduled_start', start)
      .lt('scheduled_start', end)
      .or(OPERATIONAL_SITE_STATUS_FILTER)
      .order('scheduled_start', { ascending: true }),
    supabase
      .from('sites')
      .select(DASHBOARD_SITE_SELECT)
      .in('status', ['in_progress', 'paused'])
      .order('scheduled_start', { ascending: true }),
    supabase
      .from('sites')
      .select(DASHBOARD_SITE_SELECT)
      .eq('status', 'completed')
      .gte('actual_end', start)
      .lt('actual_end', end)
      .order('actual_end', { ascending: false }),
    supabase
      .from('admin_activity_view')
      .select('*')
      .order('latest_action_time', { ascending: false })
      .limit(30),
    readCompanySettingsForDashboard(),
  ]);

  const dashboardReads = [
    ['scheduled sites', scheduledResult],
    ['active sites', activeResult],
    ['completed sites', completedResult],
    ['admin_activity_view', activityResult],
  ] as const;
  for (const [section, result] of dashboardReads) {
    if (result.error) throwDashboardLoadError(section, result.error);
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
    // Likely forgotten stop (>12h open) is the stronger signal — show it
    // instead of the generic long-running warning to avoid duplicate cards.
    if (site.status === 'in_progress' && runningMinutes > FORGOTTEN_OPEN_HOURS * 60) {
      attention.push({
        id: `stale-timer-${site.id}`,
        tone: 'critical',
        title: 'Pamirštas laikas?',
        detail: `${site.code}: laikmatis atviras jau ${Math.floor(runningMinutes / 60)} val. Patikrinkite, ar darbas nebuvo pamirštas sustabdyti.`,
        siteId: site.id,
      });
    } else if (site.status === 'in_progress' && runningMinutes > maxMinutes) {
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

  return {
    scheduledTodayCount: scheduledSites.length,
    workingNowCount: activeSites.filter((site) => !!site.openWorkStartedAt).length,
    completedTodayCount: completedSites.length,
    todaySites,
    mapSites: [...new Map([...activeSites, ...scheduledSites].map((site) => [site.id, site])).values()],
    attention,
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
