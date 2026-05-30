// ── Shared equipment types ────────────────────────────────────────────────────

/** One row in the equipment_categories table */
export interface EquipmentCategoryDef {
  id: string;
  name: string;
  bg_color: string;
  text_color: string;
  border_color: string;
}

/** One row in an object's equipment list */
export interface EquipmentItem {
  category: string;
  model: string;
  quantity: number;
  unit: string;
  notes: string;
}

/** One row in the central equipment_catalog table */
export interface CatalogItem {
  id: string;
  category: string;
  brand: string;
  model: string;
  specifications: string | null;
  created_at: string;
}

/** Standard categories for dropdown grouping */
export const EQUIPMENT_CATEGORIES = [
  'Inverteris',
  'Moduliai',
  'BESS',
  'Konstrukcija',
  'Kabeliai',
  'Apsauga',
  'Kita',
] as const;

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

/** Standard units of measurement */
export const EQUIPMENT_UNITS = [
  'vnt.',
  'm',
  'kompl.',
  'm²',
  'kg',
] as const;

export type EquipmentUnit = (typeof EQUIPMENT_UNITS)[number];

/**
 * Safely parse `equipment_details` JSONB — handles both:
 *   - New format: EquipmentItem[]
 *   - Legacy format: Record<string, string>  (key = category, value = model)
 */
export function parseEquipmentDetails(raw: unknown): EquipmentItem[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    // New format — validate minimal shape and ensure unit is present
    return (raw as EquipmentItem[])
      .filter((item) => item && typeof item === 'object' && 'category' in item)
      .map((item) => ({
        category: item.category || '',
        model: item.model || '',
        quantity: typeof item.quantity === 'number' ? item.quantity : 1,
        unit: item.unit || 'vnt.',
        notes: item.notes || '',
      }));
  }

  if (typeof raw === 'object') {
    // Legacy key-value format → convert
    return Object.entries(raw as Record<string, string>).map(([category, model]) => ({
      category,
      model,
      quantity: 1,
      unit: 'vnt.',
      notes: '',
    }));
  }

  return [];
}
