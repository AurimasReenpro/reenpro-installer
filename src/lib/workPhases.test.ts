import { describe, expect, it } from 'vitest';
import {
  buildDefaultWorkPhaseRows,
  buildPhaseTimeSummary,
  canHardDeletePhase,
  getDefaultWorkPhaseDefinitions,
  getStartableWorkPhases,
  resolveWorkPhaseForStart,
  WorkPhaseRequiredError,
  type WorkPhase,
} from './workPhases';

const phase = (id: string, label: string, is_active = true, sort_order = 10): WorkPhase => ({
  id,
  site_id: 'site-1',
  code: id,
  label,
  sort_order,
  is_active,
  created_at: '2026-06-01T00:00:00.000Z',
});

describe('work phase defaults', () => {
  it('returns default B2B phases in the expected order', () => {
    expect(getDefaultWorkPhaseDefinitions('b2b').map((item) => item.label)).toEqual([
      'DC montavimas',
      'Balasto dėjimas',
      'Lovelių montavimas',
      'Modulių montavimas',
      'Inverteriai',
      'Paleidimas / patikra',
    ]);
  });

  it('returns the default B2C Montavimas phase', () => {
    expect(buildDefaultWorkPhaseRows('site-1', 'b2c')).toEqual([
      {
        site_id: 'site-1',
        code: 'montavimas',
        label: 'Montavimas',
        sort_order: 10,
        is_active: true,
      },
    ]);
  });
});

describe('resolveWorkPhaseForStart', () => {
  it('requires an explicit phase for B2B starts', () => {
    expect(() => resolveWorkPhaseForStart('b2b', null, [phase('dc', 'DC')])).toThrow(WorkPhaseRequiredError);
  });

  it('accepts the selected active phase for B2B starts', () => {
    expect(resolveWorkPhaseForStart('b2b', 'dc', [phase('dc', 'DC')])).toBe('dc');
  });

  it('auto-attaches the default active phase for B2C starts', () => {
    expect(resolveWorkPhaseForStart('b2c', null, [phase('montavimas', 'Montavimas')])).toBe('montavimas');
  });

  it('hides inactive phases from the new start-time selector', () => {
    const phases = [
      phase('old', 'Senas etapas', false, 10),
      phase('new', 'Naujas etapas', true, 20),
    ];

    expect(getStartableWorkPhases(phases).map((item) => item.id)).toEqual(['new']);
  });
});

describe('phase summaries and deletion rules', () => {
  it('groups hours by phase and counts open entries', () => {
    const summary = buildPhaseTimeSummary(
      [phase('dc', 'DC montavimas'), phase('old', 'Senas etapas', false, 20)],
      [
        {
          id: 'entry-1',
          work_phase_id: 'dc',
          start_time: '2026-06-01T08:00:00.000Z',
          end_time: '2026-06-01T10:00:00.000Z',
          duration_minutes: null,
        },
        {
          id: 'entry-2',
          work_phase_id: 'dc',
          start_time: '2026-06-01T10:00:00.000Z',
          end_time: null,
          duration_minutes: null,
        },
        {
          id: 'entry-3',
          work_phase_id: 'old',
          start_time: '2026-06-01T08:00:00.000Z',
          end_time: '2026-06-01T09:30:00.000Z',
          duration_minutes: 90,
        },
      ],
      new Date('2026-06-01T11:00:00.000Z'),
    );

    expect(summary.find((item) => item.phaseId === 'dc')).toMatchObject({
      label: 'DC montavimas',
      totalMinutes: 180,
      totalHours: 3,
      entryCount: 2,
      openEntryCount: 1,
    });
  });

  it('keeps inactive phases in historical summaries', () => {
    const summary = buildPhaseTimeSummary(
      [phase('old', 'Senas etapas', false)],
      [{
        id: 'entry-1',
        work_phase_id: 'old',
        start_time: '2026-06-01T08:00:00.000Z',
        end_time: '2026-06-01T09:00:00.000Z',
        duration_minutes: null,
      }],
    );

    expect(summary).toContainEqual(expect.objectContaining({
      phaseId: 'old',
      isActive: false,
      totalHours: 1,
    }));
  });

  it('prevents hard delete when a phase has time entries', () => {
    expect(canHardDeletePhase(0)).toBe(true);
    expect(canHardDeletePhase(1)).toBe(false);
  });
});
