import { createStore, set, get, del, entries, keys } from 'idb-keyval';
import { useSyncStore } from '../stores/useSyncStore';

// Dedicated IndexedDB store for queued photo blobs. Kept separate from the
// React Query cache store so large binary blobs never bloat the query snapshot.
const photoStore = createStore('reenpro-photo-outbox', 'photos');

export interface QueuedPhoto {
  /** Stable temp id (also the IndexedDB key). */
  id: string;
  siteId: string;
  /** Checklist item id, or 'gallery' for non-item uploads. */
  itemId: string;
  sectionName: string | null;
  installerId: string;
  fileName: string;
  /** Already-compressed image blob. */
  blob: Blob;
  createdAt: number;
}

export async function enqueuePhoto(p: QueuedPhoto): Promise<void> {
  await set(p.id, p, photoStore);
  await refreshPendingPhotoCount();
}

export async function removeQueuedPhoto(id: string): Promise<void> {
  await del(id, photoStore);
  await refreshPendingPhotoCount();
}

export async function getQueuedPhoto(id: string): Promise<QueuedPhoto | undefined> {
  return get<QueuedPhoto>(id, photoStore);
}

export async function listQueuedPhotos(): Promise<QueuedPhoto[]> {
  const all = await entries(photoStore);
  return all
    .map(([, v]) => v as QueuedPhoto)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function listQueuedForSite(siteId: string): Promise<QueuedPhoto[]> {
  return (await listQueuedPhotos()).filter((p) => p.siteId === siteId);
}

export async function queuedCount(): Promise<number> {
  return (await keys(photoStore)).length;
}

/** Mirror the queue length into the sync store (used to gate logout). */
export async function refreshPendingPhotoCount(): Promise<void> {
  const n = await queuedCount();
  useSyncStore.getState().setPendingPhotos(n);
}
