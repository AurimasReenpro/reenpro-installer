import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';
import type { ChecklistTemplateWorkPhase } from '../lib/checklistTemplatePhases';

export type ChecklistTemplatePhaseUpdate =
  Partial<Pick<ChecklistTemplateWorkPhase, 'label' | 'sort_order' | 'is_active'>>;

export async function getChecklistTemplateWorkPhases(category: string): Promise<ChecklistTemplateWorkPhase[]> {
  const { data, error } = await supabase
    .from('checklist_template_work_phases')
    .select('*')
    .ilike('category', category)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addChecklistTemplateWorkPhase(
  phase: Database['public']['Tables']['checklist_template_work_phases']['Insert'],
): Promise<void> {
  const { error } = await supabase
    .from('checklist_template_work_phases')
    .insert(phase);

  if (error) throw new Error(error.message);
}

export async function updateChecklistTemplateWorkPhase(
  phaseId: string,
  update: ChecklistTemplatePhaseUpdate,
): Promise<void> {
  const { error } = await supabase
    .from('checklist_template_work_phases')
    .update(update)
    .eq('id', phaseId);

  if (error) throw new Error(error.message);
}

export async function deactivateChecklistTemplateWorkPhase(phaseId: string): Promise<void> {
  await updateChecklistTemplateWorkPhase(phaseId, { is_active: false });
}
