import type { QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { toast } from 'sonner';
import * as Sentry from '@sentry/react';
import type { SiteDetailData, SiteExtraMaterial } from '../types/site.types';

export type ChecklistItemStatus = 'pending' | 'pass' | 'fail' | 'n_a';

// Stable mutation keys. Components fire mutations by key (useMutation({ mutationKey }))
// and the actual mutationFn + optimistic onMutate live in the defaults registered
// below. This indirection is what lets a mutation that was queued OFFLINE and
// persisted to IndexedDB be replayed after a reload — the persisted record only
// stores the key + variables, and resumePausedMutations() looks up the fn here.
export const MUTATION_KEYS = {
  checklistStatus: ['offline', 'checklist-status'] as const,
  checklistComment: ['offline', 'checklist-comment'] as const,
  materialAdd: ['offline', 'material-add'] as const,
  materialDelete: ['offline', 'material-delete'] as const,
};

// ── Variable shapes (must be JSON-serialisable so they survive persistence) ──
export interface StatusVars { siteId: string; itemId: string; status: ChecklistItemStatus }
export interface CommentVars { siteId: string; itemId: string; comment: string }
export interface MaterialAddVars {
  siteId: string; tempId: string; name: string; quantity: number; unit: string; createdBy: string | null;
}
export interface MaterialDeleteVars { siteId: string; id: string }

interface SnapCtx { previous?: SiteDetailData }

const siteKey = (siteId: string) => ['site', siteId] as const;

function patchSite(qc: QueryClient, siteId: string, fn: (d: SiteDetailData) => SiteDetailData) {
  qc.setQueryData<SiteDetailData>(siteKey(siteId), (old) => (old ? fn(old) : old));
}

async function snapshot(qc: QueryClient, siteId: string): Promise<SnapCtx> {
  await qc.cancelQueries({ queryKey: siteKey(siteId) });
  return { previous: qc.getQueryData<SiteDetailData>(siteKey(siteId)) };
}

function rollback(qc: QueryClient, siteId: string, ctx: unknown) {
  const c = ctx as SnapCtx | undefined;
  if (c?.previous) qc.setQueryData(siteKey(siteId), c.previous);
}

/**
 * Registers the offline-capable mutation defaults on the shared QueryClient.
 * Called once at startup (before resumePausedMutations) so queued writes can
 * replay. Variables are typed as `unknown` in the callbacks (the loose
 * setMutationDefaults signature) and narrowed via the known shapes above.
 */
export function registerOfflineMutationDefaults(qc: QueryClient) {
  // ── Checklist status (optimistic) ──
  qc.setMutationDefaults(MUTATION_KEYS.checklistStatus, {
    mutationFn: async (vars) => {
      const v = vars as unknown as StatusVars;
      const { error } = await supabase
        .from('site_checklist_items')
        .update({ status: v.status })
        .eq('id', v.itemId);
      if (error) throw error;
    },
    onMutate: async (vars) => {
      const v = vars as unknown as StatusVars;
      const ctx = await snapshot(qc, v.siteId);
      patchSite(qc, v.siteId, (d) => ({
        ...d,
        site_checklists: d.site_checklists.map((cl) => ({
          ...cl,
          site_checklist_items: cl.site_checklist_items.map((it) =>
            it.id === v.itemId ? { ...it, status: v.status } : it,
          ),
        })),
      }));
      return ctx;
    },
    onError: (err, vars, ctx) => {
      const v = vars as unknown as StatusVars;
      rollback(qc, v.siteId, ctx);
      Sentry.captureException(err, { extra: { context: 'offline:checklistStatus', ...v } });
      toast.error('Nepavyko atnaujinti užduoties statuso.');
    },
    onSettled: (_d, _e, vars) => {
      const v = vars as unknown as StatusVars;
      void qc.invalidateQueries({ queryKey: siteKey(v.siteId) });
    },
  });

  // ── Checklist comment (optimistic) ──
  qc.setMutationDefaults(MUTATION_KEYS.checklistComment, {
    mutationFn: async (vars) => {
      const v = vars as unknown as CommentVars;
      const { error } = await supabase
        .from('site_checklist_items')
        .update({ comment: v.comment.trim() || null })
        .eq('id', v.itemId);
      if (error) throw error;
    },
    onMutate: async (vars) => {
      const v = vars as unknown as CommentVars;
      const ctx = await snapshot(qc, v.siteId);
      const next = v.comment.trim() || null;
      patchSite(qc, v.siteId, (d) => ({
        ...d,
        site_checklists: d.site_checklists.map((cl) => ({
          ...cl,
          site_checklist_items: cl.site_checklist_items.map((it) =>
            it.id === v.itemId ? { ...it, comment: next } : it,
          ),
        })),
      }));
      return ctx;
    },
    onError: (err, vars, ctx) => {
      const v = vars as unknown as CommentVars;
      rollback(qc, v.siteId, ctx);
      Sentry.captureException(err, { extra: { context: 'offline:checklistComment' } });
      toast.error('Nepavyko išsaugoti pastabos.');
    },
    onSettled: (_d, _e, vars) => {
      const v = vars as unknown as CommentVars;
      void qc.invalidateQueries({ queryKey: siteKey(v.siteId) });
    },
  });

  // ── Extra material: add (optimistic) ──
  qc.setMutationDefaults(MUTATION_KEYS.materialAdd, {
    mutationFn: async (vars) => {
      const v = vars as unknown as MaterialAddVars;
      const { error } = await supabase.from('site_extra_materials').insert({
        site_id: v.siteId,
        name: v.name,
        quantity: v.quantity,
        unit: v.unit,
        created_by: v.createdBy,
      });
      if (error) throw error;
    },
    onMutate: async (vars) => {
      const v = vars as unknown as MaterialAddVars;
      const ctx = await snapshot(qc, v.siteId);
      const optimistic: SiteExtraMaterial = {
        id: v.tempId,
        site_id: v.siteId,
        checklist_item_id: null,
        name: v.name,
        quantity: v.quantity,
        unit: v.unit,
        created_by: v.createdBy,
        created_at: new Date().toISOString(),
      };
      patchSite(qc, v.siteId, (d) => ({
        ...d,
        site_extra_materials: [...(d.site_extra_materials ?? []), optimistic],
      }));
      return ctx;
    },
    onError: (err, vars, ctx) => {
      const v = vars as unknown as MaterialAddVars;
      rollback(qc, v.siteId, ctx);
      Sentry.captureException(err, { extra: { context: 'offline:materialAdd' } });
      toast.error('Nepavyko pridėti medžiagos.');
    },
    onSettled: (_d, _e, vars) => {
      const v = vars as unknown as MaterialAddVars;
      void qc.invalidateQueries({ queryKey: siteKey(v.siteId) });
    },
  });

  // ── Extra material: delete (optimistic) ──
  qc.setMutationDefaults(MUTATION_KEYS.materialDelete, {
    mutationFn: async (vars) => {
      const v = vars as unknown as MaterialDeleteVars;
      const { error } = await supabase.from('site_extra_materials').delete().eq('id', v.id);
      if (error) throw error;
    },
    onMutate: async (vars) => {
      const v = vars as unknown as MaterialDeleteVars;
      const ctx = await snapshot(qc, v.siteId);
      patchSite(qc, v.siteId, (d) => ({
        ...d,
        site_extra_materials: (d.site_extra_materials ?? []).filter((m) => m.id !== v.id),
      }));
      return ctx;
    },
    onError: (_err, vars, ctx) => {
      const v = vars as unknown as MaterialDeleteVars;
      rollback(qc, v.siteId, ctx);
      toast.error('Nepavyko ištrinti medžiagos.');
    },
    onSettled: (_d, _e, vars) => {
      const v = vars as unknown as MaterialDeleteVars;
      void qc.invalidateQueries({ queryKey: siteKey(v.siteId) });
    },
  });
}
