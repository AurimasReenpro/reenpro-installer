import type { EarningsEntry } from '../../../api/payroll';
import { toCents } from './format';

/**
 * One installer's projected monthly basket, aggregated from earnings_entries.
 * All money fields are INTEGER CENTS (summed in cents, never float-added).
 * `deductionTotal` is already negative (deductions are stored negative in the
 * DB) — `total` adds every component once, so deductions are NOT subtracted
 * twice.
 */
export interface PayrollInstallerBasket {
  installerId: string;
  installerName: string;
  teamName: string | null;
  siteCount: number;
  siteShareTotal: number;   // cents
  bonusTotal: number;       // cents
  deductionTotal: number;   // cents (negative)
  adjustmentTotal: number;  // cents
  total: number;            // cents = siteShare + bonus + deduction + adjustment
  entries: EarningsEntry[];
}

/**
 * Build per-installer baskets from a flat earnings list. Works for OPEN, REVIEW
 * and LOCKED periods alike — no status gating. Sorted by total descending.
 */
export function computeInstallerBaskets(
  entries: EarningsEntry[],
  teamNameById: Map<string, string>,
): PayrollInstallerBasket[] {
  const map = new Map<string, PayrollInstallerBasket>();

  for (const e of entries) {
    let b = map.get(e.installer_id);
    if (!b) {
      const teamId = e.installer?.team_id ?? null;
      b = {
        installerId: e.installer_id,
        installerName: e.installer?.full_name ?? 'Nežinomas',
        teamName: teamId ? (teamNameById.get(teamId) ?? null) : null,
        siteCount: 0,
        siteShareTotal: 0,
        bonusTotal: 0,
        deductionTotal: 0,
        adjustmentTotal: 0,
        total: 0,
        entries: [],
      };
      map.set(e.installer_id, b);
    }
    const c = toCents(e.amount);
    b.entries.push(e);
    b.total += c; // every component added once — deductions are already negative
    if (e.entry_type === 'site_share') b.siteShareTotal += c;
    else if (e.entry_type === 'bonus') b.bonusTotal += c;
    else if (e.entry_type === 'deduction') b.deductionTotal += c;
    else if (e.entry_type === 'adjustment') b.adjustmentTotal += c;
  }

  for (const b of map.values()) {
    // siteCount = distinct site_snapshot_id across site_share rows.
    b.siteCount = new Set(
      b.entries
        .filter((e) => e.entry_type === 'site_share' && e.site_snapshot_id)
        .map((e) => e.site_snapshot_id),
    ).size;
  }

  return [...map.values()].sort((a, b) => b.total - a.total);
}
