import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GripVertical, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import {
  deleteSiteWorkPhase,
  ensureDefaultSiteWorkPhases,
  getSitePhaseTimeSummary,
  getSiteWorkPhases,
  updateSiteWorkPhase,
} from '../../../api/workPhases';
import { getActiveB2BWorkCategories } from '../../../api/b2bWorkCategories';
import { applyB2BWorkSelectionToSite } from '../../../api/b2bSiteSetup';
import { findExistingPhaseForCategory } from '../../../lib/siteCreationB2B';
import { canHardDeletePhase } from '../../../lib/workPhases';
import type { SiteType } from '../../../lib/siteTypes';

export default function WorkPhasesCard({ siteId, siteType }: { siteId: string; siteType: SiteType }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Record<string, { label: string; sort_order: string; is_active: boolean }>>({});
  const [addCategoryId, setAddCategoryId] = useState('');

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ['site_phase_time_summary', siteId],
    queryFn: () => getSitePhaseTimeSummary(siteId),
  });

  // B2B: offer adding catalog works that are not yet materialized on this site.
  const { data: sitePhases = [] } = useQuery({
    queryKey: ['site_work_phases', siteId, 'all'],
    queryFn: () => getSiteWorkPhases(siteId),
    enabled: siteType === 'b2b',
  });
  const { data: b2bCategories = [] } = useQuery({
    queryKey: ['b2b_work_categories', 'active'],
    queryFn: getActiveB2BWorkCategories,
    enabled: siteType === 'b2b',
  });
  const addableCategories = siteType === 'b2b'
    ? b2bCategories.filter((category) => !findExistingPhaseForCategory(category, sitePhases))
    : [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['site_phase_time_summary', siteId] });
    void queryClient.invalidateQueries({ queryKey: ['site_work_phases', siteId] });
    void queryClient.invalidateQueries({ queryKey: ['site_checklist_session', siteId] });
  };

  const addCategory = useMutation({
    mutationFn: (categoryId: string) => applyB2BWorkSelectionToSite(siteId, [categoryId]),
    onSuccess: (result) => {
      toast.success('B2B darbas pridėtas prie objekto.');
      if (result.unassignedTaskCount > 0) {
        toast.warning('Yra nepriskirtų B2B šablono užduočių — jos nebus automatiškai pritaikytos.');
      }
      setAddCategoryId('');
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Nepavyko pridėti B2B darbo.'),
  });

  const ensureDefaults = useMutation({
    mutationFn: () => ensureDefaultSiteWorkPhases(siteId, siteType),
    onSuccess: () => {
      toast.success('Numatyti darbų etapai sukurti.');
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Nepavyko sukurti etapų.'),
  });

  const save = useMutation({
    mutationFn: (phaseId: string) => {
      const draft = editing[phaseId];
      if (!draft) return Promise.resolve();
      return updateSiteWorkPhase(phaseId, {
        label: draft.label.trim(),
        sort_order: Number(draft.sort_order) || 0,
        is_active: draft.is_active,
      });
    },
    onSuccess: () => {
      toast.success('Etapas išsaugotas.');
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Nepavyko išsaugoti etapo.'),
  });

  const remove = useMutation({
    mutationFn: deleteSiteWorkPhase,
    onSuccess: () => {
      toast.success('Etapas ištrintas.');
      invalidate();
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.message === 'PHASE_HAS_TIME_ENTRIES') {
        toast.error('Etapas turi laiko įrašų. Jį galima tik deaktyvuoti.');
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Nepavyko ištrinti etapo.');
    },
  });

  const getDraft = (phase: typeof summary[number]) => editing[phase.phaseId ?? ''] ?? {
    label: phase.label,
    sort_order: String(phase.sortOrder),
    is_active: phase.isActive,
  };

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-text text-[15px]">Darbų etapai</h3>
        {/* B2B phases come from SELECTED work categories (selector below), never
            the full default set — the defaults button stays b2c/service-only. */}
        {summary.length === 0 && siteType !== 'b2b' && (
          <button
            onClick={() => ensureDefaults.mutate()}
            disabled={ensureDefaults.isPending}
            className="flex items-center gap-1 text-[13px] text-primary font-medium hover:opacity-70 transition-opacity cursor-pointer disabled:opacity-60"
          >
            {ensureDefaults.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Sukurti numatytus
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="h-20 rounded-xl bg-surface-2 animate-pulse" />
      ) : summary.length === 0 ? (
        <p className="text-[13px] text-subtle">Šiam B2B objektui darbų etapai dar nesukurti.</p>
      ) : (
        <div className="space-y-2">
          {summary.map((phase) => {
            const phaseId = phase.phaseId;
            const draft = getDraft(phase);
            const canDelete = canHardDeletePhase(phase.entryCount);
            return (
              <div key={phaseId ?? phase.label} className="rounded-xl border border-border bg-surface-2 p-3">
                <div className="flex items-start gap-2">
                  <GripVertical className="mt-2 h-4 w-4 shrink-0 text-subtle" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="grid grid-cols-[1fr_64px] gap-2">
                      <input
                        value={draft.label}
                        disabled={!phaseId || save.isPending}
                        onChange={(event) => phaseId && setEditing((prev) => ({
                          ...prev,
                          [phaseId]: { ...draft, label: event.target.value },
                        }))}
                        className="h-[36px] min-w-0 rounded-lg border border-border bg-surface px-2.5 text-[13px] font-semibold text-text focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                      />
                      <input
                        type="number"
                        value={draft.sort_order}
                        disabled={!phaseId || save.isPending}
                        onChange={(event) => phaseId && setEditing((prev) => ({
                          ...prev,
                          [phaseId]: { ...draft, sort_order: event.target.value },
                        }))}
                        className="h-[36px] rounded-lg border border-border bg-surface px-2 text-[13px] font-semibold text-text focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                        title="Eiliškumas"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[12px] text-subtle">
                      <span>{phase.totalHours} val. · {phase.entryCount} įrašai</span>
                      {phase.openEntryCount > 0 && (
                        <span className="rounded-full bg-warning-bg px-2 py-0.5 font-semibold text-warning">
                          {phase.openEntryCount} aktyvūs
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-[12px] font-medium text-muted">
                        <input
                          type="checkbox"
                          checked={draft.is_active}
                          disabled={!phaseId || save.isPending}
                          onChange={(event) => phaseId && setEditing((prev) => ({
                            ...prev,
                            [phaseId]: { ...draft, is_active: event.target.checked },
                          }))}
                          className="h-4 w-4 accent-primary"
                        />
                        Aktyvus
                      </label>
                      {phaseId && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => save.mutate(phaseId)}
                            disabled={save.isPending}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-primary hover:bg-surface-2 disabled:opacity-50"
                            title="Išsaugoti"
                          >
                            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={() => remove.mutate(phaseId)}
                            disabled={!canDelete || remove.isPending}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                            title={canDelete ? 'Ištrinti' : 'Etapas turi laiko įrašų'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {siteType === 'b2b' && addableCategories.length > 0 && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <select
            value={addCategoryId}
            onChange={(event) => setAddCategoryId(event.target.value)}
            disabled={addCategory.isPending}
            className="h-[36px] flex-1 min-w-0 rounded-lg border border-border bg-surface-2 px-2.5 text-[13px] text-text focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer disabled:opacity-60"
          >
            <option value="">Pridėti B2B darbą...</option>
            {addableCategories.map((category) => (
              <option key={category.id} value={category.id}>{category.label}</option>
            ))}
          </select>
          <button
            onClick={() => addCategoryId && addCategory.mutate(addCategoryId)}
            disabled={!addCategoryId || addCategory.isPending}
            className="flex h-[36px] items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {addCategory.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Pridėti
          </button>
        </div>
      )}
    </div>
  );
}
