import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  ilike: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: mocks.from,
  },
}));

import {
  createB2BChecklistTask,
  deactivateB2BChecklistTask,
  getB2BChecklistTemplateTasksByCategory,
  reorderB2BChecklistTasks,
  updateB2BChecklistTask,
} from './checklistTemplateTasks';

describe('B2B checklist template task API payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.order
      .mockReturnValueOnce({ order: mocks.order })
      .mockReturnValueOnce({ order: mocks.order })
      .mockResolvedValue({ data: [], error: null });
    mocks.ilike.mockReturnValue({ eq: mocks.eq });
    mocks.select.mockReturnValue({ ilike: mocks.ilike });
    mocks.from.mockReturnValue({
      insert: mocks.insert,
      update: mocks.update,
      select: mocks.select,
    });
  });

  it('reads B2B template tasks from checklist_templates', async () => {
    await getB2BChecklistTemplateTasksByCategory();

    expect(mocks.from).toHaveBeenCalledWith('checklist_templates');
    expect(mocks.ilike).toHaveBeenCalledWith('category', 'B2B');
    expect(mocks.eq).toHaveBeenCalledWith('is_active', true);
  });

  it('creates tasks with b2b_work_category_id payload', async () => {
    await createB2BChecklistTask({
      name: 'Patikrinti DC',
      b2b_work_category_id: 'cat-1',
      requires_photo: true,
      min_photo_count: 0,
      sort_order: 20,
    });

    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Patikrinti DC',
      category: 'B2B',
      b2b_work_category_id: 'cat-1',
      requires_photo: true,
      min_photo_count: 1,
      sort_order: 20,
      is_active: true,
    }));
  });

  it('updates b2b_work_category_id without deleting existing tasks', async () => {
    await updateB2BChecklistTask('task-1', { b2b_work_category_id: 'cat-2' });

    expect(mocks.update).toHaveBeenCalledWith({ b2b_work_category_id: 'cat-2' });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'task-1');
  });

  it('deactivation soft-hides the task instead of deleting it', async () => {
    await deactivateB2BChecklistTask('task-1');

    expect(mocks.update).toHaveBeenCalledWith({ is_active: false });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'task-1');
  });

  it('reorders tasks by updating sort_order only', async () => {
    await reorderB2BChecklistTasks([
      { id: 'task-1', sort_order: 10 },
      { id: 'task-2', sort_order: 20 },
    ]);

    expect(mocks.update).toHaveBeenCalledWith({ sort_order: 10 });
    expect(mocks.update).toHaveBeenCalledWith({ sort_order: 20 });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'task-1');
    expect(mocks.eq).toHaveBeenCalledWith('id', 'task-2');
  });
});
