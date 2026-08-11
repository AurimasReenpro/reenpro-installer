import { describe, it, expect, vi } from 'vitest';

// sites.ts imports the supabase client (which reads env vars at module load).
// The functions under test don't touch it, so stub the module out.
vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calculateKwpFromEquipment, calculateKwhFromEquipment, hasDeletionBlockers, SITE_FILES_BUCKET, type SiteDeletionBlockers } from './sites';
import type { EquipmentItem } from '../types/equipment.types';

describe('SITE_FILES_BUCKET (canonical bucket name)', () => {
  it('is the underscore spelling used by production storage', () => {
    expect(SITE_FILES_BUCKET).toBe('site_files');
  });

  it('no hardcoded bucket spelling remains in the storage APIs (grep-proof)', () => {
    for (const rel of ['./sites.ts', './dashboard.ts']) {
      const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
      // The hyphen spelling pointed at a nonexistent bucket (delete-safety bug).
      expect(src.includes("'site-files'"), `${rel} must not reference 'site-files'`).toBe(false);
      expect(src.includes('"site-files"'), `${rel} must not reference "site-files"`).toBe(false);
      // The literal may appear only in the single constant definition in sites.ts.
      const literalCount = src.split("'site_files'").length - 1;
      expect(literalCount, `${rel} must use SITE_FILES_BUCKET, not the raw literal`).toBeLessThanOrEqual(rel === './sites.ts' ? 1 : 0);
    }
  });
});

describe('hasDeletionBlockers (hard-delete safety gate)', () => {
  const zero: SiteDeletionBlockers = { timeEntries: 0, checklistItems: 0, photos: 0, files: 0, snapshots: 0, earnings: 0 };
  it('allows delete only when every related count is zero', () => {
    expect(hasDeletionBlockers(zero)).toBe(false);
  });
  it('blocks when any related data exists', () => {
    expect(hasDeletionBlockers({ ...zero, timeEntries: 1 })).toBe(true);
    expect(hasDeletionBlockers({ ...zero, photos: 3 })).toBe(true);
    expect(hasDeletionBlockers({ ...zero, snapshots: 1 })).toBe(true);
    expect(hasDeletionBlockers({ ...zero, earnings: 2 })).toBe(true);
    expect(hasDeletionBlockers({ ...zero, checklistItems: 5 })).toBe(true);
    expect(hasDeletionBlockers({ ...zero, files: 1 })).toBe(true);
  });
});

const mod = (model: string, quantity = 1): EquipmentItem => ({
  category: 'Moduliai', model, quantity, unit: 'vnt.', notes: '',
});
const battery = (capacity_kwh: number | undefined, quantity = 1): EquipmentItem => ({
  category: 'Energijos kaupiklis', model: 'BYD HVS', quantity, unit: 'vnt.', notes: '',
  ...(capacity_kwh === undefined ? {} : { capacity_kwh }),
});
const inverter = (): EquipmentItem => ({
  category: 'Inverteris', model: 'Huawei SUN2000-10KTL', quantity: 1, unit: 'vnt.', notes: '',
});

describe('calculateKwpFromEquipment', () => {
  it('returns null for an empty list', () => {
    expect(calculateKwpFromEquipment([])).toBeNull();
  });

  it('returns null when there are no module rows', () => {
    expect(calculateKwpFromEquipment([inverter(), battery(10)])).toBeNull();
  });

  it('parses watts and multiplies by quantity', () => {
    // 555W × 2 = 1110W = 1.11 kWp
    expect(calculateKwpFromEquipment([mod('Jinko 555W', 2)])).toBe(1.11);
  });

  it('handles the "Wp" suffix, decimals, and is case-insensitive', () => {
    expect(calculateKwpFromEquipment([mod('Canadian Solar 450Wp')])).toBe(0.45);
    expect(calculateKwpFromEquipment([mod('Foo 555.5w')])).toBe(0.56); // 0.5555 → 0.56
  });

  it('sums multiple module rows and ignores non-module categories', () => {
    // (500×2 + 400×3) / 1000 = 2.2
    const items = [mod('Jinko 500W', 2), mod('Trina 400W', 3), battery(10), inverter()];
    expect(calculateKwpFromEquipment(items)).toBe(2.2);
  });

  it('skips module rows with no parseable wattage', () => {
    expect(calculateKwpFromEquipment([mod('Generic panel', 4)])).toBeNull();
  });

  it('skips zero / non-positive wattage', () => {
    expect(calculateKwpFromEquipment([mod('Broken 0W', 5)])).toBeNull();
  });

  it('rounds to 2 decimal places', () => {
    // 333W → 0.333 → 0.33
    expect(calculateKwpFromEquipment([mod('Odd 333W')])).toBe(0.33);
  });
});

describe('calculateKwhFromEquipment', () => {
  it('returns null for an empty list', () => {
    expect(calculateKwhFromEquipment([])).toBeNull();
  });

  it('returns null when there are no battery rows', () => {
    expect(calculateKwhFromEquipment([mod('Jinko 555W', 2), inverter()])).toBeNull();
  });

  it('sums capacity_kwh across battery rows (capacity is already per-row total)', () => {
    expect(calculateKwhFromEquipment([battery(5), battery(10)])).toBe(15);
  });

  it('recognises the legacy "BESS" battery category alias', () => {
    const bess: EquipmentItem = {
      category: 'BESS', model: 'x', quantity: 1, unit: 'vnt.', notes: '', capacity_kwh: 7,
    };
    expect(calculateKwhFromEquipment([bess])).toBe(7);
  });

  it('ignores battery rows without a valid (>0) capacity', () => {
    expect(calculateKwhFromEquipment([battery(undefined), battery(0), battery(-3)])).toBeNull();
  });

  it('guards against NaN capacity', () => {
    expect(calculateKwhFromEquipment([battery(Number.NaN)])).toBeNull();
  });

  it('ignores capacity declared on a non-battery row', () => {
    const moduleWithCap: EquipmentItem = {
      category: 'Moduliai', model: '555W', quantity: 1, unit: 'vnt.', notes: '', capacity_kwh: 99,
    };
    expect(calculateKwhFromEquipment([moduleWithCap])).toBeNull();
  });
});
