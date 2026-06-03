import { get, set, del } from 'idb-keyval';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

/**
 * IndexedDB-backed persister for the React Query cache. IndexedDB (via
 * idb-keyval) is used instead of localStorage because the cached site graph
 * (checklists, photos metadata, materials) can exceed localStorage's ~5 MB cap,
 * and IndexedDB writes are async so they don't block the main thread.
 *
 * This lets a field worker reopen the app underground and still SEE their
 * previously-loaded assigned sites + checklist items, and keeps any queued
 * offline mutations durable across reloads.
 */
export function createIDBPersister(idbKey = 'reenpro-rq-cache-v1'): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(idbKey, client);
    },
    restoreClient: async () => {
      return await get<PersistedClient>(idbKey);
    },
    removeClient: async () => {
      await del(idbKey);
    },
  };
}
