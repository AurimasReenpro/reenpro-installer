// ── B2B site setup: apply SELECTED work categories to a site ─────────────────
// Used at creation and when adding works to an existing B2B site. Idempotent:
// existing phases (matched by category id, code or label) and existing
// checklist items (matched by text + phase) are never duplicated.

import { supabase } from '../lib/supabase';
import { getActiveB2BWorkCategories } from './b2bWorkCategories';
import { getB2BChecklistTemplateTasksByCategory } from './checklistTemplateTasks';
import { getSiteWorkPhases } from './workPhases';
import {
  createSiteWorkPhasePayloadsFromCategories,
  findExistingPhaseForCategory,
  mapChecklistTemplatesToSelectedB2BPhases,
  normalizeB2BWorkCategorySelection,
} from '../lib/siteCreationB2B';

export interface ApplyB2BWorkSelectionResult {
  createdPhaseCount: number;
  createdItemCount: number;
  /** Active B2B template tasks without a category — not auto-applied. */
  unassignedTaskCount: number;
}

/**
 * Materialize the selected B2B work categories on a site:
 *   1. create the missing site_work_phases (label/sort copied, category linked);
 *   2. create site_checklist_items from checklist templates of the SELECTED
 *      categories only, pointed at the matching site phase.
 * Inactive/unknown category ids are dropped; throws when nothing remains.
 */
export async function applyB2BWorkSelectionToSite(
  siteId: string,
  selectedCategoryIds: string[],
): Promise<ApplyB2BWorkSelectionResult> {
  const catalog = await getActiveB2BWorkCategories();
  const selected = normalizeB2BWorkCategorySelection(selectedCategoryIds, catalog);
  if (selected.length === 0) {
    throw new Error('Pasirinkite bent vieną B2B darbą.');
  }

  // ── 1. Phases (dedupe against whatever the site already has) ──
  const existingPhases = await getSiteWorkPhases(siteId);
  const phasePayloads = createSiteWorkPhasePayloadsFromCategories(siteId, selected, existingPhases);
  if (phasePayloads.length > 0) {
    const { error } = await supabase
      .from('site_work_phases')
      .upsert(phasePayloads, { onConflict: 'site_id,code', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  // Re-read so the map contains BOTH pre-existing and just-created phases.
  const allPhases = await getSiteWorkPhases(siteId);
  const phaseIdByCategoryId = new Map<string, string>();
  for (const category of selected) {
    const phase = findExistingPhaseForCategory(category, allPhases);
    if (phase) phaseIdByCategoryId.set(category.id, phase.id);
  }

  // ── 2. Checklist items for the selected categories only ──
  const templates = await getB2BChecklistTemplateTasksByCategory();
  const mapping = mapChecklistTemplatesToSelectedB2BPhases(
    templates,
    selected.map((c) => c.id),
    phaseIdByCategoryId,
  );

  let createdItemCount = 0;
  if (mapping.items.length > 0) {
    // Ensure a checklist session exists (creation flow has none yet).
    const { data: existingSession, error: sessionErr } = await supabase
      .from('site_checklists')
      .select('id')
      .eq('site_id', siteId)
      .limit(1)
      .maybeSingle();
    if (sessionErr) throw new Error(sessionErr.message);

    let sessionId = existingSession?.id ?? null;
    if (!sessionId) {
      const { data: session, error: createErr } = await supabase
        .from('site_checklists')
        .insert({ site_id: siteId, status: 'pending' })
        .select('id')
        .single();
      if (createErr) throw new Error(createErr.message);
      sessionId = session.id;
    }

    // Dedupe against items already in the session (edit-add flow): an item is
    // "the same" when text + work phase match.
    const { data: existingItems, error: itemsErr } = await supabase
      .from('site_checklist_items')
      .select('question_text, work_phase_id')
      .eq('site_checklist_id', sessionId);
    if (itemsErr) throw new Error(itemsErr.message);

    const seen = new Set(
      (existingItems ?? []).map((i) => `${(i.question_text ?? '').trim().toLowerCase()}|${i.work_phase_id ?? ''}`),
    );
    const newItems = mapping.items
      .filter((i) => !seen.has(`${i.question_text.trim().toLowerCase()}|${i.work_phase_id ?? ''}`))
      .map((i) => ({ ...i, site_checklist_id: sessionId }));

    if (newItems.length > 0) {
      const { error: insertErr } = await supabase.from('site_checklist_items').insert(newItems);
      if (insertErr) throw new Error(insertErr.message);
      createdItemCount = newItems.length;
    }
  }

  if (mapping.unassignedTaskCount > 0) {
    console.warn(
      `Yra nepriskirtų B2B šablono užduočių (${mapping.unassignedTaskCount}) — jos nebus automatiškai pritaikytos.`,
    );
  }

  return {
    createdPhaseCount: phasePayloads.length,
    createdItemCount,
    unassignedTaskCount: mapping.unassignedTaskCount,
  };
}
