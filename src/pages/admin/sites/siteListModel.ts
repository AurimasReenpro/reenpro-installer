import { parseEquipmentDetails, isBatteryCategory } from '../../../types/equipment.types';
import type { EquipmentItem } from '../../../types/equipment.types';
import type { RawSiteListItem } from '../../../api/sites';
import type { SiteType } from '../../../lib/siteTypes';

// ── Warnings ──────────────────────────────────────────────────────────────────
export type SiteWarning = 'no_team' | 'late' | 'no_address' | 'no_time' | 'checklist_fail' | 'long_work';

export const WARNING_LABELS: Record<SiteWarning, string> = {
  no_team: 'Be komandos',
  late: 'Vėluoja',
  no_address: 'Trūksta adreso',
  no_time: 'Nėra laiko',
  checklist_fail: 'Checklist FAIL',
  long_work: 'Ilgas darbas',
};

const HOUR_MS = 3_600_000;
const LONG_ACTIVE_MS = 12 * HOUR_MS;   // in-progress longer than 12h → attention
const SUSPICIOUS_MINUTES = 24 * 60;    // a single closed entry over 24h is suspicious

// ── Equipment ────────────────────────────────────────────────────────────────
function equipOf(item: RawSiteListItem): EquipmentItem[] {
  return parseEquipmentDetails(item.equipment_details);
}

export function optimizerCount(equip: EquipmentItem[]): number {
  return equip.reduce((n, e) => {
    const hay = `${e.category ?? ''} ${e.model ?? ''}`.toLowerCase();
    if (!hay.includes('optim')) return n;
    const q = Number(e.quantity);
    return n + (Number.isFinite(q) && q > 0 ? q : 0);
  }, 0);
}

export function siteHasBess(item: RawSiteListItem, equip: EquipmentItem[]): boolean {
  return equip.some((e) => isBatteryCategory(e.category))
    || (item.system_type ?? '').toUpperCase().includes('BESS')
    || (item.kwh ?? 0) > 0;
}

const WATT_RE = /(\d+(?:\.\d+)?)\s*Wp?/i;
function kwpFromEquipment(equip: EquipmentItem[]): number | null {
  let watts = 0;
  for (const e of equip) {
    if ((e.category ?? '') !== 'Moduliai') continue;
    const m = WATT_RE.exec(e.model ?? '');
    const w = m ? parseFloat(m[1]!) : 0;
    const q = Number(e.quantity);
    if (w > 0 && Number.isFinite(q) && q > 0) watts += w * q;
  }
  return watts > 0 ? Math.round(watts / 10) / 100 : null;
}

const trimNum = (n: number) => `${+n.toFixed(2)}`;

/** Compact equipment summary, e.g. "16.65 kWp · BESS · 24 opt." or "5.55 kWp · PV" or "—". */
export function summarizeEquipment(item: RawSiteListItem): string {
  const equip = equipOf(item);
  const kwp = item.kwp ?? kwpFromEquipment(equip);
  const opt = optimizerCount(equip);
  const bess = siteHasBess(item, equip);
  const parts: string[] = [];
  if (kwp != null) parts.push(`${trimNum(kwp)} kWp`);
  if (kwp != null || equip.length > 0) parts.push(bess ? 'BESS' : 'PV');
  if (opt > 0) parts.push(`${opt} opt.`);
  return parts.length ? parts.join(' · ') : '—';
}

// ── Progress / time ──────────────────────────────────────────────────────────
export interface SiteProgress { total: number; passed: number; failed: number }

export function computeProgress(item: RawSiteListItem): SiteProgress | null {
  const items = item.site_checklists.flatMap((c) => c.site_checklist_items ?? []);
  if (items.length === 0) return null;
  const passed = items.filter((i) => i.status === 'pass' || i.status === 'n_a').length;
  const failed = items.filter((i) => i.status === 'fail').length;
  return { total: items.length, passed, failed };
}

export const photoCount = (item: RawSiteListItem): number => item.photos.length;

export interface SiteTime { activeMs: number | null; totalHours: number | null; suspicious: boolean }

export function computeTime(item: RawSiteListItem, nowMs: number): SiteTime {
  const closedMinutes = item.time_entries
    .filter((t) => t.end_time)
    .reduce((m, t) => m + (t.duration_minutes ?? 0), 0);
  const totalHours = closedMinutes > 0 ? Math.round((closedMinutes / 60) * 10) / 10 : null;
  const activeMs = item.status === 'in_progress' && item.actual_start
    ? nowMs - Date.parse(item.actual_start)
    : null;
  const suspicious = item.time_entries.some((t) => (t.duration_minutes ?? 0) > SUSPICIOUS_MINUTES)
    || (activeMs != null && activeMs > 24 * HOUR_MS);
  return { activeMs, totalHours, suspicious };
}

// ── Warning calculation ──────────────────────────────────────────────────────
export function computeWarnings(item: RawSiteListItem, nowMs: number): SiteWarning[] {
  const w: SiteWarning[] = [];
  if (!item.team_id) w.push('no_team');

  const sched = item.scheduled_start ? Date.parse(item.scheduled_start) : null;
  if (sched != null && sched < nowMs && (item.status === 'pending' || item.status == null)) w.push('late');

  if (!item.address || !item.address.trim()) w.push('no_address');

  const time = computeTime(item, nowMs);
  if (item.status === 'completed' && time.totalHours == null) w.push('no_time');

  const prog = computeProgress(item);
  if (prog && prog.failed > 0) w.push('checklist_fail');

  const longActive = item.status === 'in_progress' && item.actual_start != null
    && (nowMs - Date.parse(item.actual_start)) > LONG_ACTIVE_MS;
  if (longActive || time.suspicious) w.push('long_work');

  return w;
}

// ── Consolidated row model ───────────────────────────────────────────────────
export interface SiteListRow {
  id: string;
  code: string;
  client_name: string;
  address: string | null;
  status: string | null;
  scheduled_start: string | null;
  system_type: string | null;
  site_type: SiteType;
  kwp: number | null;
  team_id: string | null;
  teamName: string | null;
  equipmentSummary: string;
  progress: SiteProgress | null;
  photoCount: number;
  time: SiteTime;
  warnings: SiteWarning[];
  needsAttention: boolean;
  installerIds: string[];
}

export function buildSiteRow(item: RawSiteListItem, nowMs: number): SiteListRow {
  const warnings = computeWarnings(item, nowMs);
  const installerIds = [...new Set([
    ...item.site_assignments.map((a) => a.installer_id),
    ...item.time_entries.map((t) => t.installer_id),
  ])];
  return {
    id: item.id,
    code: item.code,
    client_name: item.client_name,
    address: item.address,
    status: item.status,
    scheduled_start: item.scheduled_start,
    system_type: item.system_type,
    site_type: item.site_type,
    kwp: item.kwp,
    team_id: item.team_id,
    teamName: item.team?.name ?? null,
    equipmentSummary: summarizeEquipment(item),
    progress: computeProgress(item),
    photoCount: photoCount(item),
    time: computeTime(item, nowMs),
    warnings,
    needsAttention: warnings.length > 0,
    installerIds,
  };
}

// ── Filters ──────────────────────────────────────────────────────────────────
/** Workflow statuses an admin can set (incl. the soft-archive pseudo-status). */
export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'pending', label: 'Laukia' },
  { value: 'in_progress', label: 'Vykdomas' },
  { value: 'paused', label: 'Sustabdytas' },
  { value: 'completed', label: 'Baigtas' },
  { value: 'archived', label: 'Archyvuotas' },
];

export type PeriodFilter = 'all' | 'this_month' | 'next_month';

export interface SiteFilters {
  search: string;
  status: string;        // '' = all (non-archived); else exact status incl. 'archived'
  teamId: string;        // '' all · 'none' = be komandos
  installerId: string;   // '' all
  period: PeriodFilter;
  onlyNoTeam: boolean;
  onlyProblems: boolean;
}

export const EMPTY_FILTERS: SiteFilters = {
  search: '', status: '', teamId: '', installerId: '', period: 'all', onlyNoTeam: false, onlyProblems: false,
};

function inPeriod(scheduled: string | null, period: PeriodFilter, nowMs: number): boolean {
  if (period === 'all') return true;
  if (!scheduled) return false;
  const d = new Date(scheduled);
  const ref = new Date(nowMs);
  const target = new Date(ref.getFullYear(), ref.getMonth() + (period === 'next_month' ? 1 : 0), 1);
  return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth();
}

/** Pure filter predicate over a derived row. Default (no status) hides archived. */
export function matchesFilters(row: SiteListRow, f: SiteFilters, nowMs: number): boolean {
  if (f.status === '') {
    if (row.status === 'archived') return false;
  } else if (row.status !== f.status) {
    return false;
  }

  if (f.onlyNoTeam && row.team_id != null) return false;
  if (f.teamId === 'none' && row.team_id != null) return false;
  if (f.teamId && f.teamId !== 'none' && row.team_id !== f.teamId) return false;

  if (f.installerId && !row.installerIds.includes(f.installerId)) return false;
  if (f.onlyProblems && !row.needsAttention) return false;
  if (!inPeriod(row.scheduled_start, f.period, nowMs)) return false;

  const q = f.search.trim().toLowerCase();
  if (q) {
    const hay = `${row.code} ${row.client_name} ${row.address ?? ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

// ── KPIs ─────────────────────────────────────────────────────────────────────
export interface SiteKpis { total: number; pending: number; inProgress: number; completed: number; noTeam: number; attention: number }

/** KPI counts over the (non-archived) rows. */
export function computeKpis(rows: SiteListRow[]): SiteKpis {
  const live = rows.filter((r) => r.status !== 'archived');
  return {
    total: live.length,
    pending: live.filter((r) => r.status === 'pending' || r.status == null).length,
    inProgress: live.filter((r) => r.status === 'in_progress').length,
    completed: live.filter((r) => r.status === 'completed').length,
    noTeam: live.filter((r) => r.team_id == null).length,
    attention: live.filter((r) => r.needsAttention).length,
  };
}
