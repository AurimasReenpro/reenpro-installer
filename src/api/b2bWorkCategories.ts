import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';
import {
  buildB2BWorkCategoryInsertPayload,
  buildB2BWorkCategoryReorderPayload,
  buildB2BWorkCategoryUpdatePayload,
  buildDeactivateB2BWorkCategoryPayload,
  filterActiveB2BWorkCategories,
  sortB2BWorkCategories,
  type B2BWorkCategory,
  type B2BWorkCategoryInput,
  type B2BWorkCategoryReorderItem,
} from '../lib/b2bWorkCategories';

type B2BWorkCategoryUpdate = Partial<B2BWorkCategoryInput>;
type B2BWorkCategoryInsert = Database['public']['Tables']['b2b_work_categories']['Insert'];

export async function getB2BWorkCategories(): Promise<B2BWorkCategory[]> {
  const { data, error } = await supabase
    .from('b2b_work_categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (error) throw new Error(error.message);
  return sortB2BWorkCategories((data ?? []) as B2BWorkCategory[]);
}

export async function getActiveB2BWorkCategories(): Promise<B2BWorkCategory[]> {
  const categories = await getB2BWorkCategories();
  return filterActiveB2BWorkCategories(categories);
}

export async function createB2BWorkCategory(input: B2BWorkCategoryInput): Promise<void> {
  const payload = buildB2BWorkCategoryInsertPayload(input) as B2BWorkCategoryInsert;
  const { error } = await supabase
    .from('b2b_work_categories')
    .insert(payload);

  if (error) throw new Error(error.message);
}

export async function updateB2BWorkCategory(id: string, input: B2BWorkCategoryUpdate): Promise<void> {
  const payload = buildB2BWorkCategoryUpdatePayload(input);
  const { error } = await supabase
    .from('b2b_work_categories')
    .update(payload)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function deactivateB2BWorkCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('b2b_work_categories')
    .update(buildDeactivateB2BWorkCategoryPayload())
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function reorderB2BWorkCategories(items: B2BWorkCategoryReorderItem[]): Promise<void> {
  const payload = buildB2BWorkCategoryReorderPayload(items);
  await Promise.all(payload.map(async (item) => {
    const { error } = await supabase
      .from('b2b_work_categories')
      .update({ sort_order: item.sort_order })
      .eq('id', item.id);

    if (error) throw new Error(error.message);
  }));
}
