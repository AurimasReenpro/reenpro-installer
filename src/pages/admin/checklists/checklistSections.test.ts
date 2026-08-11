import { describe, it, expect } from 'vitest';
import {
  getTaskSectionTitle,
  isAddableB2BCategory,
  B2B_CATALOG_HINT,
  EILE_ORDER_HINT,
} from './checklistSections';

describe('getTaskSectionTitle (tasks are per-tab, never mixed with the catalog)', () => {
  it('names each site-type task section per spec', () => {
    expect(getTaskSectionTitle('B2B')).toBe('B2B užduotys');
    expect(getTaskSectionTitle('B2C')).toBe('B2C užduotys');
    expect(getTaskSectionTitle('Servisas')).toBe('Serviso užduotys');
  });
  it('falls back to plain "Užduotys" for Visi and custom groups', () => {
    expect(getTaskSectionTitle('Visi')).toBe('Užduotys');
    expect(getTaskSectionTitle('Mano grupė')).toBe('Užduotys');
  });
});

describe('Eilė semantics (ordering, not time)', () => {
  it('uses the exact spec helper: ordering only, explicitly not planned time', () => {
    expect(EILE_ORDER_HINT).toBe('Naudojama tik rikiavimui. Tai nėra planuojamas laikas.');
  });
  it('never describes the order field with time vocabulary', () => {
    // The hint may DENY time ("nėra ... laikas"), but must not use duration terms.
    expect(EILE_ORDER_HINT.toLowerCase()).not.toContain('valand');
    expect(EILE_ORDER_HINT.toLowerCase()).not.toContain('trukm');
    expect(EILE_ORDER_HINT).toContain('rikiavimui');
  });
  it('catalog hint explains the B2B darbai purpose per spec', () => {
    expect(B2B_CATALOG_HINT).toBe(
      'Naudojama kaip B2B objektų darbų katalogas. Pasirinkti darbai kuriant objektą sukurs etapus, checklist užduotis ir bus naudojami laiko fiksavimui.',
    );
  });
});

describe('isAddableB2BCategory', () => {
  it('inactive categories are not valid add targets', () => {
    expect(isAddableB2BCategory({ is_active: true })).toBe(true);
    expect(isAddableB2BCategory({ is_active: false })).toBe(false);
  });
});
