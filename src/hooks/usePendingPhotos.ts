import { useQuery } from '@tanstack/react-query';
import { listQueuedForSite, type QueuedPhoto } from '../lib/photoOutbox';

export type { QueuedPhoto };

/**
 * Photos for a site still sitting in the durable IndexedDB outbox (queued while
 * offline / after a failed upload). Invalidated by the upload + flush paths.
 */
export function usePendingPhotos(siteId: string) {
  return useQuery<QueuedPhoto[]>({
    queryKey: ['photo-outbox', siteId],
    queryFn: () => listQueuedForSite(siteId),
    enabled: !!siteId,
    staleTime: 10_000,
  });
}
