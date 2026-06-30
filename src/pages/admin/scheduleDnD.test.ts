import { describe, expect, it, vi } from 'vitest';
import {
  applyScheduleDrop,
  buildSiteDragData,
  parseScheduleCellId,
  type ScheduleAssignment,
} from './scheduleDnD';

describe('schedule DnD helpers', () => {
  it('builds an unassigned site drag payload without current team or date', () => {
    expect(buildSiteDragData({
      id: 'site-1',
      team_id: null,
      scheduled_start: null,
    })).toEqual({
      type: 'site',
      siteId: 'site-1',
      source: 'unassigned',
      currentTeamId: null,
      currentDate: null,
    });
  });

  it('assigns an unassigned site when dropped onto a team/day cell', async () => {
    const assign = vi.fn<(assignment: ScheduleAssignment) => Promise<void>>().mockResolvedValue(undefined);
    const drag = buildSiteDragData({ id: 'site-1', team_id: null, scheduled_start: null });
    const target = parseScheduleCellId('cell-team_team-1-date_2026-06-15');

    await expect(applyScheduleDrop(drag, target, 'pending', assign)).resolves.toBe('assigned');
    expect(assign).toHaveBeenCalledWith({
      siteId: 'site-1',
      teamId: 'team-1',
      scheduledStart: expect.stringContaining('2026-06-15T08:00:00'),
      status: 'pending',
    });
  });

  it('does nothing when dropped outside a valid cell', async () => {
    const assign = vi.fn<(assignment: ScheduleAssignment) => Promise<void>>().mockResolvedValue(undefined);
    const drag = buildSiteDragData({ id: 'site-1', team_id: null, scheduled_start: null });

    await expect(applyScheduleDrop(drag, null, 'pending', assign)).resolves.toBe('ignored');
    expect(assign).not.toHaveBeenCalled();
  });

  it('moves a scheduled site to a different team/day cell', async () => {
    const assign = vi.fn<(assignment: ScheduleAssignment) => Promise<void>>().mockResolvedValue(undefined);
    const drag = buildSiteDragData({
      id: 'site-1',
      team_id: 'team-1',
      scheduled_start: new Date(2026, 5, 15, 8).toISOString(),
    });
    const target = parseScheduleCellId('cell-team_team-2-date_2026-06-16');

    await expect(applyScheduleDrop(drag, target, 'pending', assign)).resolves.toBe('assigned');
    expect(assign).toHaveBeenCalledWith({
      siteId: 'site-1',
      teamId: 'team-2',
      scheduledStart: expect.stringContaining('2026-06-16T08:00:00'),
      status: 'pending',
    });
  });

  it('does nothing when a scheduled site is dropped onto the same cell', async () => {
    const assign = vi.fn<(assignment: ScheduleAssignment) => Promise<void>>().mockResolvedValue(undefined);
    const drag = buildSiteDragData({
      id: 'site-1',
      team_id: 'team-1',
      scheduled_start: new Date(2026, 5, 15, 8).toISOString(),
    });
    const target = parseScheduleCellId('cell-team_team-1-date_2026-06-15');

    await expect(applyScheduleDrop(drag, target, 'pending', assign)).resolves.toBe('ignored');
    expect(assign).not.toHaveBeenCalled();
  });
});
