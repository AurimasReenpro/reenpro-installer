import { describe, expect, it } from 'vitest';
import {
  buildB2BWorkCategoryInsertPayload,
  buildB2BWorkCategoryReorderPayload,
  buildB2BWorkCategoryUpdatePayload,
  buildDeactivateB2BWorkCategoryPayload,
  filterActiveB2BWorkCategories,
  getB2BWorkCategoryLabel,
  normalizeB2BWorkCategoryCode,
  sortB2BWorkCategories,
  type B2BWorkCategory,
} from './b2bWorkCategories';

const category = (overrides: Partial<B2BWorkCategory>): B2BWorkCategory => ({
  id: 'cat-1',
  code: 'dc_install',
  label: 'DC montavimas',
  description: null,
  sort_order: 10,
  is_active: true,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

describe('B2B work category helpers', () => {
  it('filters active categories', () => {
    const categories = [
      category({ id: 'active', is_active: true }),
      category({ id: 'inactive', is_active: false }),
    ];

    expect(filterActiveB2BWorkCategories(categories).map((item) => item.id)).toEqual(['active']);
  });

  it('sorts by sort_order and then Lithuanian label', () => {
    const sorted = sortB2BWorkCategories([
      category({ id: 'b', label: 'Moduliai', sort_order: 20 }),
      category({ id: 'a', label: 'Balastas', sort_order: 10 }),
      category({ id: 'c', label: 'DC', sort_order: 10 }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['a', 'c', 'b']);
  });

  it('treats sort_order as display ordering, not planned time', () => {
    const payload = buildB2BWorkCategoryReorderPayload([
      { id: 'dc', sort_order: 10 },
    ]);

    expect(payload).toEqual([{ id: 'dc', sort_order: 10 }]);
    expect(payload[0]).not.toHaveProperty('hours');
    expect(payload[0]).not.toHaveProperty('duration');
  });

  it('normalizes category codes', () => {
    expect(normalizeB2BWorkCategoryCode('  Lovelių montavimas / B2B  ')).toBe('loveliu_montavimas_b2b');
    expect(normalizeB2BWorkCategoryCode('   ')).toBe('b2b_darbas');
  });

  it('finds labels by id or code', () => {
    const categories = [category({ id: 'cat-dc', code: 'dc_install', label: 'DC montavimas' })];

    expect(getB2BWorkCategoryLabel(categories, 'cat-dc')).toBe('DC montavimas');
    expect(getB2BWorkCategoryLabel(categories, 'dc_install')).toBe('DC montavimas');
    expect(getB2BWorkCategoryLabel(categories, 'missing')).toBe('-');
  });

  it('builds API payloads for create, update, deactivate, and reorder', () => {
    expect(buildB2BWorkCategoryInsertPayload({
      label: '  Naujas darbas  ',
      description: '  Aprašymas  ',
      sort_order: 30,
    })).toEqual({
      code: 'naujas_darbas',
      label: 'Naujas darbas',
      description: 'Aprašymas',
      sort_order: 30,
      is_active: true,
    });

    expect(buildB2BWorkCategoryUpdatePayload({
      code: 'DC montavimas',
      label: '  DC  ',
      description: '   ',
      is_active: false,
    })).toEqual({
      code: 'dc_montavimas',
      label: 'DC',
      description: null,
      is_active: false,
    });

    expect(buildDeactivateB2BWorkCategoryPayload()).toEqual({ is_active: false });
    expect(buildB2BWorkCategoryReorderPayload([
      { id: 'a', sort_order: 10 },
      { id: 'b', sort_order: 20 },
    ])).toEqual([
      { id: 'a', sort_order: 10 },
      { id: 'b', sort_order: 20 },
    ]);
  });
});
