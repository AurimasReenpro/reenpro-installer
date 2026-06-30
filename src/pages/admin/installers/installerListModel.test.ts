import { describe, expect, it } from 'vitest';
import {
  buildInstallerRows,
  buildTeamCards,
  computeInstallerKpis,
  filterTeamCards,
  filterInstallerRows,
  formatWeeklyHours,
  getAddableTeamMemberRows,
  getInstallerStatusLabel,
  getOperationalTeamOptions,
  getTeamStatusLabel,
  getUnassignedActiveRows,
  type InstallerListInstaller,
  type InstallerListTeam,
  type InstallerListTimeEntry,
  type InstallerPlannedSite,
} from './installerListModel';
import { getInstallerWorkRoleLabel } from '../../../lib/installerWorkRoles';

const NOW = new Date('2026-06-25T12:00:00.000Z');

const team = (patch: Partial<InstallerListTeam> = {}): InstallerListTeam => ({
  id: 'team-1',
  name: 'Komanda A',
  created_at: '2026-01-01T00:00:00.000Z',
  ...patch,
});

const installer = (patch: Partial<InstallerListInstaller> = {}): InstallerListInstaller => ({
  id: 'installer-1',
  full_name: 'Jonas Jonaitis',
  email: 'jonas@example.com',
  phone: '+37060000000',
  role: 'installer',
  team_id: 'team-1',
  created_at: '2026-01-01T00:00:00.000Z',
  employment_status: 'active',
  work_role: 'installer',
  ...patch,
});

const entry = (patch: Partial<InstallerListTimeEntry> = {}): InstallerListTimeEntry => ({
  id: 'entry-1',
  installer_id: 'installer-1',
  site_id: 'site-1',
  start_time: '2026-06-25T08:00:00.000Z',
  end_time: '2026-06-25T10:00:00.000Z',
  duration_minutes: 120,
  site: { id: 'site-1', code: 'OBJ-1', client_name: 'Klientas', team_id: 'team-1' },
  ...patch,
});

describe('installer list model', () => {
  it('formats weekly hours compactly', () => {
    expect(formatWeeklyHours(null)).toBe('—');
    expect(formatWeeklyHours(45)).toBe('45 min');
    expect(formatWeeklyHours(120)).toBe('2h');
    expect(formatWeeklyHours(135)).toBe('2h 15min');
  });

  it('labels supported installer statuses', () => {
    expect(getInstallerStatusLabel('active')).toBe('Aktyvus');
    expect(getInstallerStatusLabel('inactive')).toBe('Neaktyvus');
    expect(getInstallerStatusLabel('invited')).toBe('Laukia pakvietimo');
    expect(getInstallerStatusLabel('suspended')).toBe('Sustabdytas');
    expect(getInstallerStatusLabel('archived')).toBe('Archyvuotas');
  });

  it('labels supported team statuses and defaults missing status to active', () => {
    expect(getTeamStatusLabel('active')).toBe('Aktyvi');
    expect(getTeamStatusLabel('inactive')).toBe('Neaktyvi');
    expect(getTeamStatusLabel('archived')).toBe('Archyvuota');
    expect(getTeamStatusLabel(null)).toBe('Aktyvi');
  });

  it('labels work roles and defaults missing work_role to installer', () => {
    expect(getInstallerWorkRoleLabel('installer')).toBe('Montuotojas');
    expect(getInstallerWorkRoleLabel('electrician')).toBe('Elektrikas');
    expect(getInstallerWorkRoleLabel('site_manager')).toBe('Darbų vadovas');
    expect(getInstallerWorkRoleLabel('project_manager')).toBe('Projektų vadovas');

    const rows = buildInstallerRows([installer({ work_role: null })], [team()], [], NOW);
    expect(rows[0]).toMatchObject({
      workRole: 'installer',
      workRoleLabel: 'Montuotojas',
    });
  });

  it('builds working rows with active site and weekly minutes', () => {
    const rows = buildInstallerRows(
      [installer()],
      [team()],
      [
        entry(),
        entry({
          id: 'open-entry',
          start_time: '2026-06-25T11:15:00.000Z',
          end_time: null,
          duration_minutes: null,
        }),
      ],
      NOW,
    );

    expect(rows[0]).toMatchObject({
      status: 'active',
      statusLabel: 'Aktyvus',
      isWorkingNow: true,
      activeSiteName: 'OBJ-1 · Klientas',
      activeElapsedMinutes: 45,
      weeklyMinutes: 120,
    });
  });

  it('computes attention warnings for missing team, phone, stale activity and long open entries', () => {
    const rows = buildInstallerRows(
      [installer({ team_id: null, phone: null })],
      [team()],
      [
        entry({
          start_time: '2026-06-24T20:00:00.000Z',
          end_time: null,
          duration_minutes: null,
        }),
        entry({
          id: 'old-entry',
          start_time: '2026-05-01T08:00:00.000Z',
          end_time: '2026-05-01T09:00:00.000Z',
          duration_minutes: 60,
        }),
      ],
      NOW,
    );

    expect(rows[0]?.warnings).toEqual(expect.arrayContaining([
      'no_team',
      'missing_phone',
      'long_open_entry',
    ]));
  });

  it('computes installer KPIs from derived rows', () => {
    const rows = buildInstallerRows(
      [
        installer(),
        installer({ id: 'installer-2', full_name: 'Petras Petraitis', email: 'petras@example.com', team_id: null, phone: null }),
        installer({ id: 'installer-3', email: 'inactive@example.com', employment_status: 'inactive' }),
        installer({ id: 'installer-4', email: 'suspended@example.com', employment_status: 'suspended' }),
        installer({ id: 'installer-5', email: 'archived@example.com', employment_status: 'archived', team_id: null, phone: null }),
      ],
      [team()],
      [
        entry(),
        entry({
          id: 'open-entry',
          start_time: '2026-06-25T11:00:00.000Z',
          end_time: null,
          duration_minutes: null,
        }),
      ],
      NOW,
    );

    expect(computeInstallerKpis(rows)).toMatchObject({
      activeInstallers: 2,
      workingNow: 1,
      withoutTeam: 2,
      inactive: 3,
      weeklyMinutes: 120,
      needsAttention: 3,
    });
  });

  it('filters archived installers out by default but allows archived status filter', () => {
    const rows = buildInstallerRows(
      [
        installer({ id: 'active', email: 'active@example.com', employment_status: 'active' }),
        installer({ id: 'inactive', email: 'inactive@example.com', employment_status: 'inactive' }),
        installer({ id: 'archived', email: 'archived@example.com', employment_status: 'archived' }),
      ],
      [team()],
      [],
      NOW,
    );

    expect(filterInstallerRows(rows, { status: 'all' }).map((row) => row.id)).toEqual(['active', 'inactive']);
    expect(filterInstallerRows(rows, { status: 'active' }).map((row) => row.id)).toEqual(['active']);
    expect(filterInstallerRows(rows, { status: 'inactive' }).map((row) => row.id)).toEqual(['inactive']);
    expect(filterInstallerRows(rows, { status: 'archived' }).map((row) => row.id)).toEqual(['archived']);
  });

  it('filters rows by work role', () => {
    const rows = buildInstallerRows(
      [
        installer({ id: 'installer', work_role: 'installer' }),
        installer({ id: 'electrician', work_role: 'electrician' }),
        installer({ id: 'manager', work_role: 'site_manager' }),
      ],
      [team()],
      [],
      NOW,
    );

    expect(filterInstallerRows(rows, { workRole: 'electrician' }).map((row) => row.id)).toEqual(['electrician']);
    expect(filterInstallerRows(rows, { workRole: 'site_manager' }).map((row) => row.id)).toEqual(['manager']);
  });

  it('does not count archived installers as attention by default', () => {
    const rows = buildInstallerRows(
      [
        installer({ id: 'active-problem', team_id: null, phone: null }),
        installer({ id: 'archived-problem', email: 'archived@example.com', employment_status: 'archived', team_id: null, phone: null }),
      ],
      [team()],
      [],
      NOW,
    );

    expect(computeInstallerKpis(rows).needsAttention).toBe(1);
    expect(filterInstallerRows(rows, { onlyAttention: true }).map((row) => row.id)).toEqual(['active-problem']);
  });

  it('represents deactivate and reactivate row states from employment_status', () => {
    const rows = buildInstallerRows(
      [
        installer({ id: 'deactivated', employment_status: 'inactive', deactivated_at: '2026-06-20T12:00:00.000Z' }),
        installer({ id: 'reactivated', employment_status: 'active', deactivated_at: null }),
      ],
      [team()],
      [],
      NOW,
    );

    expect(rows.find((row) => row.id === 'deactivated')).toMatchObject({ status: 'inactive', statusLabel: 'Neaktyvus' });
    expect(rows.find((row) => row.id === 'reactivated')).toMatchObject({ status: 'active', statusLabel: 'Aktyvus' });
  });

  it('builds team cards with active member and planned site counts', () => {
    const rows = buildInstallerRows(
      [
        installer(),
        installer({ id: 'electrician', email: 'electrician@example.com', work_role: 'electrician' }),
        installer({ id: 'site-manager', full_name: 'Ona Vadovė', email: 'manager@example.com', work_role: 'site_manager' }),
        installer({ id: 'archived-member', email: 'archived@example.com', employment_status: 'archived' }),
      ],
      [team(), team({ id: 'team-2', name: 'Komanda B' })],
      [],
      NOW,
    );
    const plannedSites: InstallerPlannedSite[] = [
      { id: 'site-1', team_id: 'team-1', scheduled_start: '2026-06-25T07:00:00.000Z', status: 'pending' },
      { id: 'site-2', team_id: 'team-1', scheduled_start: '2026-06-26T07:00:00.000Z', status: 'pending' },
    ];

    expect(buildTeamCards([team(), team({ id: 'team-2', name: 'Komanda B' })], rows, plannedSites, NOW)).toMatchObject([
      {
        id: 'team-1',
        memberCount: 3,
        roleSummaryLabel: '1 montuotojas · 1 elektrikas · 1 darbų vadovas',
        hasElectrician: true,
        hasSiteManager: true,
        siteManagerNames: ['Ona Vadovė'],
        todayAssignedSitesCount: 1,
        thisWeekPlannedSitesCount: 2,
        warnings: [],
      },
      {
        id: 'team-2',
        memberCount: 0,
        hasElectrician: false,
        hasSiteManager: false,
        todayAssignedSitesCount: 0,
        thisWeekPlannedSitesCount: 0,
        warnings: ['no_members', 'no_electrician', 'no_site_manager'],
      },
    ]);
  });

  it('filters team cards to active teams by default', () => {
    const cards = buildTeamCards(
      [
        team({ id: 'active-team', status: 'active' }),
        team({ id: 'inactive-team', status: 'inactive' }),
        team({ id: 'archived-team', status: 'archived' }),
      ],
      [],
      [],
      NOW,
    );

    expect(filterTeamCards(cards, 'active').map((card) => card.id)).toEqual(['active-team']);
  });

  it('shows archived teams when archived status filter is selected', () => {
    const cards = buildTeamCards(
      [
        team({ id: 'active-team', status: 'active' }),
        team({ id: 'archived-team', status: 'archived' }),
      ],
      [],
      [],
      NOW,
    );

    expect(filterTeamCards(cards, 'archived').map((card) => card.id)).toEqual(['archived-team']);
    expect(filterTeamCards(cards, 'all').map((card) => card.id)).toEqual(['active-team', 'archived-team']);
  });

  it('excludes archived and inactive teams from active operational candidates', () => {
    expect(getOperationalTeamOptions([
      team({ id: 'active-team', status: 'active' }),
      team({ id: 'inactive-team', status: 'inactive' }),
      team({ id: 'archived-team', status: 'archived' }),
      team({ id: 'legacy-team', status: null }),
    ]).map((item) => item.id)).toEqual(['active-team', 'legacy-team']);
  });

  it('marks team electrician and site manager coverage', () => {
    const rows = buildInstallerRows(
      [
        installer({ id: 'electrician', work_role: 'electrician' }),
        installer({ id: 'manager', full_name: 'Ona Vadovė', email: 'manager@example.com', work_role: 'site_manager' }),
      ],
      [team()],
      [],
      NOW,
    );

    expect(buildTeamCards([team()], rows, [], NOW)[0]).toMatchObject({
      hasElectrician: true,
      hasSiteManager: true,
      siteManagerNames: ['Ona Vadovė'],
      warnings: [],
    });
  });

  it('marks missing electrician and missing site manager', () => {
    const rows = buildInstallerRows(
      [installer({ work_role: 'installer' })],
      [team()],
      [],
      NOW,
    );

    expect(buildTeamCards([team()], rows, [], NOW)[0]).toMatchObject({
      hasElectrician: false,
      hasSiteManager: false,
      warnings: ['no_electrician', 'no_site_manager'],
    });
  });

  it('returns only active unassigned installers', () => {
    const rows = buildInstallerRows(
      [
        installer({ id: 'unassigned-active', team_id: null }),
        installer({ id: 'assigned-active', team_id: 'team-1' }),
        installer({ id: 'unassigned-inactive', team_id: null, employment_status: 'inactive' }),
        installer({ id: 'unassigned-archived', team_id: null, employment_status: 'archived' }),
      ],
      [team()],
      [],
      NOW,
    );

    expect(getUnassignedActiveRows(rows).map((row) => row.id)).toEqual(['unassigned-active']);
  });

  it('excludes inactive installers from add-member candidates', () => {
    const rows = buildInstallerRows(
      [
        installer({ id: 'active-other-team', team_id: 'team-2' }),
        installer({ id: 'active-unassigned', team_id: null }),
        installer({ id: 'active-current-team', team_id: 'team-1' }),
        installer({ id: 'inactive', team_id: null, employment_status: 'inactive' }),
        installer({ id: 'suspended', team_id: null, employment_status: 'suspended' }),
      ],
      [team(), team({ id: 'team-2', name: 'Komanda B' })],
      [],
      NOW,
    );

    expect(getAddableTeamMemberRows(rows, 'team-1').map((row) => row.id)).toEqual([
      'active-other-team',
      'active-unassigned',
    ]);
  });
});
