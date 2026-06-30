import { describe, expect, it } from 'vitest';
import {
  buildScheduleCellSummary,
  buildScheduleSiteEquipmentSummary,
  isScheduleCellOverloaded,
  SCHEDULE_KWP_OVERLOAD_THRESHOLD,
  SCHEDULE_OBJECT_COUNT_OVERLOAD_THRESHOLD,
  type ScheduleSummarySite,
} from './scheduleModel';

const site = (patch: Partial<ScheduleSummarySite> = {}): ScheduleSummarySite => ({
  kwp: null,
  kwh: null,
  system_type: null,
  equipment_details: null,
  ...patch,
});

describe('schedule cell summary', () => {
  it('builds an empty cell summary', () => {
    expect(buildScheduleCellSummary([])).toEqual({
      objectCount: 0,
      totalKwp: null,
      bessCount: 0,
      bessCapacityKwh: null,
      optimizerCount: 0,
      label: '',
    });
  });

  it('builds a one site summary', () => {
    expect(buildScheduleCellSummary([site({ kwp: 5.55 })])).toMatchObject({
      objectCount: 1,
      totalKwp: 5.55,
      label: '1 obj. · 5.6 kWp',
    });
  });

  it('sums total kWp across multiple sites', () => {
    expect(buildScheduleCellSummary([
      site({ kwp: 10.1 }),
      site({ kwp: 12.05 }),
    ])).toMatchObject({
      objectCount: 2,
      totalKwp: 22.15,
      label: '2 obj. · 22.2 kWp',
    });
  });

  it('keeps BESS counts internal while rendering only capacity and optimizers', () => {
    const summary = buildScheduleCellSummary([
      site({
        kwp: 8,
        kwh: 10,
        equipment_details: [{ category: 'Optimizatoriai', model: 'Tigo optimizer', quantity: 12, unit: 'vnt.', notes: '' }],
      }),
      site({ kwp: 4, system_type: 'PV+BESS' }),
    ]);

    expect(summary).toMatchObject({
      bessCount: 2,
      bessCapacityKwh: 10,
      optimizerCount: 12,
      label: '2 obj. · 12 kWp · 10 kWh · 12 opt.',
    });
    expect(summary.label).not.toContain('BESS');
  });

  it('builds a card equipment summary without BESS', () => {
    expect(buildScheduleSiteEquipmentSummary(site({ kwp: 16.65 }))).toBe('16.65 kWp');
  });

  it('builds a card equipment summary for one BESS with kWh', () => {
    const summary = buildScheduleSiteEquipmentSummary(site({ kwp: 16.65, kwh: 10.24 }));

    expect(summary).toBe('16.65 kWp · 10.24 kWh');
    expect(summary).not.toContain('BESS');
  });

  it('omits BESS text from a card equipment summary when kWh is missing', () => {
    const summary = buildScheduleSiteEquipmentSummary(site({ kwp: 16.65, system_type: 'PV+BESS' }));

    expect(summary).toBe('16.65 kWp');
    expect(summary).not.toContain('BESS');
  });

  it('sums multiple BESS capacity from equipment rows without rendering BESS count', () => {
    const summary = buildScheduleSiteEquipmentSummary(site({
      kwp: 16.65,
      equipment_details: [
        { category: 'Energijos kaupiklis', model: 'Battery A', quantity: 2, unit: 'vnt.', notes: '', capacity_kwh: 10.24 },
      ],
    }));

    expect(summary).toBe('16.65 kWp · 20.48 kWh');
    expect(summary).not.toContain('BESS');
  });

  it('builds a cell summary with total BESS kWh without rendering BESS text', () => {
    const summary = buildScheduleCellSummary([
      site({ kwp: 16.65, kwh: 10.24 }),
    ]);

    expect(summary).toMatchObject({
      bessCount: 1,
      bessCapacityKwh: 10.24,
      label: '1 obj. · 16.7 kWp · 10.24 kWh',
    });
    expect(summary.label).not.toContain('BESS');
  });

  it('sums multiple cell BESS capacities without rendering BESS count', () => {
    const summary = buildScheduleCellSummary([
      site({ kwp: 16.65, kwh: 18.08 }),
      site({ kwp: 5.55, kwh: 9.04 }),
    ]);

    expect(summary).toMatchObject({
      bessCount: 2,
      label: '2 obj. · 22.2 kWp · 27.12 kWh',
    });
    expect(summary.bessCapacityKwh).toBeCloseTo(27.12);
    expect(summary.label).not.toContain('BESS');
  });

  it('flags overload by object count', () => {
    const summary = buildScheduleCellSummary(Array.from(
      { length: SCHEDULE_OBJECT_COUNT_OVERLOAD_THRESHOLD + 1 },
      () => site({ kwp: 1 }),
    ));

    expect(isScheduleCellOverloaded(summary)).toBe(true);
  });

  it('flags overload by kWp', () => {
    const summary = buildScheduleCellSummary([
      site({ kwp: SCHEDULE_KWP_OVERLOAD_THRESHOLD + 0.1 }),
    ]);

    expect(isScheduleCellOverloaded(summary)).toBe(true);
  });
});
