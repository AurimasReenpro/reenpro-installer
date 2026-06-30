import { describe, expect, it } from 'vitest';
import {
  buildTeamWorkRoleMap,
  getScheduleWarnings,
  siteClearlyHasBess,
} from './scheduleWarnings';

describe('schedule role warnings', () => {
  it('detects clear BESS signals conservatively', () => {
    expect(siteClearlyHasBess({ team_id: 'team-1', kwh: 5 })).toBe(true);
    expect(siteClearlyHasBess({ team_id: 'team-1', system_type: 'PV+BESS' })).toBe(true);
    expect(siteClearlyHasBess({
      team_id: 'team-1',
      equipment_details: [{ category: 'Energijos kaupiklis', model: 'Battery A', quantity: 1, unit: 'vnt.', notes: '' }],
    })).toBe(true);
    expect(siteClearlyHasBess({ team_id: 'team-1', kwh: null, system_type: 'PV' })).toBe(false);
  });

  it('warns when a BESS site is assigned to a team without electrician', () => {
    const roles = buildTeamWorkRoleMap([
      { team_id: 'team-1', work_role: 'installer' },
      { team_id: 'team-1', work_role: 'site_manager' },
    ]);

    expect(getScheduleWarnings({ team_id: 'team-1', kwh: 8 }, roles)).toContain('no_electrician');
  });

  it('does not warn about electrician when the assigned team has one', () => {
    const roles = buildTeamWorkRoleMap([
      { team_id: 'team-1', work_role: 'installer' },
      { team_id: 'team-1', work_role: 'electrician' },
      { team_id: 'team-1', work_role: 'site_manager' },
    ]);

    expect(getScheduleWarnings({ team_id: 'team-1', kwh: 8 }, roles)).not.toContain('no_electrician');
  });
});
