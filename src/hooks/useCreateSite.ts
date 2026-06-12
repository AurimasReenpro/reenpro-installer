import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { DRAFT_CLIENT_NAME } from '../lib/siteDraft';

/**
 * "Blank slate" site creation: inserts a minimal UNASSIGNED skeleton row and
 * navigates straight to its detail page, where the admin fills in the rest.
 * Drafts are intentionally never auto-assigned to a team/day — they must be
 * completed first (see isSiteDraft + the Schedule drag guard). Replaces the old
 * CreateSiteModal.
 */
export function useCreateBlankSite() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);

  const createBlankSite = async () => {
    if (isCreating) return;
    setIsCreating(true);

    // Short, collision-resistant placeholder code (NOT NULL on sites).
    const code = `N-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 4)}`.toUpperCase();

    const { data, error } = await supabase
      .from('sites')
      .insert({
        code,
        client_name: DRAFT_CLIENT_NAME, // placeholder — edited on the detail page
        address: '',                    // NOT NULL → empty string is valid
        system_type: 'PV',              // NOT NULL → sensible default
        status: 'pending',
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('Create blank site error:', error?.message, error?.details, error?.hint, error?.code);
      toast.error('Nepavyko sukurti objekto');
      setIsCreating(false);
      return;
    }

    void qc.invalidateQueries({ queryKey: ['admin_all_sites'] });
    void qc.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
    void qc.invalidateQueries({ queryKey: ['schedule_sites'] });

    void navigate(`/admin/sites/${data.id}`);
    setIsCreating(false);
  };

  return { createBlankSite, isCreating };
}
