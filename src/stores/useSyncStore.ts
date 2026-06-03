import { create } from 'zustand';

interface SyncState {
  activeUploads: number;
  isSyncing: boolean;
  /** Number of photos still sitting in the durable IndexedDB outbox. */
  pendingPhotos: number;
  startSync: () => void;
  finishSync: () => void;
  setPendingPhotos: (n: number) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  activeUploads: 0,
  isSyncing: false,
  pendingPhotos: 0,
  startSync: () => set((state) => {
    const newCount = state.activeUploads + 1;
    return { activeUploads: newCount, isSyncing: newCount > 0 };
  }),
  finishSync: () => set((state) => {
    const newCount = Math.max(0, state.activeUploads - 1);
    return { activeUploads: newCount, isSyncing: newCount > 0 };
  }),
  setPendingPhotos: (n) => set({ pendingPhotos: Math.max(0, n) }),
}));
