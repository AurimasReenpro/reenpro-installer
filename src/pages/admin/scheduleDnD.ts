import { format } from 'date-fns';

export interface ScheduleSiteForDrag {
  id: string;
  team_id: string | null;
  scheduled_start: string | null;
}

export interface ScheduleSiteDragData {
  type: 'site';
  siteId: string;
  source: 'scheduled' | 'unassigned';
  currentTeamId: string | null;
  currentDate: string | null;
}

export interface ScheduleDropTarget {
  teamId: string;
  date: string;
}

export interface ScheduleAssignment {
  siteId: string;
  teamId: string;
  scheduledStart: string;
  status: string;
}

export class InvalidScheduleDropError extends Error {
  constructor() {
    super('Pasirinkta netinkama vieta tvarkaraštyje.');
  }
}

function localDayKey(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'yyyy-MM-dd');
}

export function buildSiteDragData(site: ScheduleSiteForDrag): ScheduleSiteDragData {
  const currentDate = localDayKey(site.scheduled_start);
  const isScheduled = !!site.team_id && !!currentDate;

  return {
    type: 'site',
    siteId: site.id,
    source: isScheduled ? 'scheduled' : 'unassigned',
    currentTeamId: isScheduled ? site.team_id : null,
    currentDate: isScheduled ? currentDate : null,
  };
}

export function parseScheduleCellId(id: string): ScheduleDropTarget | null {
  const match = id.match(/^cell-team_(.+)-date_(\d{4}-\d{2}-\d{2})$/);
  if (!match?.[1] || !match[2]) return null;
  return { teamId: match[1], date: match[2] };
}

export function buildScheduledStart(date: string): string {
  return format(new Date(`${date}T08:00:00`), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

export function buildScheduleAssignment(
  drag: ScheduleSiteDragData,
  target: ScheduleDropTarget | null,
  currentStatus: string | null,
): ScheduleAssignment | null {
  if (!target) return null;
  if (!target.teamId || !target.date) throw new InvalidScheduleDropError();
  if (drag.currentTeamId === target.teamId && drag.currentDate === target.date) return null;

  return {
    siteId: drag.siteId,
    teamId: target.teamId,
    scheduledStart: buildScheduledStart(target.date),
    status: currentStatus === 'completed' ? 'completed' : 'pending',
  };
}

export async function applyScheduleDrop(
  drag: ScheduleSiteDragData,
  target: ScheduleDropTarget | null,
  currentStatus: string | null,
  assign: (assignment: ScheduleAssignment) => Promise<void>,
): Promise<'assigned' | 'ignored'> {
  const assignment = buildScheduleAssignment(drag, target, currentStatus);
  if (!assignment) return 'ignored';
  await assign(assignment);
  return 'assigned';
}
