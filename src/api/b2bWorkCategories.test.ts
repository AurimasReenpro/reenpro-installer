import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: mocks.from,
  },
}));

import {
  createB2BWorkCategory,
  deactivateB2BWorkCategory,
  getB2BWorkCategories,
  reorderB2BWorkCategories,
  updateB2BWorkCategory,
} from './b2bWorkCategories';

describe('B2B work category API payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.eq.mockResolvedValue({ error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.order
      .mockReturnValueOnce({ order: mocks.order })
      .mockResolvedValue({ data: [], error: null });
    mocks.select.mockReturnValue({ order: mocks.order });
    mocks.from.mockReturnValue({
      insert: mocks.insert,
      update: mocks.update,
      select: mocks.select,
    });
  });

  it('reads from the catalog table without touching site_work_phases', async () => {
    await getB2BWorkCategories();

    expect(mocks.from).toHaveBeenCalledWith('b2b_work_categories');
    expect(mocks.from).not.toHaveBeenCalledWith('site_work_phases');
  });

  it('creates normalized catalog rows', async () => {
    await createB2BWorkCategory({ label: '  Lovelių montavimas  ', sort_order: 30 });

    expect(mocks.insert).toHaveBeenCalledWith({
      code: 'loveliu_montavimas',
      label: 'Lovelių montavimas',
      description: null,
      sort_order: 30,
      is_active: true,
    });
  });

  it('updates catalog rows', async () => {
    await updateB2BWorkCategory('cat-1', { label: '  Inverteriai  ', is_active: true });

    expect(mocks.update).toHaveBeenCalledWith({ label: 'Inverteriai', is_active: true });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'cat-1');
  });

  it('deactivates instead of deleting', async () => {
    await deactivateB2BWorkCategory('cat-1');

    expect(mocks.update).toHaveBeenCalledWith({ is_active: false });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'cat-1');
  });

  it('reorders catalog rows with per-row update payloads', async () => {
    await reorderB2BWorkCategories([
      { id: 'cat-1', sort_order: 10 },
      { id: 'cat-2', sort_order: 20 },
    ]);

    expect(mocks.update).toHaveBeenCalledWith({ sort_order: 10 });
    expect(mocks.update).toHaveBeenCalledWith({ sort_order: 20 });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'cat-1');
    expect(mocks.eq).toHaveBeenCalledWith('id', 'cat-2');
  });
});
