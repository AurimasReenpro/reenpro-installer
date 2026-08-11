import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';
import {
  buildB2BChecklistTaskInsertPayload,
  buildB2BChecklistTaskReorderPayload,
  buildB2BChecklistTaskUpdatePayload,
  sortChecklistTemplateTasks,
  type B2BChecklistTaskInput,
  type B2BChecklistTaskReorderItem,
  type ChecklistTemplateTask,
} from '../lib/checklistTemplateTasks';

type ChecklistTemplateInsert = Database['public']['Tables']['checklist_templates']['Insert'];
type ChecklistTemplateUpdate = Database['public']['Tables']['checklist_templates']['Update'];

export async function getB2BChecklistTemplateTasksByCategory(): Promise<ChecklistTemplateTask[]> {
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('*')
    .ilike('category', 'B2B')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('phase', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return sortChecklistTemplateTasks((data ?? []) as ChecklistTemplateTask[]);
}

export async function createB2BChecklistTask(input: B2BChecklistTaskInput): Promise<void> {
  const payload = buildB2BChecklistTaskInsertPayload(input) as ChecklistTemplateInsert;
  const { error } = await supabase
    .from('checklist_templates')
    .insert(payload);

  if (error) throw new Error(error.message);
}

export async function updateB2BChecklistTask(id: string, input: Partial<B2BChecklistTaskInput>): Promise<void> {
  const payload = buildB2BChecklistTaskUpdatePayload(input) as ChecklistTemplateUpdate;
  const { error } = await supabase
    .from('checklist_templates')
    .update(payload)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function deactivateB2BChecklistTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('checklist_templates')
    .update({ is_active: false } satisfies ChecklistTemplateUpdate)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function reorderB2BChecklistTasks(items: B2BChecklistTaskReorderItem[]): Promise<void> {
  const payload = buildB2BChecklistTaskReorderPayload(items);
  await Promise.all(payload.map(async (item) => {
    const { error } = await supabase
      .from('checklist_templates')
      .update({ sort_order: item.sort_order } satisfies ChecklistTemplateUpdate)
      .eq('id', item.id);

    if (error) throw new Error(error.message);
  }));
}
