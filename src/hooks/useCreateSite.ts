import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { DRAFT_CLIENT_NAME } from '../lib/siteDraft';
import { assignChecklistToSite } from '../api/sites';
import { ensureDefaultSiteWorkPhases } from '../api/workPhases';
import { applyB2BWorkSelectionToSite } from '../api/b2bSiteSetup';
import { hasB2BWorkSelection } from '../lib/siteCreationB2B';
import { DEFAULT_SITE_TYPE, type SiteType } from '../lib/siteTypes';

export interface CreateBlankSiteOptions {
  siteType?: SiteType;
  checklistCategory?: string | null;
  /** B2B only: selected b2b_work_categories ids — required for site_type='b2b'. */
  b2bCategoryIds?: string[];
}

export function buildBlankSiteInsert(code: string, siteType: SiteType = DEFAULT_SITE_TYPE) {
  return {
    code,
    client_name: DRAFT_CLIENT_NAME,
    address: '',
    system_type: 'PV',
    site_type: siteType,
    status: 'pending',
  };
}

/**
 * "Blank slate" site creation: inserts a minimal UNASSIGNED skeleton row and
 * navigates straight to its detail page, where the admin fills in the rest.
 * Drafts are intentionally never auto-assigned to a team/day. They must be
 * completed first (see isSiteDraft + the Schedule drag guard).
 */
export function useCreateBlankSite() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);

  const createBlankSite = async (options: CreateBlankSiteOptions = {}): Promise<string | null> => {
    if (isCreating) return null;

    const siteType = options.siteType ?? DEFAULT_SITE_TYPE;
    // B2B requires an explicit work selection BEFORE anything is created —
    // selected categories drive phases, checklist and time tracking.
    if (siteType === 'b2b' && !hasB2BWorkSelection(options.b2bCategoryIds)) {
      toast.error('Pasirinkite bent vieną B2B darbą.');
      return null;
    }

    setIsCreating(true);
    const code = `N-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 4)}`.toUpperCase();

    try {
      const { data, error } = await supabase
        .from('sites')
        .insert(buildBlankSiteInsert(code, siteType))
        .select('id')
        .single();

      if (error || !data) {
        console.error('Create blank site error:', error?.message, error?.details, error?.hint, error?.code);
        toast.error('Nepavyko sukurti objekto');
        return null;
      }

      if (siteType === 'b2b') {
        // Selected categories ONLY — no full default B2B phase set anymore.
        try {
          const result = await applyB2BWorkSelectionToSite(data.id, options.b2bCategoryIds ?? []);
          if (result.unassignedTaskCount > 0) {
            toast.warning('Yra nepriskirtų B2B šablono užduočių — jos nebus automatiškai pritaikytos.');
          }
          void qc.invalidateQueries({ queryKey: ['site_checklist_session', data.id] });
          void qc.invalidateQueries({ queryKey: ['site_work_phases', data.id] });
        } catch (err) {
          console.error('Apply B2B work selection error:', err);
          toast.error('Objektas sukurtas, bet B2B darbų pritaikyti nepavyko.');
        }
      } else {
        // B2C / service keep their simple single default phase.
        try {
          await ensureDefaultSiteWorkPhases(data.id, siteType);
        } catch (err) {
          console.error('Create default work phases error:', err);
          toast.error('Objektas sukurtas, bet darbų etapų sukurti nepavyko.');
        }

        if (options.checklistCategory) {
          try {
            await assignChecklistToSite(data.id, options.checklistCategory);
            void qc.invalidateQueries({ queryKey: ['site_checklist_session', data.id] });
          } catch (err) {
            console.error('Apply checklist template error:', err);
            toast.error('Objektas sukurtas, bet checklist šablono pritaikyti nepavyko.');
          }
        }
      }

      void qc.invalidateQueries({ queryKey: ['admin_all_sites'] });
      void qc.invalidateQueries({ queryKey: ['admin_sites_list'] });
      void qc.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
      void qc.invalidateQueries({ queryKey: ['schedule_sites'] });

      void navigate(`/admin/sites/${data.id}`);
      return data.id;
    } finally {
      setIsCreating(false);
    }
  };

  return { createBlankSite, isCreating };
}
