import { describe, it, expect } from 'vitest';
import { computeInstallerBaskets } from './basket';
import type { EarningsEntry } from '../../../api/payroll';

// Minimal earnings fixture — only the fields the aggregator reads.
function entry(p: Partial<EarningsEntry> & { installer_id: string; entry_type: EarningsEntry['entry_type']; amount: number }): EarningsEntry {
  return {
    id: Math.random().toString(36).slice(2),
    period_id: 'per-1',
    site_snapshot_id: p.site_snapshot_id ?? null,
    description: null,
    source: p.source ?? 'auto',
    created_by: null,
    created_at: '2026-01-10T00:00:00Z',
    installer: { full_name: p.installer?.full_name ?? 'A', team_id: p.installer?.team_id ?? null },
    ...p,
  } as EarningsEntry;
}

const teams = new Map([['t1', 'Komanda 1']]);

describe('computeInstallerBaskets', () => {
  it('adds every component once — deductions (already negative) are NOT subtracted twice', () => {
    const e = [
      entry({ installer_id: 'u1', entry_type: 'site_share', amount: 300, site_snapshot_id: 's1' }),
      entry({ installer_id: 'u1', entry_type: 'bonus', amount: 50, source: 'manual' }),
      entry({ installer_id: 'u1', entry_type: 'deduction', amount: -20, source: 'manual' }),
    ];
    const [b] = computeInstallerBaskets(e, teams);
    expect(b.siteShareTotal).toBe(30000);
    expect(b.bonusTotal).toBe(5000);
    expect(b.deductionTotal).toBe(-2000);
    expect(b.total).toBe(33000); // 300 + 50 - 20 = 330.00, once
  });

  it('sums in exact integer cents (no float drift)', () => {
    const e = [
      entry({ installer_id: 'u1', entry_type: 'site_share', amount: 333.33, site_snapshot_id: 's1' }),
      entry({ installer_id: 'u1', entry_type: 'site_share', amount: 333.34, site_snapshot_id: 's2' }),
    ];
    const [b] = computeInstallerBaskets(e, teams);
    expect(b.total).toBe(66667); // 666.67 €, exact
  });

  it('aggregates site shares from earnings_entries', () => {
    const e = [
      entry({ installer_id: 'u1', entry_type: 'site_share', amount: 250, site_snapshot_id: 's1' }),
      entry({ installer_id: 'u2', entry_type: 'site_share', amount: 250, site_snapshot_id: 's1' }),
      entry({ installer_id: 'u3', entry_type: 'site_share', amount: 300, site_snapshot_id: 's2' }),
    ];
    const baskets = computeInstallerBaskets(e, teams);
    expect(baskets).toHaveLength(3);
    expect(baskets.reduce((sum, b) => sum + b.siteShareTotal, 0)).toBe(80000);
    expect(baskets.map((b) => b.siteCount).sort()).toEqual([1, 1, 1]);
  });

  it('siteCount = distinct site_snapshot_id across site_share rows only', () => {
    const e = [
      entry({ installer_id: 'u1', entry_type: 'site_share', amount: 100, site_snapshot_id: 's1' }),
      entry({ installer_id: 'u1', entry_type: 'site_share', amount: 100, site_snapshot_id: 's1' }), // dup site
      entry({ installer_id: 'u1', entry_type: 'site_share', amount: 100, site_snapshot_id: 's2' }),
      entry({ installer_id: 'u1', entry_type: 'bonus', amount: 100, source: 'manual', site_snapshot_id: 's3' }), // bonus → ignored
    ];
    const [b] = computeInstallerBaskets(e, teams);
    expect(b.siteCount).toBe(2);
  });

  it('resolves team name and sorts installers by total descending', () => {
    const e = [
      entry({ installer_id: 'low', entry_type: 'site_share', amount: 100, site_snapshot_id: 's1', installer: { full_name: 'Low', team_id: 't1' } }),
      entry({ installer_id: 'high', entry_type: 'site_share', amount: 500, site_snapshot_id: 's2', installer: { full_name: 'High', team_id: null } }),
    ];
    const baskets = computeInstallerBaskets(e, teams);
    expect(baskets.map((b) => b.installerId)).toEqual(['high', 'low']);
    expect(baskets[1].teamName).toBe('Komanda 1');
    expect(baskets[0].teamName).toBeNull();
  });

  it('handles a corrections-only installer (no site_share)', () => {
    const e = [entry({ installer_id: 'u1', entry_type: 'bonus', amount: 40, source: 'manual' })];
    const [b] = computeInstallerBaskets(e, teams);
    expect(b.siteCount).toBe(0);
    expect(b.total).toBe(4000);
  });
});
