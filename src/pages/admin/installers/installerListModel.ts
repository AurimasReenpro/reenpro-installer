import {
  getInstallerWorkRoleCountLabel,
  getInstallerWorkRoleLabel,
  normalizeInstallerWorkRole,
  type InstallerWorkRole,
} from '../../../lib/installerWorkRoles';

export const LONG_OPEN_ENTRY_MINUTES = 12 * 60;
export const STALE_ACTIVITY_DAYS = 30;

export type InstallerEmploymentStatus = 'active' | 'inactive' | 'invited' | 'suspended' | 'archived';
export type InstallerStatus = InstallerEmploymentStatus;
export type TeamStatus = 'active' | 'inactive' | 'archived';
export type TeamStatusFilter = 'active' | 'inactive' | 'archived' | 'all';
export type InstallerWarning = 'no_team' | 'missing_phone' | 'long_open_entry' | 'stale_activity' | 'inactive';

export interface InstallerListInstaller {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  team_id: string | null;
  created_at: string | null;
  employment_status?: InstallerEmploymentStatus | null;
  work_role?: InstallerWorkRole | null;
  deactivated_at?: string | null;
  deactivated_by?: string | null;
  deactivation_reason?: string | null;
}

export interface InstallerListTeam {
  id: string;
  name: string;
  created_at?: string | null;
  status?: TeamStatus | null;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
}

export interface InstallerListSiteRef {
  id: string;
  code: string | null;
  client_name: string | null;
  team_id: string | null;
  scheduled_start?: string | null;
}

export interface InstallerListTimeEntry {
  id: string;
  installer_id: string;
  site_id: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  site?: InstallerListSiteRef | null;
}

export interface InstallerPlannedSite {
  id: string;
  team_id: string | null;
  scheduled_start: string | null;
  status: string | null;
}

export interface InstallerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  workRole: InstallerWorkRole;
  workRoleLabel: string;
  teamId: string | null;
  teamName: string | null;
  status: InstallerStatus;
  statusLabel: string;
  isWorkingNow: boolean;
  activeSiteName: string | null;
  activeStartedAt: string | null;
  activeElapsedMinutes: number | null;
  weeklyMinutes: number | null;
  lastActivityAt: string | null;
  warnings: InstallerWarning[];
}

export interface InstallerKpis {
  activeInstallers: number;
  workingNow: number;
  withoutTeam: number;
  inactive: number;
  weeklyMinutes: number | null;
  needsAttention: number;
}

export interface TeamCardModel {
  id: string;
  name: string;
  status: TeamStatus;
  statusLabel: string;
  isArchived: boolean;
  members: InstallerRow[];
  memberCount: number;
  roleSummaryLabel: string | null;
  hasElectrician: boolean;
  hasSiteManager: boolean;
  siteManagerNames: string[];
  todayAssignedSitesCount: number | null;
  thisWeekPlannedSitesCount: number | null;
  warnings: ('no_members' | 'no_electrician' | 'no_site_manager')[];
}

export interface InstallerRowFilters {
  search?: string;
  status?: 'all' | InstallerStatus;
  teamId?: string;
  workRole?: string;
  onlyWithoutTeam?: boolean;
  onlyWorkingNow?: boolean;
  onlyAttention?: boolean;
  includeArchivedAttention?: boolean;
}

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minutesBetween(start: string, end: string | null, fallbackNow: Date): number | null {
  const startDate = asDate(start);
  const endDate = asDate(end) ?? fallbackNow;
  if (!startDate) return null;
  return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 60000));
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export function startOfInstallerWeek(now: Date): Date {
  const start = new Date(now);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function endOfInstallerWeek(now: Date): Date {
  const end = startOfInstallerWeek(now);
  end.setDate(end.getDate() + 7);
  end.setMilliseconds(-1);
  return end;
}

function siteLabel(site: InstallerListSiteRef | null | undefined, fallbackSiteId: string): string {
  if (!site) return fallbackSiteId;
  const code = site.code?.trim();
  const name = site.client_name?.trim();
  if (code && name) return `${code} · ${name}`;
  return code || name || fallbackSiteId;
}

function latestIso(values: (string | null | undefined)[]): string | null {
  const dates = values
    .map(asDate)
    .filter((date): date is Date => date != null)
    .sort((a, b) => b.getTime() - a.getTime());
  return dates[0]?.toISOString() ?? null;
}

function closedDurationMinutes(entry: InstallerListTimeEntry): number | null {
  if (!entry.end_time) return null;
  if (typeof entry.duration_minutes === 'number' && Number.isFinite(entry.duration_minutes)) {
    return Math.max(0, entry.duration_minutes);
  }
  return minutesBetween(entry.start_time, entry.end_time, new Date());
}

export function getInstallerStatusLabel(status: InstallerStatus): string {
  if (status === 'inactive') return 'Neaktyvus';
  if (status === 'invited') return 'Laukia pakvietimo';
  if (status === 'suspended') return 'Sustabdytas';
  if (status === 'archived') return 'Archyvuotas';
  return 'Aktyvus';
}

export function normalizeTeamStatus(status: string | null | undefined): TeamStatus {
  if (status === 'inactive' || status === 'archived') return status;
  return 'active';
}

export function getTeamStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeTeamStatus(status);
  if (normalized === 'inactive') return 'Neaktyvi';
  if (normalized === 'archived') return 'Archyvuota';
  return 'Aktyvi';
}

export function formatWeeklyHours(minutes: number | null): string {
  if (minutes == null) return '—';
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

export function computeInstallerWarnings(row: Omit<InstallerRow, 'warnings' | 'statusLabel'>, now: Date): InstallerWarning[] {
  if (row.status === 'archived') return [];

  const warnings: InstallerWarning[] = [];
  if (!row.teamId) warnings.push('no_team');
  if (!row.phone?.trim()) warnings.push('missing_phone');
  if (row.status === 'inactive' || row.status === 'suspended') warnings.push('inactive');
  if ((row.activeElapsedMinutes ?? 0) > LONG_OPEN_ENTRY_MINUTES) warnings.push('long_open_entry');

  const lastActivity = asDate(row.lastActivityAt);
  if (lastActivity) {
    const staleMs = STALE_ACTIVITY_DAYS * 24 * 60 * 60 * 1000;
    if (now.getTime() - lastActivity.getTime() > staleMs) warnings.push('stale_activity');
  }

  return warnings;
}

export function buildInstallerRows(
  installers: InstallerListInstaller[],
  teams: InstallerListTeam[],
  timeEntries: InstallerListTimeEntry[],
  now = new Date(),
): InstallerRow[] {
  const teamName = new Map(teams.map((team) => [team.id, team.name]));
  const weekStart = startOfInstallerWeek(now);

  return installers.map((installer) => {
    const entries = timeEntries.filter((entry) => entry.installer_id === installer.id);
    const openEntry = entries
      .filter((entry) => !entry.end_time)
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())[0] ?? null;
    const weeklyDurations = entries
      .filter((entry) => {
        const endDate = asDate(entry.end_time);
        return endDate != null && endDate >= weekStart && endDate <= now;
      })
      .map(closedDurationMinutes)
      .filter((minutes): minutes is number => minutes != null);
    const weeklyMinutes = weeklyDurations.length > 0
      ? weeklyDurations.reduce((sum, minutes) => sum + minutes, 0)
      : null;
    const lastActivityAt = latestIso(entries.flatMap((entry) => [entry.end_time, entry.start_time]));
    const activeElapsedMinutes = openEntry ? minutesBetween(openEntry.start_time, null, now) : null;
    const status: InstallerStatus = installer.employment_status ?? 'active';
    const base = {
      id: installer.id,
      name: installer.full_name?.trim() || installer.email || 'Be vardo',
      email: installer.email,
      phone: installer.phone,
      role: installer.role,
      workRole: normalizeInstallerWorkRole(installer.work_role),
      workRoleLabel: getInstallerWorkRoleLabel(installer.work_role),
      teamId: installer.team_id,
      teamName: installer.team_id ? teamName.get(installer.team_id) ?? null : null,
      status,
      isWorkingNow: !!openEntry,
      activeSiteName: openEntry ? siteLabel(openEntry.site, openEntry.site_id) : null,
      activeStartedAt: openEntry?.start_time ?? null,
      activeElapsedMinutes,
      weeklyMinutes,
      lastActivityAt,
    };

    return {
      ...base,
      statusLabel: getInstallerStatusLabel(status),
      warnings: computeInstallerWarnings(base, now),
    };
  });
}

export function computeInstallerKpis(rows: InstallerRow[]): InstallerKpis {
  const knownWeekly = rows
    .map((row) => row.weeklyMinutes)
    .filter((minutes): minutes is number => minutes != null);

  return {
    activeInstallers: rows.filter((row) => row.status === 'active').length,
    workingNow: rows.filter((row) => row.isWorkingNow).length,
    withoutTeam: rows.filter((row) => !row.teamId).length,
    inactive: rows.filter((row) => row.status === 'inactive' || row.status === 'suspended' || row.status === 'archived').length,
    weeklyMinutes: knownWeekly.length > 0 ? knownWeekly.reduce((sum, minutes) => sum + minutes, 0) : null,
    needsAttention: rows.filter((row) => row.status !== 'archived' && row.warnings.length > 0).length,
  };
}

export function filterInstallerRows(rows: InstallerRow[], filters: InstallerRowFilters): InstallerRow[] {
  const needle = filters.search?.trim().toLowerCase() ?? '';
  return rows.filter((row) => {
    if ((!filters.status || filters.status === 'all') && row.status === 'archived') return false;
    const matchesSearch = !needle
      || row.name.toLowerCase().includes(needle)
      || (row.email ?? '').toLowerCase().includes(needle)
      || (row.phone ?? '').toLowerCase().includes(needle)
      || (row.teamName ?? '').toLowerCase().includes(needle);
    if (!matchesSearch) return false;
    if (filters.status && filters.status !== 'all' && row.status !== filters.status) return false;
    if (filters.teamId && filters.teamId !== 'all' && (filters.teamId === 'none' ? row.teamId != null : row.teamId !== filters.teamId)) return false;
    if (filters.workRole && filters.workRole !== 'all' && row.workRole !== filters.workRole) return false;
    if (filters.onlyWithoutTeam && row.teamId) return false;
    if (filters.onlyWorkingNow && !row.isWorkingNow) return false;
    if (filters.onlyAttention && row.warnings.length === 0) return false;
    if (filters.onlyAttention && row.status === 'archived' && !filters.includeArchivedAttention) return false;
    return true;
  });
}

function teamRoleSummary(members: InstallerRow[]): string | null {
  if (members.length === 0) return null;
  const counts = members.reduce<Record<InstallerWorkRole, number>>((acc, member) => {
    acc[member.workRole] += 1;
    return acc;
  }, {
    installer: 0,
    electrician: 0,
    site_manager: 0,
    project_manager: 0,
  });

  return (Object.entries(counts) as [InstallerWorkRole, number][])
    .filter(([, count]) => count > 0)
    .map(([role, count]) => getInstallerWorkRoleCountLabel(role, count))
    .join(' · ');
}

export function getUnassignedActiveRows(rows: InstallerRow[]): InstallerRow[] {
  return rows.filter((row) => row.status === 'active' && !row.teamId);
}

export function getAddableTeamMemberRows(rows: InstallerRow[], teamId: string | null): InstallerRow[] {
  return rows.filter((row) => row.status === 'active' && (!teamId || row.teamId !== teamId));
}

export function filterTeamCards(cards: TeamCardModel[], statusFilter: TeamStatusFilter): TeamCardModel[] {
  if (statusFilter === 'all') return cards;
  return cards.filter((card) => card.status === statusFilter);
}

export function getOperationalTeamOptions<T extends { status?: string | null }>(teams: T[]): T[] {
  return teams.filter((team) => normalizeTeamStatus(team.status) === 'active');
}

function countPlannedSitesForTeam(
  sites: InstallerPlannedSite[],
  teamId: string,
  predicate: (date: Date) => boolean,
): number {
  return sites.filter((site) => {
    if (site.team_id !== teamId) return false;
    const scheduled = asDate(site.scheduled_start);
    return scheduled != null && predicate(scheduled);
  }).length;
}

export function buildTeamCards(
  teams: InstallerListTeam[],
  installerRows: InstallerRow[],
  plannedSites: InstallerPlannedSite[],
  now = new Date(),
): TeamCardModel[] {
  const weekStart = startOfInstallerWeek(now);
  const weekEnd = endOfInstallerWeek(now);

  return teams.map((team) => {
    const status = normalizeTeamStatus(team.status);
    const members = installerRows.filter((row) => row.teamId === team.id && row.status === 'active');
    const hasElectrician = members.some((member) => member.workRole === 'electrician');
    const siteManagerNames = members
      .filter((member) => member.workRole === 'site_manager')
      .map((member) => member.name);
    const hasSiteManager = siteManagerNames.length > 0;
    const warnings: TeamCardModel['warnings'] = [];
    if (members.length === 0) warnings.push('no_members');
    if (!hasElectrician) warnings.push('no_electrician');
    if (!hasSiteManager) warnings.push('no_site_manager');

    return {
      id: team.id,
      name: team.name,
      status,
      statusLabel: getTeamStatusLabel(status),
      isArchived: status === 'archived',
      members,
      memberCount: members.length,
      roleSummaryLabel: teamRoleSummary(members),
      hasElectrician,
      hasSiteManager,
      siteManagerNames,
      todayAssignedSitesCount: countPlannedSitesForTeam(plannedSites, team.id, (date) => isSameLocalDay(date, now)),
      thisWeekPlannedSitesCount: countPlannedSitesForTeam(plannedSites, team.id, (date) => date >= weekStart && date <= weekEnd),
      warnings,
    };
  });
}
