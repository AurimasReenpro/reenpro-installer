import { describe, expect, it } from 'vitest';
import {
  buildB2BChecklistTaskInsertPayload,
  filterActiveChecklistTemplateTasks,
  getUnassignedB2BChecklistTemplateTasks,
  groupChecklistTemplateTasksByB2BWorkCategory,
  sortChecklistTemplateTasks,
  type ChecklistTemplateTask,
} from './checklistTemplateTasks';
import type { B2BWorkCategory } from './b2bWorkCategories';

const task = (overrides: Partial<ChecklistTemplateTask>): ChecklistTemplateTask => ({
  id: 'task-1',
  name: 'Patikrinti DC',
  phase: 'during',
  category: 'B2B',
  requires_photo: false,
  min_photo_count: 0,
  is_required: true,
  is_active: true,
  sort_order: 10,
  template_work_phase_id: null,
  b2b_work_category_id: null,
  ...overrides,
});

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

describe('checklist template task grouping', () => {
  it('groups B2B checklist tasks by b2b_work_category_id', () => {
    const groups = groupChecklistTemplateTasksByB2BWorkCategory(
      [
        task({ id: 'dc-1', b2b_work_category_id: 'dc' }),
        task({ id: 'modules-1', b2b_work_category_id: 'modules' }),
      ],
      [
        category({ id: 'dc', label: 'DC montavimas', sort_order: 10 }),
        category({ id: 'modules', label: 'Moduliai', sort_order: 20 }),
      ],
    );

    expect(groups.find((group) => group.categoryId === 'dc')?.tasks.map((item) => item.id)).toEqual(['dc-1']);
    expect(groups.find((group) => group.categoryId === 'modules')?.tasks.map((item) => item.id)).toEqual(['modules-1']);
  });

  it('ignores B2C and service tasks when grouping B2B work categories', () => {
    const groups = groupChecklistTemplateTasksByB2BWorkCategory(
      [
        task({ id: 'b2b', category: 'B2B', b2b_work_category_id: 'dc' }),
        task({ id: 'b2c', category: 'B2C', b2b_work_category_id: 'dc' }),
        task({ id: 'service', category: 'Servisas', b2b_work_category_id: 'dc' }),
      ],
      [category({ id: 'dc' })],
    );

    expect(groups.find((group) => group.categoryId === 'dc')?.tasks.map((item) => item.id)).toEqual(['b2b']);
  });

  it('places tasks without a category under the unassigned fallback', () => {
    const unassigned = getUnassignedB2BChecklistTemplateTasks([
      task({ id: 'unassigned', b2b_work_category_id: null }),
      task({ id: 'assigned', b2b_work_category_id: 'dc' }),
    ]);

    expect(unassigned.map((item) => item.id)).toEqual(['unassigned']);
  });

  it('normalizes photo requirements in create payloads', () => {
    expect(buildB2BChecklistTaskInsertPayload({
      name: '  Foto užduotis  ',
      requires_photo: true,
      min_photo_count: 0,
    })).toMatchObject({
      name: 'Foto užduotis',
      requires_photo: true,
      min_photo_count: 1,
      category: 'B2B',
      is_active: true,
      sort_order: 0,
    });
  });

  it('keeps inactive work category groups available for existing linked tasks', () => {
    const groups = groupChecklistTemplateTasksByB2BWorkCategory(
      [task({ id: 'old-task', b2b_work_category_id: 'old' })],
      [category({ id: 'old', label: 'Senas darbas', is_active: false })],
    );

    expect(groups.find((group) => group.categoryId === 'old')).toMatchObject({
      isActive: false,
      tasks: [expect.objectContaining({ id: 'old-task' })],
    });
  });

  it('sorts template tasks by phase and label', () => {
    expect(sortChecklistTemplateTasks([
      task({ id: 'post', phase: 'post', name: 'Z' }),
      task({ id: 'pre', phase: 'pre', name: 'A' }),
      task({ id: 'during', phase: 'during', name: 'B' }),
    ]).map((item) => item.id)).toEqual(['pre', 'during', 'post']);
  });

  it('sorts template tasks by sort_order before phase and label', () => {
    expect(sortChecklistTemplateTasks([
      task({ id: 'later-pre', phase: 'pre', name: 'A', sort_order: 20 }),
      task({ id: 'first-post', phase: 'post', name: 'Z', sort_order: 10 }),
    ]).map((item) => item.id)).toEqual(['first-post', 'later-pre']);
  });

  it('hides inactive tasks from active template views', () => {
    expect(filterActiveChecklistTemplateTasks([
      task({ id: 'active', is_active: true }),
      task({ id: 'inactive', is_active: false }),
    ]).map((item) => item.id)).toEqual(['active']);
  });

  it('keeps inactive tasks out of B2B grouped views', () => {
    const groups = groupChecklistTemplateTasksByB2BWorkCategory(
      [
        task({ id: 'active', b2b_work_category_id: 'dc', is_active: true }),
        task({ id: 'inactive', b2b_work_category_id: 'dc', is_active: false }),
      ],
      [category({ id: 'dc' })],
    );

    expect(groups.find((group) => group.categoryId === 'dc')?.tasks.map((item) => item.id)).toEqual(['active']);
  });
});
