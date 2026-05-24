import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';

export type ChecklistItemStatus = 'pending' | 'pass' | 'fail' | 'n_a';

export function useChecklistActions(siteId: string) {
  const queryClient = useQueryClient();

  /** Update a checklist item's status to any valid value. */
  const handleSetStatus = async (itemId: string, newStatus: ChecklistItemStatus): Promise<void> => {
    try {
      const { error } = await supabase
        .from('site_checklist_items')
        .update({ status: newStatus })
        .eq('id', itemId);

      if (error) throw error;
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
    } catch (err) {
      console.error('Error updating checklist status:', err);
      Sentry.captureException(err, { extra: { context: 'handleSetStatus', siteId, itemId, newStatus } });
      toast.error('Nepavyko atnaujinti užduoties statuso.');
    }
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
