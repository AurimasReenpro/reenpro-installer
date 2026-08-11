import { describe, it, expect } from 'vitest';
import {
  hasB2BWorkSelection,
  normalizeB2BWorkCategorySelection,
  createSiteWorkPhasePayloadsFromCategories,
  findExistingPhaseForCategory,
  mapChecklistTemplatesToSelectedB2BPhases,
} from './siteCreationB2B';
import { buildDefaultWorkPhaseRows, getStartableWorkPhases, type WorkPhase } from './workPhases';
import type { B2BWorkCategory } from './b2bWorkCategories';
import type { ChecklistTemplateTask } from './checklistTemplateTasks';

const category = (p: Partial<B2BWorkCategory> & { id: string }): B2BWorkCategory => ({
  code: p.id, label: p.id, description: null, sort_order: 10, is_active: true,
  created_at: '', updated_at: '', ...p,
});
const phase = (p: Partial<WorkPhase> & { id: string }): WorkPhase => ({
  site_id: 'site-1', code: p.id, label: p.id, sort_order: 10, is_active: true,
  b2b_work_category_id: null, created_at: '', ...p,
});
const task = (p: Partial<ChecklistTemplateTask> & { id: string; name: string }): ChecklistTemplateTask => ({
  phase: 'during', category: 'B2B', requires_photo: false, min_photo_count: 0,
  is_required: true, is_active: true, sort_order: 0, template_work_phase_id: null,
  b2b_work_category_id: null, ...p,
});

const dc = category({ id: 'cat-dc', code: 'dc_install', label: 'DC montavimas', sort_order: 10 });
const inverters = category({ id: 'cat-inv', code: 'inverters', label: 'Inverteriai', sort_order: 50 });
const ballast = category({ id: 'cat-bal', code: 'ballast', label: 'Balasto dėjimas', sort_order: 20 });
const inactiveCat = category({ id: 'cat-off', code: 'off', label: 'Neaktyvus', is_active: false });

describe('hasB2BWorkSelection (create validation)', () => {
  it('fails validation with no selection', () => {
    expect(hasB2BWorkSelection([])).toBe(false);
    expect(hasB2BWorkSelection(undefined)).toBe(false);
    expect(hasB2BWorkSelection(['cat-dc'])).toBe(true);
  });
});

describe('normalizeB2BWorkCategorySelection', () => {
  it('drops inactive and unknown categories, keeps catalog order', () => {
    const result = normalizeB2BWorkCategorySelection(
      ['cat-off', 'cat-inv', 'ghost', 'cat-dc'],
      [dc, ballast, inverters, inactiveCat],
    );
    expect(result.map((c) => c.id)).toEqual(['cat-dc', 'cat-inv']); // catalog order, no inactive
  });
});

describe('createSiteWorkPhasePayloadsFromCategories', () => {
  it('creates payloads only for selected categories with label/sort copied + category link', () => {
    const payloads = createSiteWorkPhasePayloadsFromCategories('site-1', [dc, inverters], []);
    expect(payloads).toEqual([
      { site_id: 'site-1', code: 'dc_install', label: 'DC montavimas', sort_order: 10, is_active: true, b2b_work_category_id: 'cat-dc' },
      { site_id: 'site-1', code: 'inverters', label: 'Inverteriai', sort_order: 50, is_active: true, b2b_work_category_id: 'cat-inv' },
    ]);
  });

  it('skips categories that already have a phase (by category id, code, or label)', () => {
    const existing = [
      phase({ id: 'p1', b2b_work_category_id: 'cat-dc' }),          // matched by category id
      phase({ id: 'p2', code: 'inverters', label: 'Kita' }),        // matched by code
      phase({ id: 'p3', code: 'legacy', label: 'balasto DĖJIMAS ' }), // matched by normalized label
    ];
    const payloads = createSiteWorkPhasePayloadsFromCategories('site-1', [dc, inverters, ballast], existing);
    expect(payloads).toEqual([]);
  });
});

describe('findExistingPhaseForCategory', () => {
  it('prefers the category-id match over code/label fallbacks', () => {
    const byId = phase({ id: 'by-id', b2b_work_category_id: 'cat-dc', code: 'x', label: 'y' });
    const byCode = phase({ id: 'by-code', code: 'dc_install' });
    expect(findExistingPhaseForCategory(dc, [byCode, byId])?.id).toBe('by-id');
  });
});

describe('mapChecklistTemplatesToSelectedB2BPhases', () => {
  const phaseMap = new Map([['cat-dc', 'phase-dc'], ['cat-inv', 'phase-inv']]);
  const tasks = [
    task({ id: 't1', name: 'DC kabelių patikra', b2b_work_category_id: 'cat-dc', requires_photo: true, min_photo_count: 2 }),
    task({ id: 't2', name: 'Inverterio paleidimas', b2b_work_category_id: 'cat-inv', is_required: false }),
    task({ id: 't3', name: 'Balasto patikra', b2b_work_category_id: 'cat-bal' }),   // NOT selected
    task({ id: 't4', name: 'Sena užduotis be kategorijos' }),                        // unassigned
    task({ id: 't5', name: 'Neaktyvi', b2b_work_category_id: 'cat-dc', is_active: false }),
  ];

  it('creates items only for the selected categories', () => {
    const { items } = mapChecklistTemplatesToSelectedB2BPhases(tasks, ['cat-dc', 'cat-inv'], phaseMap);
    expect(items.map((i) => i.question_text)).toEqual(['DC kabelių patikra', 'Inverterio paleidimas']);
  });

  it('points work_phase_id at the matching site phase and preserves fields', () => {
    const { items } = mapChecklistTemplatesToSelectedB2BPhases(tasks, ['cat-dc'], phaseMap);
    expect(items[0]).toMatchObject({
      work_phase_id: 'phase-dc',
      is_required: true,
      requires_photo: true,
      min_photo_count: 2,
      status: 'pending',
    });
  });

  it('does not auto-apply unassigned B2B tasks, but reports them', () => {
    const { items, unassignedTaskCount } = mapChecklistTemplatesToSelectedB2BPhases(tasks, ['cat-dc', 'cat-inv', 'cat-bal'], phaseMap);
    expect(items.some((i) => i.question_text === 'Sena užduotis be kategorijos')).toBe(false);
    expect(unassignedTaskCount).toBe(1);
  });

  it('skips inactive tasks entirely', () => {
    const { items } = mapChecklistTemplatesToSelectedB2BPhases(tasks, ['cat-dc'], phaseMap);
    expect(items.some((i) => i.question_text === 'Neaktyvi')).toBe(false);
  });
});

describe('b2c / service creation stays simple', () => {
  it('b2c gets only the single default Montavimas phase', () => {
    const rows = buildDefaultWorkPhaseRows('site-1', 'b2c');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: 'montavimas', label: 'Montavimas' });
  });
  it('service gets only the single default Servisas phase', () => {
    const rows = buildDefaultWorkPhaseRows('site-1', 'service');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: 'servisas', label: 'Servisas' });
  });
});

describe('mobile phase selector model', () => {
  it('shows only the site\'s ACTIVE phases (selected works)', () => {
    const phases = [
      phase({ id: 'a', label: 'DC montavimas', b2b_work_category_id: 'cat-dc' }),
      phase({ id: 'b', label: 'Išjungtas', is_active: false }),
    ];
    expect(getStartableWorkPhases(phases).map((p) => p.id)).toEqual(['a']);
  });
});
