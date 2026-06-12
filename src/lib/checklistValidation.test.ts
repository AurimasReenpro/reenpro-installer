import { describe, it, expect } from 'vitest';
import { validateJobCompletion } from './checklistValidation';
import type { SiteChecklist, SitePhoto } from '../types/site.types';

// Minimal fixtures — the validator only reads id, status, is_required,
// question_text, photo_url (items) and storage_path (photos).
function item(p: Partial<SiteChecklist> & { id: string }): SiteChecklist {
  return {
    id: p.id,
    question_text: p.question_text ?? 'Klausimas',
    status: p.status ?? 'pending',
    is_required: p.is_required ?? false,
    photo_url: p.photo_url ?? null,
  } as unknown as SiteChecklist;
}
// A photo whose storage path embeds the item id (the shape the app uploads).
function photoFor(itemId: string): SitePhoto {
  return { storage_path: `site-1/${itemId}/1700000000.jpg` } as unknown as SitePhoto;
}

describe('validateJobCompletion', () => {
  it('is valid when every item is pass/n_a and required items have a photo', () => {
    const items = [
      item({ id: 'a', status: 'pass', is_required: true }),
      item({ id: 'b', status: 'n_a', is_required: true }),   // n_a → photo exempt
      item({ id: 'c', status: 'pass', is_required: false }),  // not required
    ];
    const r = validateJobCompletion(items, [photoFor('a')]);
    expect(r.valid).toBe(true);
    expect(r.messages).toEqual([]);
  });

  it('blocks on pending items', () => {
    const r = validateJobCompletion([item({ id: 'a', status: 'pending' })], []);
    expect(r.valid).toBe(false);
    expect(r.pendingItems.map((i) => i.id)).toEqual(['a']);
  });

  it('blocks on failed items', () => {
    const r = validateJobCompletion([item({ id: 'a', status: 'fail' })], []);
    expect(r.valid).toBe(false);
    expect(r.failedItems.map((i) => i.id)).toEqual(['a']);
  });

  it('blocks a required item with no photo evidence', () => {
    const r = validateJobCompletion([item({ id: 'a', status: 'pass', is_required: true })], []);
    expect(r.valid).toBe(false);
    expect(r.missingPhotoItems.map((i) => i.id)).toEqual(['a']);
  });

  it('accepts a required item whose photo lives in storage (path contains /<id>/)', () => {
    const r = validateJobCompletion([item({ id: 'a', status: 'pass', is_required: true })], [photoFor('a')]);
    expect(r.valid).toBe(true);
  });

  it('accepts a required item with only the legacy photo_url mirror', () => {
    const r = validateJobCompletion(
      [item({ id: 'a', status: 'pass', is_required: true, photo_url: 'https://x/p.jpg' })],
      [],
    );
    expect(r.valid).toBe(true);
  });

  it('exempts n_a items from the photo requirement even when required', () => {
    const r = validateJobCompletion([item({ id: 'a', status: 'n_a', is_required: true })], []);
    expect(r.valid).toBe(true);
    expect(r.missingPhotoItems).toEqual([]);
  });

  it('does not require photos for non-required items', () => {
    const r = validateJobCompletion([item({ id: 'a', status: 'pass', is_required: false })], []);
    expect(r.valid).toBe(true);
  });

  it("doesn't match a photo from a different item's folder", () => {
    const r = validateJobCompletion(
      [item({ id: 'a', status: 'pass', is_required: true })],
      [photoFor('other-item')],
    );
    expect(r.valid).toBe(false);
    expect(r.missingPhotoItems.map((i) => i.id)).toEqual(['a']);
  });

  it('reports all blocking reasons together', () => {
    const items = [
      item({ id: 'p', status: 'pending' }),
      item({ id: 'f', status: 'fail' }),
      item({ id: 'm', status: 'pass', is_required: true, question_text: 'Įžeminimo nuotrauka' }),
    ];
    const r = validateJobCompletion(items, []);
    expect(r.valid).toBe(false);
    expect(r.messages).toHaveLength(3);
    expect(r.messages.some((m) => m.includes('Įžeminimo nuotrauka'))).toBe(true);
  });
});
