import { describe, it, expect } from 'vitest';
import {
  MATERIAL_STATUSES, MAIN_FLOW, STATUS_LABELS, STATUS_HINTS,
  flowPosition, isPlannedEditable, showsIssued, showsActual, statusTone,
  compareQty, qtyDelta, isFinal, asMaterialStatus,
  type MaterialStatus,
} from './materialFlow';

describe('materialFlow', () => {
  it('every status has a label, a hint and a tone', () => {
    for (const s of MATERIAL_STATUSES) {
      expect(STATUS_LABELS[s]).toBeTruthy();
      expect(STATUS_HINTS[s]).toBeTruthy();
      expect(statusTone(s)).toBeTruthy();
    }
  });

  it('leaves the two step-back statuses out of the main flow', () => {
    // Jos turi etiketes, bet neturi vietos eilėje — kitaip „žingsnis 3 iš 9"
    // rodytų pažangą ten, kur jos nėra.
    expect(MAIN_FLOW).not.toContain('truksta');
    expect(MAIN_FLOW).not.toContain('grazinta_taisyti');
    expect(flowPosition('truksta')).toBeNull();
    expect(flowPosition('grazinta_taisyti')).toBeNull();
    expect(STATUS_LABELS.truksta).toBeTruthy();
  });

  it('numbers the main flow from one', () => {
    expect(flowPosition('rengiamas')).toEqual({ step: 1, total: MAIN_FLOW.length });
    expect(flowPosition('nurasyta')).toEqual({ step: MAIN_FLOW.length, total: MAIN_FLOW.length });
  });

  it('locks planned quantities once submitted, and only a return unlocks them', () => {
    expect(isPlannedEditable('rengiamas')).toBe(true);
    expect(isPlannedEditable('grazinta_taisyti')).toBe(true);

    for (const s of ['pateiktas', 'truksta', 'patvirtintas', 'isduota',
      'faktas_suvestas', 'priimta', 'nurasyta'] as MaterialStatus[]) {
      expect(isPlannedEditable(s)).toBe(false);
    }
  });

  it('reveals issued and actual columns only once they can hold anything', () => {
    expect(showsIssued('rengiamas')).toBe(false);
    expect(showsIssued('pateiktas')).toBe(false);
    expect(showsIssued('patvirtintas')).toBe(true);

    expect(showsActual('isduota')).toBe(false);
    expect(showsActual('faktas_suvestas')).toBe(true);
    expect(showsActual('priimta')).toBe(true);
  });

  it('treats an unknown planned quantity as not comparable, not as zero', () => {
    // `null` reiškia „reikės, bet kiek nežinome" — 4 metrai tokiu atveju nėra
    // nei perviršis, nei sutapimas.
    expect(compareQty(null, 4)).toBe('nezinoma');
    expect(qtyDelta(null, 4)).toBeNull();

    expect(compareQty(0, 4)).toBe('daugiau');
    expect(qtyDelta(0, 4)).toBe(4);
  });

  it('compares planned against actual', () => {
    expect(compareQty(10, 10)).toBe('sutampa');
    expect(compareQty(10, 12)).toBe('daugiau');
    expect(compareQty(10, 8)).toBe('maziau');
    expect(qtyDelta(10, 8)).toBe(-2);
  });

  it('keeps the delta free of floating-point dust', () => {
    expect(qtyDelta(0.3, 0.1)).toBe(-0.2);
  });

  it('marks only the written-off list as final', () => {
    expect(isFinal('priimta')).toBe(false);
    expect(isFinal('nurasyta')).toBe(true);
  });

  it('falls back to rengiamas for values the database should never hold', () => {
    expect(asMaterialStatus('patvirtintas')).toBe('patvirtintas');
    expect(asMaterialStatus(null)).toBe('rengiamas');
    expect(asMaterialStatus('kazkas')).toBe('rengiamas');
  });
});
