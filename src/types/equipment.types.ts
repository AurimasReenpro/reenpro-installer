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
  /** Battery storage capacity in kWh — only meaningful for energy-storage rows. */
  capacity_kwh?: number;
}

/** One row in the central equipment_catalog table */
export interface CatalogItem {
  id: string;
  category: string;
  brand: string;
  model: string;
  specifications: string | null;
  /** Base battery capacity per unit (kWh) — only for energy-storage items. */
  capacity_kwh: number | null;
  created_at: string;
}

/** Canonical name for the energy-storage / battery category. */
export const BATTERY_CATEGORY = 'Energijos kaupiklis';

/**
 * True if a category represents an energy-storage unit. Accepts both the new
 * "Energijos kaupiklis" label and the legacy "BESS" key so existing data and
 * the conditional capacity field keep working before/after the rename.
 */
export function isBatteryCategory(category: string | null | undefined): boolean {
  const v = (category ?? '').trim().toLowerCase();
  return v === 'bess' || v.includes('kaupiklis') || v.includes('baterij') || v.includes('battery');
}

/** Standard categories for dropdown grouping */
export const EQUIPMENT_CATEGORIES = [
  'Inverteris',
  'Moduliai',
  BATTERY_CATEGORY,
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
        // Preserve battery capacity if present (otherwise leave it off the object).
        ...(typeof item.capacity_kwh === 'number' ? { capacity_kwh: item.capacity_kwh } : {}),
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
