import { useMutation } from '@tanstack/react-query';
import {
  MUTATION_KEYS,
  type ChecklistItemStatus,
  type StatusVars,
  type CommentVars,
} from '../lib/offlineMutations';

// Re-export so existing imports (`from '../hooks/useChecklistActions'`) keep working.
export type { ChecklistItemStatus };

/**
 * Checklist actions backed by the offline mutation outbox. Both status and
 * comment writes fire keyed mutations whose fn + optimistic onMutate live in
 * lib/offlineMutations. Offline, onMutate patches the cache instantly (so the
 * chip flips / comment shows) and the write is queued + persisted to IndexedDB,
 * then replayed automatically on reconnect.
 */
export function useChecklistActions(siteId: string) {
  const statusMutation = useMutation<void, Error, StatusVars>({ mutationKey: MUTATION_KEYS.checklistStatus });
  const commentMutation = useMutation<void, Error, CommentVars>({ mutationKey: MUTATION_KEYS.checklistComment });

  /** Update a checklist item's status (optimistic, offline-safe). */
  const handleSetStatus = (itemId: string, newStatus: ChecklistItemStatus): void => {
    statusMutation.mutate({ siteId, itemId, status: newStatus });
  };

  /**
   * Persist a free-text comment (optimistic, offline-safe). Resolves immediately
   * so the UI never hangs offline — the actual write is queued when needed.
   */
  const handleSaveComment = (itemId: string, comment: string): Promise<void> => {
    commentMutation.mutate({ siteId, itemId, comment });
    return Promise.resolve();
  };

  return { handleSetStatus, handleSaveComment };
}
