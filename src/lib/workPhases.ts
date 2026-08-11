import { normalizeSiteType, type SiteType } from './siteTypes';

export interface WorkPhaseDefinition {
  code: string;
  label: string;
  sort_order: number;
}

export interface WorkPhase {
  id: string;
  site_id: string;
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  /** Source B2B work category (null for legacy rows and b2c/service phases). */
  b2b_work_category_id?: string | null;
  created_at: string;
}

export interface PhaseTimeEntryLike {
  id: string;
  work_phase_id: string | null;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
}

export interface PhaseTimeSummary {
  phaseId: string | null;
  code: string | null;
  label: string;
  sortOrder: number;
  isActive: boolean;
  totalMinutes: number;
  totalHours: number;
  entryCount: number;
  openEntryCount: number;
}

export const DEFAULT_WORK_PHASES: Record<SiteType, WorkPhaseDefinition[]> = {
  b2b: [
    { code: 'dc_montavimas', label: 'DC montavimas', sort_order: 10 },
    { code: 'balasto_dejimas', label: 'Balasto dėjimas', sort_order: 20 },
    { code: 'loveliu_montavimas', label: 'Lovelių montavimas', sort_order: 30 },
    { code: 'moduliu_montavimas', label: 'Modulių montavimas', sort_order: 40 },
    { code: 'inverteriai', label: 'Inverteriai', sort_order: 50 },
    { code: 'paleidimas_patikra', label: 'Paleidimas / patikra', sort_order: 60 },
  ],
  b2c: [
    { code: 'montavimas', label: 'Montavimas', sort_order: 10 },
  ],
  service: [
    { code: 'servisas', label: 'Servisas', sort_order: 10 },
  ],
};

export class WorkPhaseRequiredError extends Error {
  constructor(message = 'WORK_PHASE_REQUIRED') {
    super(message);
    this.name = 'WorkPhaseRequiredError';
  }
}

export class WorkPhaseUnavailableError extends Error {
  constructor(message = 'WORK_PHASE_UNAVAILABLE') {
    super(message);
    this.name = 'WorkPhaseUnavailableError';
  }
}

export function getDefaultWorkPhaseDefinitions(siteType: string | null | undefined): WorkPhaseDefinition[] {
  return DEFAULT_WORK_PHASES[normalizeSiteType(siteType)];
}

export function buildDefaultWorkPhaseRows(siteId: string, siteType: string | null | undefined) {
  return getDefaultWorkPhaseDefinitions(siteType).map((phase) => ({
    site_id: siteId,
    code: phase.code,
    label: phase.label,
    sort_order: phase.sort_order,
    is_active: true,
  }));
}

export function resolveWorkPhaseForStart(
  siteType: string | null | undefined,
  selectedWorkPhaseId: string | null | undefined,
  activePhases: Pick<WorkPhase, 'id'>[],
): string | null {
  const normalized = normalizeSiteType(siteType);
  const selected = selectedWorkPhaseId?.trim() || null;

  if (normalized === 'b2b') {
    if (activePhases.length === 0) throw new WorkPhaseUnavailableError();
    if (!selected) throw new WorkPhaseRequiredError();
    if (!activePhases.some((phase) => phase.id === selected)) throw new WorkPhaseUnavailableError();
    return selected;
  }

  if (selected && activePhases.some((phase) => phase.id === selected)) return selected;
  return activePhases[0]?.id ?? null;
}

export function canHardDeletePhase(entryCount: number): boolean {
  return entryCount === 0;
}

export function getStartableWorkPhases(phases: WorkPhase[]): WorkPhase[] {
  return phases
    .filter((phase) => phase.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, 'lt'));
}

export function buildPhaseTimeSummary(
  phases: WorkPhase[],
  entries: PhaseTimeEntryLike[],
  now = new Date(),
): PhaseTimeSummary[] {
  const byPhase = new Map<string | null, PhaseTimeSummary>();

  for (const phase of phases) {
    byPhase.set(phase.id, {
      phaseId: phase.id,
      code: phase.code,
      label: phase.label,
      sortOrder: phase.sort_order,
      isActive: phase.is_active,
      totalMinutes: 0,
      totalHours: 0,
      entryCount: 0,
      openEntryCount: 0,
    });
  }

  for (const entry of entries) {
    const key = entry.work_phase_id;
    const summary = byPhase.get(key) ?? {
      phaseId: key,
      code: null,
      label: key ? 'Nežinomas etapas' : 'Be etapo',
      sortOrder: Number.MAX_SAFE_INTEGER,
      isActive: false,
      totalMinutes: 0,
      totalHours: 0,
      entryCount: 0,
      openEntryCount: 0,
    };

    const minutes = entry.duration_minutes ?? minutesBetween(entry.start_time, entry.end_time, now);
    summary.totalMinutes += Math.max(0, Math.round(minutes));
    summary.entryCount += 1;
    if (!entry.end_time) summary.openEntryCount += 1;
    byPhase.set(key, summary);
  }

  return [...byPhase.values()]
    .map((summary) => ({
      ...summary,
      totalHours: Math.round((summary.totalMinutes / 60) * 10) / 10,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'lt'));
}

function minutesBetween(startIso: string, endIso: string | null, now: Date): number {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return (end - start) / 60_000;
}
