import { normalizeChecklistCategory } from './siteTypes';
import { normalizePhotoRequirement } from './checklistTemplatePhases';
import type { B2BWorkCategory } from './b2bWorkCategories';

export type ChecklistTemplateTaskPhase = 'pre' | 'during' | 'post';

export interface ChecklistTemplateTask {
  id: string;
  name: string;
  phase: ChecklistTemplateTaskPhase;
  category: string | null;
  requires_photo: boolean;
  min_photo_count: number;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  template_work_phase_id: string | null;
  b2b_work_category_id: string | null;
}

export interface B2BChecklistTemplateTaskGroup {
  categoryId: string | null;
  label: string;
  sortOrder: number;
  isActive: boolean;
  tasks: ChecklistTemplateTask[];
}

export interface B2BChecklistTaskInput {
  name: string;
  phase?: ChecklistTemplateTaskPhase;
  b2b_work_category_id?: string | null;
  is_required?: boolean;
  requires_photo?: boolean;
  min_photo_count?: number;
  sort_order?: number;
  is_active?: boolean;
}

export interface B2BChecklistTaskReorderItem {
  id: string;
  sort_order: number;
}

export const UNASSIGNED_B2B_TASK_GROUP_ID = '__unassigned_b2b_tasks__';
export const UNASSIGNED_B2B_TASK_GROUP_LABEL = 'Nepriskirtos B2B užduotys';

export function sortChecklistTemplateTasks<T extends Pick<ChecklistTemplateTask, 'name' | 'phase' | 'sort_order'>>(tasks: T[]): T[] {
  const phaseOrder: Record<string, number> = { pre: 10, during: 20, post: 30 };
  return [...tasks].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    const aOrder = phaseOrder[a.phase] ?? 999;
    const bOrder = phaseOrder[b.phase] ?? 999;
    return aOrder - bOrder || a.name.localeCompare(b.name, 'lt');
  });
}

export function filterActiveChecklistTemplateTasks<T extends Pick<ChecklistTemplateTask, 'is_active'>>(tasks: T[]): T[] {
  return tasks.filter((task) => task.is_active);
}

export function getB2BChecklistTemplateTasks(tasks: ChecklistTemplateTask[]): ChecklistTemplateTask[] {
  return tasks.filter((task) => normalizeChecklistCategory(task.category) === 'b2b');
}

export function getUnassignedB2BChecklistTemplateTasks(tasks: ChecklistTemplateTask[]): ChecklistTemplateTask[] {
  return sortChecklistTemplateTasks(
    filterActiveChecklistTemplateTasks(getB2BChecklistTemplateTasks(tasks))
      .filter((task) => !task.b2b_work_category_id),
  );
}

export function groupChecklistTemplateTasksByB2BWorkCategory(
  tasks: ChecklistTemplateTask[],
  categories: Pick<B2BWorkCategory, 'id' | 'label' | 'sort_order' | 'is_active'>[],
): B2BChecklistTemplateTaskGroup[] {
  const b2bTasks = filterActiveChecklistTemplateTasks(getB2BChecklistTemplateTasks(tasks));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const groups = new Map<string, B2BChecklistTemplateTaskGroup>();

  for (const category of categories) {
    groups.set(category.id, {
      categoryId: category.id,
      label: category.label,
      sortOrder: category.sort_order,
      isActive: category.is_active,
      tasks: [],
    });
  }

  for (const task of b2bTasks) {
    const category = task.b2b_work_category_id ? categoryById.get(task.b2b_work_category_id) : null;
    const key = category?.id ?? UNASSIGNED_B2B_TASK_GROUP_ID;
    const group = groups.get(key) ?? {
      categoryId: category?.id ?? null,
      label: category?.label ?? UNASSIGNED_B2B_TASK_GROUP_LABEL,
      sortOrder: category?.sort_order ?? Number.MAX_SAFE_INTEGER,
      isActive: category?.is_active ?? false,
      tasks: [],
    };
    group.tasks.push(task);
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.tasks.length > 0 || (group.categoryId !== null && group.isActive))
    .map((group) => ({ ...group, tasks: sortChecklistTemplateTasks(group.tasks) }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'lt'));
}

export function buildB2BChecklistTaskInsertPayload(input: B2BChecklistTaskInput) {
  const photo = normalizePhotoRequirement(input.requires_photo ?? false, input.min_photo_count ?? 0);
  return {
    name: input.name.trim(),
    phase: input.phase ?? 'during',
    category: 'B2B',
    b2b_work_category_id: input.b2b_work_category_id ?? null,
    is_required: input.is_required ?? true,
    is_active: input.is_active ?? true,
    sort_order: input.sort_order ?? 0,
    requires_photo: photo.requiresPhoto,
    min_photo_count: photo.minPhotoCount,
  };
}

export function buildB2BChecklistTaskUpdatePayload(input: Partial<B2BChecklistTaskInput>) {
  const photo = input.requires_photo === undefined && input.min_photo_count === undefined
    ? null
    : normalizePhotoRequirement(input.requires_photo ?? false, input.min_photo_count ?? 0);

  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.phase !== undefined ? { phase: input.phase } : {}),
    ...(input.b2b_work_category_id !== undefined ? { b2b_work_category_id: input.b2b_work_category_id } : {}),
    ...(input.is_required !== undefined ? { is_required: input.is_required } : {}),
    ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
    ...(input.sort_order !== undefined ? { sort_order: input.sort_order } : {}),
    ...(photo ? { requires_photo: photo.requiresPhoto, min_photo_count: photo.minPhotoCount } : {}),
  };
}

export function buildB2BChecklistTaskReorderPayload(items: B2BChecklistTaskReorderItem[]) {
  return items.map((item) => ({
    id: item.id,
    sort_order: item.sort_order,
  }));
}
