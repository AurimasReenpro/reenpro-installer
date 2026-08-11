// ── Pure model for the Admin Checklists page sections ─────────────────────────
// "B2B darbai" = reusable work CATALOG (b2b_work_categories).
// "* užduotys" = checklist TEMPLATE tasks. The numeric field on both is
// sort_order — ordering only, never time.

import { normalizeChecklistCategory } from '../../../lib/siteTypes';
import type { B2BWorkCategory } from '../../../lib/b2bWorkCategories';

/** Section heading for the task list of the active tab. */
export function getTaskSectionTitle(activeCategory: string): string {
  const normalized = normalizeChecklistCategory(activeCategory);
  if (normalized === 'b2b') return 'B2B užduotys';
  if (normalized === 'b2c') return 'B2C užduotys';
  if (normalized === 'servisas' || normalized === 'service') return 'Serviso užduotys';
  return 'Užduotys';
}

/** Catalog purpose helper (spec copy — shown under the "B2B darbai" header). */
export const B2B_CATALOG_HINT =
  'Naudojama kaip B2B objektų darbų katalogas. Pasirinkti darbai kuriant objektą sukurs etapus, checklist užduotis ir bus naudojami laiko fiksavimui.';

/** Ordering-not-time helper (spec copy — shown next to the "Eilė" control). */
export const EILE_ORDER_HINT = 'Naudojama tik rikiavimui. Tai nėra planuojamas laikas.';

/**
 * Only ACTIVE catalog categories are valid targets for adding new template
 * tasks (inactive ones stay visible for existing data, but not addable).
 */
export function isAddableB2BCategory(category: Pick<B2BWorkCategory, 'is_active'>): boolean {
  return category.is_active;
}
