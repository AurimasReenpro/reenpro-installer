import { create } from 'zustand';

interface SyncState {
  activeUploads: number;
  isSyncing: boolean;
  startSync: () => void;
  finishSync: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  activeUploads: 0,
  isSyncing: false,
  startSync: () => set((state) => {
    const newCount = state.activeUploads + 1;
    return { activeUploads: newCount, isSyncing: newCount > 0 };
  }),
  finishSync: () => set((state) => {
    const newCount = Math.max(0, state.activeUploads - 1);
    return { activeUploads: newCount, isSyncing: newCount > 0 };
  }),
}));
