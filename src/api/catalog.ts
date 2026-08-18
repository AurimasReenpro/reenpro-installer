import { supabase } from '../lib/supabase';
import type { CatalogItem, EquipmentCategoryDef } from '../types/equipment.types';

// ── Fetch all catalog items ──────────────────────────────────────────────────
export async function getCatalogItems(): Promise<CatalogItem[]> {
  const { data, error } = await supabase
    .from('equipment_catalog')
    .select('*')
    .order('category', { ascending: true })
    .order('brand', { ascending: true })
    .order('model', { ascending: true });

  if (error) throw new Error(error.message);
  // `kind` bazėje yra `text` su CHECK apribojimu, tad tipas siaurinamas čia.
  return (data ?? []) as CatalogItem[];
}

// ── Create a catalog item ────────────────────────────────────────────────────
// capacity_kwh is OPTIONAL in the payload: it's only sent when a value is given,
// so adding non-battery items still works before the capacity_kwh column exists.
export async function createCatalogItem(
  item: Omit<CatalogItem, 'id' | 'created_at' | 'capacity_kwh' | 'power_w' | 'unit' | 'code' | 'kind' | 'is_active'>
    & {
      capacity_kwh?: number | null;
      /** Kaip ir talpa — siunčiama tik kai reikšmė yra, kad senos schemos neužkliūtų. */
      power_w?: number | null;
      unit?: string;
      code?: string | null;
      kind?: CatalogItem['kind'];
    }
): Promise<void> {
  const { error } = await supabase.from('equipment_catalog').insert(item);
  if (error) throw new Error(error.message);
}

/**
 * Atnaujina katalogo įrašą.
 *
 * Reikalinga pirmiausia `unit` ir `code` užpildymui: seni įrašai jų neturi, o
 * be Rivilės kodo nurašymo eksportas negali būti savarankiškas dokumentas.
 */
export async function updateCatalogItem(
  id: string,
  patch: Partial<Pick<CatalogItem, 'category' | 'brand' | 'model' | 'specifications'
    | 'capacity_kwh' | 'power_w' | 'unit' | 'code' | 'kind' | 'is_active'>>,
): Promise<void> {
  const { error } = await supabase.from('equipment_catalog').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Delete a catalog item ────────────────────────────────────────────────────

/**
 * Prekė naudojama objekto žiniaraštyje arba šablone.
 *
 * Abu ryšiai yra `ON DELETE RESTRICT`, tad bazė trynimą uždraudžia pati. Ši
 * klaida tą paverčia sprendimu: ištrinti negalima, bet galima išjungti.
 */
export class CatalogItemInUseError extends Error {
  constructor() {
    super('Prekė naudojama žiniaraštyje arba šablone.');
    this.name = 'CatalogItemInUseError';
  }
}

/**
 * Kiek kartų prekė panaudota. Tikrinama PRIEŠ trynimą, kad žmogui būtų galima
 * pasakyti skaičių, o ne tik „negalima".
 */
export async function getCatalogItemUsage(
  id: string,
): Promise<{ ziniarasciai: number; sablonai: number }> {
  const [eilutes, sablonai] = await Promise.all([
    supabase.from('site_material_lines')
      .select('id', { count: 'exact', head: true }).eq('catalog_item_id', id),
    supabase.from('material_template_lines')
      .select('id', { count: 'exact', head: true }).eq('catalog_item_id', id),
  ]);
  if (eilutes.error) throw new Error(eilutes.error.message);
  if (sablonai.error) throw new Error(sablonai.error.message);
  return { ziniarasciai: eilutes.count ?? 0, sablonai: sablonai.count ?? 0 };
}

export async function deleteCatalogItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('equipment_catalog')
    .delete()
    .eq('id', id);
  // 23503 — foreign_key_violation. Naudojimas tikrinamas ir prieš trynimą, bet
  // tarp patikros ir trynimo prekė gali būti panaudota, tad reikia ir čia.
  if (error?.code === '23503') throw new CatalogItemInUseError();
  if (error) throw new Error(error.message);
}

// ── Equipment categories ─────────────────────────────────────────────────────
export async function getEquipmentCategories(): Promise<EquipmentCategoryDef[]> {
  const { data, error } = await supabase
    .from('equipment_categories')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createEquipmentCategory(
  cat: Omit<EquipmentCategoryDef, 'id'>
): Promise<void> {
  const { error } = await supabase.from('equipment_categories').insert(cat);
  if (error) throw new Error(error.message);
}

export async function updateEquipmentCategory(
  id: string,
  updates: Partial<Omit<EquipmentCategoryDef, 'id'>>
): Promise<void> {
  const { error } = await supabase
    .from('equipment_categories')
    .update(updates)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteEquipmentCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('equipment_categories')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}
