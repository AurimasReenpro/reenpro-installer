import { onlineManager, type QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import { supabase } from './supabase';
import { useSyncStore } from '../stores/useSyncStore';
import type { SiteDetailData } from '../types/site.types';
import {
  listQueuedPhotos,
  removeQueuedPhoto,
  refreshPendingPhotoCount,
  type QueuedPhoto,
} from './photoOutbox';

type SitePhoto = SiteDetailData['photos'][number];

const GALLERY_ID = 'gallery';

let processing = false;

function toMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    const raw = e.message ?? e.error;
    if (typeof raw === 'string') return raw;
  }
  return String(err);
}

/** Storage upload → photos row → (optional) checklist item flag. Returns the
 * inserted photos row so the caller can patch the cache (no full refetch). */
async function uploadQueued(p: QueuedPhoto): Promise<SitePhoto> {
  const ext = p.fileName.split('.').pop() ?? 'jpg';
  const path = `${p.siteId}/${p.itemId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: storageErr } = await supabase.storage.from('site-photos').upload(path, p.blob);
  if (storageErr) throw new Error(`storage: ${storageErr.message}`);

  const { data: row, error: dbErr } = await supabase.from('photos').insert({
    site_id: p.siteId,
    checklist_id: null,
    installer_id: p.installerId,
    storage_path: path,
    section_name: p.sectionName,
    site_checklist_item_id: p.itemId === GALLERY_ID ? null : p.itemId,
  }).select('*').single();
  if (dbErr || !row) {
    // Roll back the orphaned object so storage stays clean, then retry later.
    void supabase.storage.from('site-photos').remove([path]);
    throw new Error(`db: ${dbErr?.message ?? 'insert returned no row'}`);
  }

  if (p.itemId !== GALLERY_ID) {
    // Best-effort: mirror the legacy single column + mark the item done.
    await supabase
      .from('site_checklist_items')
      .update({ photo_url: path, status: 'pass' })
      .eq('id', p.itemId);
  }

  return row;
}

/** Patch a freshly-uploaded photo into the cached site graph (no refetch). */
function patchUploadedIntoCache(qc: QueryClient, p: QueuedPhoto, row: SitePhoto) {
  qc.setQueryData<SiteDetailData>(['site', p.siteId], (old) => {
    if (!old) return old;
    return {
      ...old,
      photos: [...old.photos, row],
      site_checklists: p.itemId === GALLERY_ID
        ? old.site_checklists
        : old.site_checklists.map((cl) => ({
            ...cl,
            site_checklist_items: cl.site_checklist_items.map((it) =>
              it.id === p.itemId ? { ...it, photo_url: row.storage_path, status: 'pass' as const } : it,
            ),
          })),
    };
  });
}

/**
 * Drain the photo outbox sequentially. Safe to call repeatedly (re-entrancy
 * guard). Stops early if connectivity drops mid-flush; the rest stays queued
 * for the next attempt. Failed items are left in the queue (not dropped).
 */
export async function processPhotoOutbox(qc: QueryClient): Promise<void> {
  if (processing || !onlineManager.isOnline()) return;
  const queue = await listQueuedPhotos();
  if (queue.length === 0) return;

  processing = true;
  const { startSync, finishSync } = useSyncStore.getState();
  startSync();
  const touchedSites = new Set<string>();
  try {
    for (const p of queue) {
      if (!onlineManager.isOnline()) break;
      try {
        const row = await uploadQueued(p);
        await removeQueuedPhoto(p.id);
        // Patch the cache directly instead of invalidating ['site'] (no flicker).
        patchUploadedIntoCache(qc, p, row);
        touchedSites.add(p.siteId);
      } catch (err) {
        // Leave it in the queue for the next reconnect; log and move on.
        console.warn('[PhotoOutbox] upload failed, will retry:', toMsg(err));
        Sentry.captureException(err instanceof Error ? err : new Error(toMsg(err)), {
          extra: { context: 'photoOutbox flush', photoId: p.id, siteId: p.siteId },
        });
      }
      // Yield so the browser can paint between large uploads.
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    // Only the lightweight outbox lists need refreshing (the site cache was
    // patched in place above).
    for (const siteId of touchedSites) {
      void qc.invalidateQueries({ queryKey: ['photo-outbox', siteId] });
    }
    await refreshPendingPhotoCount();
    finishSync();
    processing = false;
  }
}

/** Wire the processor to connectivity changes + run once at startup. */
export function initPhotoProcessor(qc: QueryClient): void {
  onlineManager.subscribe((online) => {
    if (online) void processPhotoOutbox(qc);
  });
  // Sync the pending count + flush anything left from a previous session.
  void refreshPendingPhotoCount();
  void processPhotoOutbox(qc);
}
