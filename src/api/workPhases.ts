import { supabase } from '../lib/supabase';
import {
  buildDefaultWorkPhaseRows,
  buildPhaseTimeSummary,
  canHardDeletePhase,
  type PhaseTimeSummary,
  type WorkPhase,
} from '../lib/workPhases';
import type { SiteType } from '../lib/siteTypes';

export interface WorkPhaseUpdate {
  label?: string;
  sort_order?: number;
  is_active?: boolean;
}

export async function getSiteWorkPhases(
  siteId: string,
  options: { activeOnly?: boolean } = {},
): Promise<WorkPhase[]> {
  let query = supabase
    .from('site_work_phases')
    .select('*')
    .eq('site_id', siteId)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (options.activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function ensureDefaultSiteWorkPhases(siteId: string, siteType: SiteType): Promise<WorkPhase[]> {
  const existing = await getSiteWorkPhases(siteId);
  const existingCodes = new Set(existing.map((phase) => phase.code));
  const missingRows = buildDefaultWorkPhaseRows(siteId, siteType)
    .filter((row) => !existingCodes.has(row.code));

  if (missingRows.length > 0) {
    const { error } = await supabase
      .from('site_work_phases')
      .upsert(missingRows, { onConflict: 'site_id,code', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  return getSiteWorkPhases(siteId);
}

export async function getSitePhaseTimeSummary(siteId: string): Promise<PhaseTimeSummary[]> {
  const [phases, entriesResult] = await Promise.all([
    getSiteWorkPhases(siteId),
    supabase
      .from('time_entries')
      .select('id, work_phase_id, start_time, end_time, duration_minutes')
      .eq('site_id', siteId),
  ]);

  const { data: entries, error } = entriesResult;
  if (error) throw new Error(error.message);
  return buildPhaseTimeSummary(phases, entries ?? []);
}

export async function updateSiteWorkPhase(phaseId: string, update: WorkPhaseUpdate): Promise<void> {
  const { error } = await supabase
    .from('site_work_phases')
    .update(update)
    .eq('id', phaseId);

  if (error) throw new Error(error.message);
}

export async function deleteSiteWorkPhase(phaseId: string): Promise<void> {
  const { count, error: countError } = await supabase
    .from('time_entries')
    .select('*', { count: 'exact', head: true })
    .eq('work_phase_id', phaseId);

  if (countError) throw new Error(countError.message);
  if (!canHardDeletePhase(count ?? 0)) {
    throw new Error('PHASE_HAS_TIME_ENTRIES');
  }

  const { error } = await supabase
    .from('site_work_phases')
    .delete()
    .eq('id', phaseId);

  if (error) throw new Error(error.message);
}
