import { QueryClient } from "@tanstack/react-query";
import { registerOfflineMutationDefaults } from "./offlineMutations";
import { initPhotoProcessor } from "./photoProcessor";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Keep cached queries in memory for a full day so they're still present to
      // be dehydrated into IndexedDB (a query GC'd before persist wouldn't be
      // saved). The on-disk snapshot's own freshness is bounded by `maxAge` in
      // the PersistQueryClientProvider.
      gcTime: 24 * 60 * 60_000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: "offlineFirst",
    },
    mutations: {
      retry: 1,
      // 'online' pauses mutations while offline (instead of failing them). The
      // optimistic onMutate still runs immediately, so the UI feels instant; the
      // write is queued + persisted and replayed when connectivity returns.
      networkMode: "online",
    },
  },
});

// Register the offline-capable mutation defaults (fn + optimistic updates) so
// queued/persisted mutations can be replayed by resumePausedMutations().
registerOfflineMutationDefaults(queryClient);

// Start the durable photo-upload processor: flushes the IndexedDB photo outbox
// whenever connectivity is (re)gained.
initPhotoProcessor(queryClient);
