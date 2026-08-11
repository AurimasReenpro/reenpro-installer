import { describe, it, expect } from 'vitest';
import {
  summarizeEquipment, computeWarnings, computeProgress, computeTime,
  buildSiteRow, matchesFilters, computeKpis, EMPTY_FILTERS,
  type SiteFilters,
} from './siteListModel';
import type { RawSiteListItem } from '../../../api/sites';

const NOW = Date.parse('2026-06-15T12:00:00Z');

function site(p: Partial<RawSiteListItem>): RawSiteListItem {
  return {
    id: 'id', code: 'OBJ-1', client_name: 'Klientas', address: 'Vilniaus g. 1', status: 'pending',
    scheduled_start: null, actual_start: null, actual_end: null, system_type: 'PV', kwp: null, kwh: null,
    site_type: 'b2c', equipment_details: null, team_id: 'team-1', created_at: '2026-06-01T00:00:00Z',
    team: { name: 'Komanda A' },
    site_checklists: [], time_entries: [], photos: [], site_assignments: [],
    ...p, // explicit values (incl. null) override the defaults
  };
}
const f = (p: Partial<SiteFilters> = {}): SiteFilters => ({ ...EMPTY_FILTERS, ...p });

describe('summarizeEquipment', () => {
  it('formats kWp · BESS · optimizers', () => {
    const s = site({
      kwp: 16.65, kwh: 10,
      equipment_details: [
        { category: 'Optimizatoriai', model: 'TS4', quantity: 24, unit: 'vnt.', notes: '' },
      ],
    });
    expect(summarizeEquipment(s)).toBe('16.65 kWp · BESS · 24 opt.');
  });
  it('formats kWp · PV with no battery/optimizers', () => {
    expect(summarizeEquipment(site({ kwp: 5.55, kwh: null, system_type: 'PV', equipment_details: [] }))).toBe('5.55 kWp · PV');
  });
  it('returns — when there is no equipment data', () => {
    expect(summarizeEquipment(site({ kwp: null, kwh: null, equipment_details: null }))).toBe('—');
  });
});

describe('computeWarnings', () => {
  it('flags a site with no team', () => {
    expect(computeWarnings(site({ team_id: null }), NOW)).toContain('no_team');
  });
  it('flags late: scheduled in the past but still pending', () => {
    expect(computeWarnings(site({ status: 'pending', scheduled_start: '2026-06-01T08:00:00Z' }), NOW)).toContain('late');
    // not late once in progress
    expect(computeWarnings(site({ status: 'in_progress', scheduled_start: '2026-06-01T08:00:00Z' }), NOW)).not.toContain('late');
  });
  it('flags missing address', () => {
    expect(computeWarnings(site({ address: '   ' }), NOW)).toContain('no_address');
  });
  it('flags checklist FAIL', () => {
    const s = site({ site_checklists: [{ id: 'c', site_checklist_items: [{ status: 'fail' }, { status: 'pass' }] }] });
    expect(computeWarnings(s, NOW)).toContain('checklist_fail');
  });
  it('flags long_work for a >24h closed entry', () => {
    const s = site({ time_entries: [{ duration_minutes: 26 * 60, start_time: '', end_time: '2026-06-10T00:00:00Z', installer_id: 'u1' }] });
    expect(computeWarnings(s, NOW)).toContain('long_work');
  });
  it('flags no_time for a completed site without logged hours', () => {
    expect(computeWarnings(site({ status: 'completed', time_entries: [] }), NOW)).toContain('no_time');
  });
});

describe('computeProgress / computeTime', () => {
  it('counts pass + n_a as done, fail separately', () => {
    const s = site({ site_checklists: [{ id: 'c', site_checklist_items: [{ status: 'pass' }, { status: 'n_a' }, { status: 'fail' }, { status: 'pending' }] }] });
    expect(computeProgress(s)).toEqual({ total: 4, passed: 2, failed: 1 });
  });
  it('sums closed hours and flags suspicious', () => {
    const s = site({ time_entries: [
      { duration_minutes: 120, start_time: '', end_time: '2026-06-10T00:00:00Z', installer_id: 'u1' },
      { duration_minutes: 30 * 60, start_time: '', end_time: '2026-06-11T00:00:00Z', installer_id: 'u1' },
    ] });
    const t = computeTime(s, NOW);
    expect(t.totalHours).toBe(32);
    expect(t.suspicious).toBe(true);
  });
});

describe('matchesFilters', () => {
  const rows = [
    buildSiteRow(site({ id: 'a', status: 'pending', team_id: 'team-1' }), NOW),
    buildSiteRow(site({ id: 'b', status: 'completed', team_id: null }), NOW),
    buildSiteRow(site({ id: 'c', status: 'archived', team_id: 'team-1' }), NOW),
  ];

  it('default (no status) hides archived', () => {
    expect(rows.filter((r) => matchesFilters(r, f(), NOW)).map((r) => r.id)).toEqual(['a', 'b']);
  });
  it('status filter selects exactly that status (incl. archived)', () => {
    expect(rows.filter((r) => matchesFilters(r, f({ status: 'completed' }), NOW)).map((r) => r.id)).toEqual(['b']);
    expect(rows.filter((r) => matchesFilters(r, f({ status: 'archived' }), NOW)).map((r) => r.id)).toEqual(['c']);
  });
  it('"Tik be komandos" keeps only team-less sites', () => {
    expect(rows.filter((r) => matchesFilters(r, f({ onlyNoTeam: true }), NOW)).map((r) => r.id)).toEqual(['b']);
  });
  it('search matches code/name/address', () => {
    const matched = rows.filter((r) => matchesFilters(r, f({ search: 'OBJ-1' }), NOW));
    expect(matched.length).toBe(2); // a + b (archived c excluded by default)
  });
});

describe('computeKpis', () => {
  it('counts statuses + no-team + attention over non-archived rows', () => {
    const rows = [
      buildSiteRow(site({ id: 'a', status: 'pending', team_id: 'team-1', scheduled_start: '2026-06-01T08:00:00Z' }), NOW), // late → attention
      buildSiteRow(site({ id: 'b', status: 'in_progress', team_id: 'team-1' }), NOW),
      buildSiteRow(site({ id: 'c', status: 'completed', team_id: null, time_entries: [{ duration_minutes: 60, start_time: '', end_time: '2026-06-10T00:00:00Z', installer_id: 'u' }] }), NOW), // no_team → attention
      buildSiteRow(site({ id: 'd', status: 'archived', team_id: 'team-1' }), NOW),
    ];
    const k = computeKpis(rows);
    expect(k.total).toBe(3);          // archived excluded
    expect(k.pending).toBe(1);
    expect(k.inProgress).toBe(1);
    expect(k.completed).toBe(1);
    expect(k.noTeam).toBe(1);
    expect(k.attention).toBe(2);      // a (late) + c (no team)
  });
});
