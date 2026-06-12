import { describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

// Stub the side-effecting imports — onMutate (the reducer-style patch we test)
// only touches the QueryClient cache, never these.
vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));

import { registerOfflineMutationDefaults, MUTATION_KEYS } from './offlineMutations';
import type { SiteDetailData } from '../types/site.types';

const SITE_ID = 'site-1';
const siteKey = ['site', SITE_ID];

function makeSite(): SiteDetailData {
  return {
    id: SITE_ID,
    site_checklists: [
      {
        id: 'cl-1',
        site_checklist_items: [
          { id: 'item-1', status: 'pending', comment: null },
          { id: 'item-2', status: 'pending', comment: null },
        ],
      },
    ],
    site_extra_materials: [],
  } as unknown as SiteDetailData;
}

function setup(seedSite = true) {
  const qc = new QueryClient();
  registerOfflineMutationDefaults(qc);
  if (seedSite) qc.setQueryData(siteKey, makeSite());
  return qc;
}

// Pull a registered optimistic callback off the mutation defaults and run it.
type Key = readonly unknown[];
function onMutate(qc: QueryClient, key: Key, vars: unknown) {
  const d = qc.getMutationDefaults(key as unknown[]);
  return (d?.onMutate as (v: unknown) => Promise<unknown>)(vars);
}
function onError(qc: QueryClient, key: Key, vars: unknown, ctx: unknown) {
  const d = qc.getMutationDefaults(key as unknown[]);
  (d?.onError as (e: unknown, v: unknown, c: unknown) => void)(new Error('boom'), vars, ctx);
}

const items = (qc: QueryClient) =>
  qc.getQueryData<SiteDetailData>(siteKey)!.site_checklists[0].site_checklist_items;
const materials = (qc: QueryClient) =>
  qc.getQueryData<SiteDetailData>(siteKey)!.site_extra_materials;

describe('offline optimistic patches', () => {
  it('checklistStatus patches only the targeted item', async () => {
    const qc = setup();
    await onMutate(qc, MUTATION_KEYS.checklistStatus, { siteId: SITE_ID, itemId: 'item-1', status: 'pass' });
    expect(items(qc)[0].status).toBe('pass');
    expect(items(qc)[1].status).toBe('pending'); // untouched
  });

  it('checklistComment trims, and stores null for an empty comment', async () => {
    const qc = setup();
    await onMutate(qc, MUTATION_KEYS.checklistComment, { siteId: SITE_ID, itemId: 'item-1', comment: '  hi  ' });
    expect(items(qc)[0].comment).toBe('hi');

    await onMutate(qc, MUTATION_KEYS.checklistComment, { siteId: SITE_ID, itemId: 'item-1', comment: '   ' });
    expect(items(qc)[0].comment).toBeNull();
  });

  it('materialAdd appends an optimistic row keyed by the temp id', async () => {
    const qc = setup();
    await onMutate(qc, MUTATION_KEYS.materialAdd, {
      siteId: SITE_ID, tempId: 'temp-1', name: 'Varžtai', quantity: 10, unit: 'vnt.', createdBy: 'u1',
    });
    expect(materials(qc)).toHaveLength(1);
    expect(materials(qc)[0]).toMatchObject({ id: 'temp-1', name: 'Varžtai', quantity: 10, unit: 'vnt.' });
  });

  it('materialDelete removes the row by id', async () => {
    const qc = setup();
    await onMutate(qc, MUTATION_KEYS.materialAdd, {
      siteId: SITE_ID, tempId: 'm-1', name: 'X', quantity: 1, unit: 'vnt.', createdBy: null,
    });
    expect(materials(qc)).toHaveLength(1);
    await onMutate(qc, MUTATION_KEYS.materialDelete, { siteId: SITE_ID, id: 'm-1' });
    expect(materials(qc)).toHaveLength(0);
  });

  it('onError rolls the cache back to the pre-mutation snapshot', async () => {
    const qc = setup();
    const before = qc.getQueryData<SiteDetailData>(siteKey);
    const vars = { siteId: SITE_ID, itemId: 'item-1', status: 'fail' };
    const ctx = await onMutate(qc, MUTATION_KEYS.checklistStatus, vars);
    expect(items(qc)[0].status).toBe('fail'); // optimistically applied
    onError(qc, MUTATION_KEYS.checklistStatus, vars, ctx);
    expect(qc.getQueryData<SiteDetailData>(siteKey)).toEqual(before); // restored
  });

  it('no-ops safely when the site is not in cache', async () => {
    const qc = setup(false); // nothing seeded
    const ctx = await onMutate(qc, MUTATION_KEYS.checklistStatus, { siteId: 'missing', itemId: 'x', status: 'pass' });
    expect(ctx).toEqual({ previous: undefined });
    expect(qc.getQueryData(['site', 'missing'])).toBeUndefined();
  });
});
