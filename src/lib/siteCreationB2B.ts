// ── Pure helpers for B2B site creation with SELECTED work categories ─────────
// A B2B site materializes only the admin-selected b2b_work_categories into
// site_work_phases + checklist items. All decision logic lives here (testable);
// the API layer only executes the returned payloads.

import type { B2BWorkCategory } from './b2bWorkCategories';
import type { ChecklistTemplateTask } from './checklistTemplateTasks';
import type { WorkPhase } from './workPhases';

/** True when at least one category is selected (B2B create validation). */
export function hasB2BWorkSelection(selectedIds: readonly string[] | null | undefined): boolean {
  return !!selectedIds && selectedIds.length > 0;
}

/**
 * Normalize a raw selection against the catalog: dedupe, drop unknown ids and
 * INACTIVE categories, and return the categories in catalog sort order.
 */
export function normalizeB2BWorkCategorySelection(
  selectedIds: readonly string[],
  catalog: readonly B2BWorkCategory[],
): B2BWorkCategory[] {
  const wanted = new Set(selectedIds);
  return catalog.filter((c) => c.is_active && wanted.has(c.id));
}

const normalizeLabel = (s: string) => s.trim().toLowerCase();

/**
 * Find an existing site phase for a category: primary match by
 * b2b_work_category_id, fallback by code or normalized label (legacy rows
 * created before the category link existed).
 */
export function findExistingPhaseForCategory(
  category: Pick<B2BWorkCategory, 'id' | 'code' | 'label'>,
  existingPhases: readonly WorkPhase[],
): WorkPhase | undefined {
  return (
    existingPhases.find((p) => p.b2b_work_category_id === category.id)
    ?? existingPhases.find((p) => p.code === category.code)
    ?? existingPhases.find((p) => normalizeLabel(p.label) === normalizeLabel(category.label))
  );
}

export interface SiteWorkPhasePayload {
  site_id: string;
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  b2b_work_category_id: string;
}

/**
 * Insert payloads for the selected categories that do NOT already have a
 * matching phase on the site. Label/sort_order are copied from the category.
 */
export function createSiteWorkPhasePayloadsFromCategories(
  siteId: string,
  selectedCategories: readonly B2BWorkCategory[],
  existingPhases: readonly WorkPhase[],
): SiteWorkPhasePayload[] {
  return selectedCategories
    .filter((category) => !findExistingPhaseForCategory(category, existingPhases))
    .map((category) => ({
      site_id: siteId,
      code: category.code,
      label: category.label,
      sort_order: category.sort_order,
      is_active: true,
      b2b_work_category_id: category.id,
    }));
}

export interface B2BChecklistItemPayload {
  question_text: string;
  category: string | null;
  phase: string | null;
  is_required: boolean;
  requires_photo: boolean;
  min_photo_count: number;
  work_phase_id: string | null;
  status: 'pending';
}

export interface B2BChecklistMappingResult {
  items: B2BChecklistItemPayload[];
  /** Active B2B template tasks with NO category — deliberately NOT applied. */
  unassignedTaskCount: number;
}

/**
 * Map checklist template tasks to the selected categories only.
 *   • tasks are applied iff their b2b_work_category_id is in the selection;
 *   • work_phase_id points at the site phase created for that category;
 *   • required / requires_photo / min_photo_count / name / sort are preserved
 *     (sort via the incoming task order — pass pre-sorted tasks);
 *   • inactive tasks and unassigned (category-less) B2B tasks are skipped —
 *     the unassigned count is surfaced so the UI can warn.
 */
export function mapChecklistTemplatesToSelectedB2BPhases(
  tasks: readonly ChecklistTemplateTask[],
  selectedCategoryIds: readonly string[],
  phaseIdByCategoryId: ReadonlyMap<string, string>,
): B2BChecklistMappingResult {
  const selected = new Set(selectedCategoryIds);
  const items: B2BChecklistItemPayload[] = [];
  let unassignedTaskCount = 0;

  for (const task of tasks) {
    if (!task.is_active) continue;
    if (task.b2b_work_category_id == null) {
      unassignedTaskCount += 1;
      continue;
    }
    if (!selected.has(task.b2b_work_category_id)) continue;

    items.push({
      question_text: task.name,
      category: task.category ?? null,
      phase: task.phase ?? null,
      is_required: task.is_required,
      requires_photo: task.requires_photo,
      min_photo_count: task.requires_photo ? Math.max(1, task.min_photo_count) : task.min_photo_count,
      work_phase_id: phaseIdByCategoryId.get(task.b2b_work_category_id) ?? null,
      status: 'pending',
    });
  }

  return { items, unassignedTaskCount };
}
