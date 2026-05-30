import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';
import type { SiteDetailData } from '../types/site.types';

export type ChecklistItemStatus = 'pending' | 'pass' | 'fail' | 'n_a';

export function useChecklistActions(siteId: string) {
  const queryClient = useQueryClient();
  const siteKey = ['site', siteId] as const;

  // ── Status: optimistic update ──────────────────────────────────────────────
  // The chip must flip instantly on a roof with edge network, so we patch the
  // cached site immediately, then reconcile with the server in the background.
  const statusMutation = useMutation({
    mutationFn: async ({ itemId, newStatus }: { itemId: string; newStatus: ChecklistItemStatus }) => {
      const { error } = await supabase
        .from('site_checklist_items')
        .update({ status: newStatus })
        .eq('id', itemId);
      if (error) throw error;
    },
    onMutate: async ({ itemId, newStatus }) => {
      // Cancel in-flight refetches so they don't clobber the optimistic value.
      await queryClient.cancelQueries({ queryKey: siteKey });
      const previous = queryClient.getQueryData<SiteDetailData>(siteKey);

      queryClient.setQueryData<SiteDetailData>(siteKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          site_checklists: old.site_checklists.map((cl) => ({
            ...cl,
            site_checklist_items: cl.site_checklist_items.map((it) =>
              it.id === itemId ? { ...it, status: newStatus } : it,
            ),
          })),
        };
      });

      return { previous };
    },
    onError: (err, variables, context) => {
      // Roll back to the pre-tap snapshot.
      if (context?.previous) queryClient.setQueryData(siteKey, context.previous);
      console.error('Error updating checklist status:', err);
      Sentry.captureException(err, { extra: { context: 'handleSetStatus', siteId, ...variables } });
      toast.error('Nepavyko atnaujinti užduoties statuso.');
    },
    onSettled: () => {
      // Re-sync with the server regardless of outcome.
      void queryClient.invalidateQueries({ queryKey: siteKey });
    },
  });

  /** Update a checklist item's status to any valid value (optimistic). */
  const handleSetStatus = (itemId: string, newStatus: ChecklistItemStatus): void => {
    statusMutation.mutate({ itemId, newStatus });
  };

  /**
   * Persist a free-text comment for a checklist item.
   * Trims whitespace; an empty string is stored as NULL in the DB so the
   * "has comment" indicator resets cleanly.
   */
  const handleSaveComment = async (itemId: string, comment: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('site_checklist_items')
        .update({ comment: comment.trim() || null })
        .eq('id', itemId);

      if (error) throw error;
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      toast.success('Pastaba išsaugota.');
    } catch (err) {
      console.error('Error saving comment:', err);
      Sentry.captureException(err, { extra: { context: 'handleSaveComment', siteId, itemId } });
      toast.error('Nepavyko išsaugoti pastabos.');
    }
  };

  return { handleSetStatus, handleSaveComment };
}
