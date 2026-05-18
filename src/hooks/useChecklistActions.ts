import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import * as Sentry from '@sentry/react';

export function useChecklistActions(siteId: string) {
  const queryClient = useQueryClient();

  const handleToggleChecklist = async (checkId: string, currentStatus: boolean) => {
    try {
      await supabase
        .from('site_checklists')
        .update({ is_completed: !currentStatus })
        .eq('id', checkId);
      
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
    } catch (error) {
      console.error('Error updating checklist:', error);
      Sentry.captureException(error, { extra: { context: 'Error updating checklist:' } });
      alert('Nepavyko atnaujinti užduoties statuso.');
    }
  };

  return {
    handleToggleChecklist
  };
}
