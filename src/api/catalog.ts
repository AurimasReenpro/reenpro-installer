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
  return data ?? [];
}

// ── Create a catalog item ────────────────────────────────────────────────────
// capacity_kwh is OPTIONAL in the payload: it's only sent when a value is given,
// so adding non-battery items still works before the capacity_kwh column exists.
export async function createCatalogItem(
  item: Omit<CatalogItem, 'id' | 'created_at' | 'capacity_kwh'> & { capacity_kwh?: number | null }
): Promise<void> {
  const { error } = await supabase.from('equipment_catalog').insert(item);
  if (error) throw new Error(error.message);
}

// ── Delete a catalog item ────────────────────────────────────────────────────
export async function deleteCatalogItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('equipment_catalog')
    .delete()
    .eq('id', id);
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
