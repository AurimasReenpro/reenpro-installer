import { describe, expect, it } from 'vitest';
import {
  canCompleteChecklistItemWithPhotos,
  buildChecklistWorkCardSummaries,
  groupChecklistItemsByWorkPhase,
  normalizePhotoRequirement,
  photosForChecklistItem,
  requiredPhotoCount,
} from './checklistTemplatePhases';
import type { SiteChecklist, SitePhoto } from '../types/site.types';
import type { WorkPhase } from './workPhases';

function item(p: Partial<SiteChecklist> & { id: string }): SiteChecklist {
  return {
    id: p.id,
    question_text: p.question_text ?? 'Punktas',
    status: p.status ?? 'pending',
    is_required: p.is_required ?? true,
    requires_photo: p.requires_photo ?? false,
    min_photo_count: p.min_photo_count ?? 0,
    work_phase_id: p.work_phase_id ?? null,
    photo_url: p.photo_url ?? null,
  } as unknown as SiteChecklist;
}

function photo(p: Partial<SitePhoto> & { id: string; storage_path: string }): SitePhoto {
  return p as unknown as SitePhoto;
}

function phase(id: string, label: string, sort_order: number): WorkPhase {
  return {
    id,
    site_id: 'site-1',
    code: id,
    label,
    sort_order,
    is_active: true,
    created_at: '2026-06-01T00:00:00.000Z',
  };
}

describe('checklist template phase helpers', () => {
  it('normalizes photo requirements to at least one required photo', () => {
    expect(normalizePhotoRequirement(true, 0)).toEqual({ requiresPhoto: true, minPhotoCount: 1 });
    expect(normalizePhotoRequirement(false, 3)).toEqual({ requiresPhoto: false, minPhotoCount: 0 });
  });

  it('blocks completion until a photo-required item has enough photos', () => {
    const checklistItem = item({ id: 'item-1', status: 'pass', requires_photo: true, min_photo_count: 2 });
    const photos = [photo({ id: 'p1', storage_path: 'site/item-1/a.jpg', site_checklist_item_id: 'item-1' })];

    expect(canCompleteChecklistItemWithPhotos(checklistItem, photos)).toBe(false);
    expect(canCompleteChecklistItemWithPhotos(checklistItem, photos, 1)).toBe(true);
  });

  it('matches photos by the new checklist item link and the legacy storage path', () => {
    const photos = [
      photo({ id: 'linked', storage_path: 'site/gallery/a.jpg', site_checklist_item_id: 'item-1' }),
      photo({ id: 'legacy', storage_path: 'site/item-1/b.jpg' }),
      photo({ id: 'other', storage_path: 'site/other/c.jpg' }),
    ];

    expect(photosForChecklistItem('item-1', photos).map((p) => p.id)).toEqual(['linked', 'legacy']);
  });

  it('falls back to legacy is_required when explicit requires_photo is absent in cached data', () => {
    const cachedLegacyItem = { is_required: true, requires_photo: undefined, min_photo_count: undefined } as unknown as SiteChecklist;

    expect(requiredPhotoCount(cachedLegacyItem)).toBe(1);
  });

  it('groups B2B checklist items by work phase and puts the active phase first', () => {
    const grouped = groupChecklistItemsByWorkPhase(
      [
        item({ id: 'a', work_phase_id: 'dc' }),
        item({ id: 'b', work_phase_id: 'moduliai' }),
        item({ id: 'c', work_phase_id: null }),
      ],
      [phase('dc', 'DC montavimas', 10), phase('moduliai', 'Modulių montavimas', 20)],
      'moduliai',
    );

    expect(grouped.map((group) => group.label)).toEqual([
      'Modulių montavimas',
      'DC montavimas',
      'Papildomi darbai',
    ]);
  });

  it('builds B2B work cards with progress, hours, open entries, and missing photo counts', () => {
    const cards = buildChecklistWorkCardSummaries(
      [
        item({ id: 'a', status: 'pass', work_phase_id: 'dc', requires_photo: true, min_photo_count: 1 }),
        item({ id: 'b', status: 'pending', work_phase_id: 'dc', requires_photo: true, min_photo_count: 1 }),
        item({ id: 'c', status: 'n_a', work_phase_id: 'moduliai', requires_photo: true, min_photo_count: 1 }),
      ],
      [phase('dc', 'DC montavimas', 10), phase('moduliai', 'Modulių montavimas', 20)],
      [photo({ id: 'p1', storage_path: 'site/a/a.jpg', site_checklist_item_id: 'a' })],
      [
        {
          phaseId: 'dc',
          code: 'dc',
          label: 'DC montavimas',
          sortOrder: 10,
          isActive: true,
          totalHours: 2.5,
          entryCount: 2,
          openEntryCount: 1,
        },
      ],
    );

    expect(cards.find((card) => card.phaseId === 'dc')).toMatchObject({
      completedCount: 1,
      totalCount: 2,
      missingPhotoCount: 1,
      totalHours: 2.5,
      openEntryCount: 1,
    });
    expect(cards.find((card) => card.phaseId === 'moduliai')).toMatchObject({
      completedCount: 0,
      totalCount: 1,
      missingPhotoCount: 0,
    });
  });

  it('keeps an empty B2B phase visible for read-focused work cards', () => {
    const cards = buildChecklistWorkCardSummaries(
      [],
      [phase('dc', 'DC montavimas', 10)],
      [],
      [],
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      phaseId: 'dc',
      label: 'DC montavimas',
      totalCount: 0,
    });
  });
});
