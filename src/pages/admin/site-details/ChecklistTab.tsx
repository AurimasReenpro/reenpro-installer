import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Loader2, Plus, ClipboardList, ListChecks, AlertTriangle, Package, X, Save, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import {
  getSiteChecklistSession,
  assignChecklistToSite,
  getSiteInstallerPhotos,
  getChecklistTemplateGroupsForSiteType,
} from '../../../api/sites';
import { normalizeSiteType, siteTypeLabel, type SiteType } from '../../../lib/siteTypes';
import {
  deleteSiteWorkPhase,
  getSitePhaseTimeSummary,
  getSiteWorkPhases,
  updateSiteWorkPhase,
} from '../../../api/workPhases';
import {
  buildChecklistWorkCardSummaries,
} from '../../../lib/checklistTemplatePhases';
import { canHardDeletePhase } from '../../../lib/workPhases';
import ChecklistItemRow from './ChecklistItemRow';
import type { ItemStatus } from './types';

type ChecklistRowItem = {
  id: string;
  question_text: string;
  category: string | null;
  phase: string | null;
  status: ItemStatus;
  photo_url: string | null;
  comment: string | null;
  is_required: boolean;
  is_extra?: boolean;
  requires_photo?: boolean | null;
  min_photo_count?: number | null;
  work_phase_id?: string | null;
};

export default function ChecklistTab({ siteId, siteType }: { siteId: string; siteType?: SiteType | null }) {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState('');
  const normalizedSiteType = normalizeSiteType(siteType);

  // ── Add custom item state ────────────────────────────────────────────────
  const [showAddItem,    setShowAddItem]    = useState(false);
  const [newItemText,    setNewItemText]    = useState('');
  const [newItemRequired, setNewItemRequired] = useState(true);
  const [phaseDrafts, setPhaseDrafts] = useState<Record<string, { label: string; sort_order: string; is_active: boolean }>>({});

  // Fetch checklist session
  const { data: session, isLoading } = useQuery({
    queryKey: ['site_checklist_session', siteId],
    queryFn: () => getSiteChecklistSession(siteId),
  });

  // Installer photos (durable `photos` table records, batch-signed). Matched to
  // each checklist item via the `/${itemId}/` segment in the storage path —
  // the same durable lookup the mobile WorkTab uses.
  const { data: installerPhotos } = useQuery({
    queryKey: ['admin_site_photos', siteId],
    queryFn: () => getSiteInstallerPhotos(siteId),
    enabled: !!siteId,
  });
  const photosForItem = (itemId: string) =>
    (installerPhotos ?? []).filter(p => p.site_checklist_item_id === itemId || p.storage_path.includes(`/${itemId}/`));

  // Installer-logged extra materials for this site. Shares the SAME query key +
  // select as the Equipment tab's billing query so React Query serves both tabs
  // from one cached fetch (no duplicate request).
  const { data: extraMaterials } = useQuery({
    queryKey: ['site_extra_materials_billing', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_extra_materials')
        .select('*, creator:user_profiles(full_name), checklist_item:site_checklist_items(question_text)')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
  });

  // Fetch matching checklist template groups for assignment dropdown.
  const { data: checklistGroups } = useQuery({
    queryKey: ['checklist_template_groups', normalizedSiteType],
    queryFn: () => getChecklistTemplateGroupsForSiteType(normalizedSiteType),
    enabled: !session,
  });

  const { data: workPhases = [] } = useQuery({
    queryKey: ['site_work_phases', siteId, 'checklist'],
    queryFn: () => getSiteWorkPhases(siteId),
    enabled: normalizedSiteType === 'b2b',
  });

  const { data: phaseTimeSummary = [] } = useQuery({
    queryKey: ['site_phase_time_summary', siteId],
    queryFn: () => getSitePhaseTimeSummary(siteId),
    enabled: normalizedSiteType === 'b2b',
  });

  const invalidatePhaseData = () => {
    void queryClient.invalidateQueries({ queryKey: ['site_work_phases', siteId, 'checklist'] });
    void queryClient.invalidateQueries({ queryKey: ['site_work_phases', siteId] });
    void queryClient.invalidateQueries({ queryKey: ['site_phase_time_summary', siteId] });
  };

  const savePhaseMutation = useMutation({
    mutationFn: (phaseId: string) => {
      const draft = phaseDrafts[phaseId];
      if (!draft) return Promise.resolve();
      return updateSiteWorkPhase(phaseId, {
        label: draft.label.trim(),
        sort_order: Number(draft.sort_order) || 0,
        is_active: draft.is_active,
      });
    },
    onSuccess: () => {
      toast.success('Darbas išsaugotas.');
      invalidatePhaseData();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Nepavyko išsaugoti darbo.'),
  });

  const deletePhaseMutation = useMutation({
    mutationFn: deleteSiteWorkPhase,
    onSuccess: () => {
      toast.success('Darbas ištrintas.');
      invalidatePhaseData();
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.message === 'PHASE_HAS_TIME_ENTRIES') {
        toast.error('Darbas turi laiko įrašų. Jį galima tik deaktyvuoti.');
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Nepavyko ištrinti darbo.');
    },
  });

  const assignMutation = useMutation({
    mutationFn: () => assignChecklistToSite(siteId, selectedCategory),
    onSuccess: () => {
      toast.success('Checklist priskirtas!');
      void queryClient.invalidateQueries({ queryKey: ['site_checklist_session', siteId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  // ── Add custom checklist item mutation ───────────────────────────────────
  const addItemMutation = useMutation({
    mutationFn: async () => {
      if (!session?.id) throw new Error('Aktyvi sesija nerasta.');
      if (!newItemText.trim()) throw new Error('Darbo aprašymas negali būti tuščias.');
      const { error } = await supabase
        .from('site_checklist_items')
        .insert({
          site_checklist_id: session.id,
          question_text:     newItemText.trim(),
          is_required:       newItemRequired,
          requires_photo:    newItemRequired,
          min_photo_count:   newItemRequired ? 1 : 0,
          status:            'pending',
          category:          'Papildomi darbai',
          phase:             null,
        });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Papildomas darbas pridėtas!');
      setShowAddItem(false);
      setNewItemText('');
      setNewItemRequired(true);
      // Refresh admin checklist view + mobile work tab
      void queryClient.invalidateQueries({ queryKey: ['site_checklist_session', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
      </div>
    );
  }

  // ── No session: show assignment UI ───────────────────────────────────────
  const items = session?.items ?? [];
  const b2bWorkCards = normalizedSiteType === 'b2b'
    ? buildChecklistWorkCardSummaries(items, workPhases, installerPhotos ?? [], phaseTimeSummary)
    : [];

  const getPhaseDraft = (card: (typeof b2bWorkCards)[number]) => {
    const phaseId = card.phaseId ?? '';
    return phaseDrafts[phaseId] ?? {
      label: card.label,
      sort_order: String(card.sortOrder === Number.MAX_SAFE_INTEGER ? 0 : card.sortOrder),
      is_active: card.isActive,
    };
  };

  const updatePhaseDraft = (
    card: (typeof b2bWorkCards)[number],
    patch: Partial<{ label: string; sort_order: string; is_active: boolean }>,
  ) => {
    if (!card.phaseId) return;
    setPhaseDrafts((current) => ({
      ...current,
      [card.phaseId!]: {
        ...getPhaseDraft(card),
        ...patch,
      },
    }));
  };

  const renderB2BWorkCards = () => {
    if (normalizedSiteType !== 'b2b') return null;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-text dark:text-gray-100">Darbai</h3>
          <span className="text-[12px] font-semibold text-subtle dark:text-subtle">{b2bWorkCards.length}</span>
        </div>

        {b2bWorkCards.length === 0 ? (
          <div className="bg-surface rounded-[16px] border border-border/20 dark:border-white/10 shadow-sm p-5">
            <p className="text-[13px] text-subtle dark:text-subtle">Šiam objektui darbų etapai nesukurti.</p>
          </div>
        ) : b2bWorkCards.map((card) => {
          const draft = getPhaseDraft(card);
          const canEditPhase = !!card.phaseId;
          const canDeletePhase = canEditPhase && canHardDeletePhase(card.entryCount);

          return (
            <div key={card.phaseId ?? 'unassigned'} className="bg-surface rounded-[16px] border border-border/20 dark:border-white/10 shadow-sm overflow-hidden">
              <div className="px-5 py-4 bg-surface-2/70 border-b border-border/20 dark:border-white/10 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  {canEditPhase ? (
                    <div className="flex-1 grid grid-cols-[minmax(0,1fr)_88px] gap-2">
                      <input
                        value={draft.label}
                        onChange={(event) => updatePhaseDraft(card, { label: event.target.value })}
                        className="h-[36px] px-3 bg-surface dark:bg-surface border border-border dark:border-white/10 rounded-[8px] text-[13px] font-semibold text-text dark:text-gray-100 focus:outline-none focus:border-primary"
                        aria-label="Darbo pavadinimas"
                      />
                      <input
                        type="number"
                        value={draft.sort_order}
                        onChange={(event) => updatePhaseDraft(card, { sort_order: event.target.value })}
                        className="h-[36px] px-3 bg-surface dark:bg-surface border border-border dark:border-white/10 rounded-[8px] text-[13px] font-semibold text-text dark:text-gray-100 focus:outline-none focus:border-primary"
                        aria-label="Eilė"
                      />
                    </div>
                  ) : (
                    <h4 className="text-[14px] font-bold text-text dark:text-gray-100">{card.label}</h4>
                  )}

                  {canEditPhase && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => savePhaseMutation.mutate(card.phaseId!)}
                        disabled={savePhaseMutation.isPending || !draft.label.trim()}
                        title="Išsaugoti"
                        className="w-9 h-9 rounded-[8px] bg-surface dark:bg-surface border border-border/40 dark:border-white/10 text-primary hover:border-primary/40 transition-colors disabled:opacity-50 flex items-center justify-center cursor-pointer"
                      >
                        {savePhaseMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePhaseMutation.mutate(card.phaseId!)}
                        disabled={!canDeletePhase || deletePhaseMutation.isPending}
                        title={canDeletePhase ? 'Ištrinti' : 'Negalima ištrinti, nes yra laiko įrašų'}
                        className="w-9 h-9 rounded-[8px] bg-surface dark:bg-surface border border-border/40 dark:border-white/10 text-[#DC2626] hover:border-[#DC2626]/40 transition-colors disabled:opacity-40 flex items-center justify-center cursor-pointer"
                      >
                        {deletePhaseMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-[6px] border ${card.isActive ? 'bg-[#ECFDF5] text-[#059669] border-[#059669]/20' : 'bg-surface dark:bg-surface text-subtle dark:text-subtle border-border/50 dark:border-white/10'}`}>
                      {card.isActive ? 'Aktyvus' : 'Neaktyvus'}
                    </span>
                    {canEditPhase && (
                      <label className="flex items-center gap-2 text-[12px] font-semibold text-subtle dark:text-subtle cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.is_active}
                          onChange={(event) => updatePhaseDraft(card, { is_active: event.target.checked })}
                          className="w-4 h-4 accent-primary cursor-pointer"
                        />
                        Aktyvus
                      </label>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-[12px] font-semibold text-subtle dark:text-subtle">
                    <span>Valandos: {card.totalHours.toFixed(1)} h</span>
                    {card.openEntryCount > 0 && <span>{card.openEntryCount} aktyvu</span>}
                    <span>Atlikta: {card.completedCount}/{card.totalCount}</span>
                    {card.missingPhotoCount > 0 && <span className="text-[#DC2626]">Trūksta nuotraukų: {card.missingPhotoCount}</span>}
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[12px] font-bold text-subtle dark:text-subtle uppercase tracking-wider">Užduotys</h4>
                  <span className="text-[12px] font-semibold text-subtle dark:text-subtle">{card.items.length}</span>
                </div>
                {card.items.length > 0 ? (
                  <div className="space-y-2">
                    {card.items.map(item => (
                      <ChecklistItemRow
                        key={item.id}
                        item={item as ChecklistRowItem}
                        siteId={siteId}
                        installerPhotos={photosForItem(item.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-subtle dark:text-subtle italic">Užduočių nėra.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (!session) {
    return (
      <div className="space-y-5">
      {renderB2BWorkCards()}
      <div className="bg-surface rounded-[16px] border border-border/20 dark:border-white/10 shadow-sm p-8 flex flex-col items-center gap-5">
        <div className="w-16 h-16 rounded-[16px] bg-surface-2 dark:bg-surface-2 flex items-center justify-center border border-border/30 dark:border-white/10">
          <ClipboardList size={32} className="text-subtle" />
        </div>
        <div className="text-center">
          <p className="font-bold text-[16px] text-text dark:text-gray-100 mb-1">Checklist nepriskirtas</p>
          <p className="text-[13px] text-subtle dark:text-subtle">Priskirk {siteTypeLabel(normalizedSiteType)} checklist šabloną, kad sukurtum šio objekto QC sesiją.</p>
        </div>
        <div className="w-full max-w-sm flex gap-2">
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="flex-1 h-[44px] px-3 bg-surface-2 dark:bg-surface-2 border border-border dark:border-white/10 rounded-[8px] text-[14px] text-text dark:text-gray-100 focus:outline-none focus:border-primary"
          >
            <option value="">-- Pasirinkti šabloną --</option>
            {checklistGroups?.map(group => (
              <option key={group.category} value={group.category}>{group.label} ({group.itemCount})</option>
            ))}
          </select>
          <button
            onClick={() => assignMutation.mutate()}
            disabled={!selectedCategory || assignMutation.isPending}
            className="h-[44px] px-5 rounded-[8px] bg-primary text-white font-semibold text-[14px] hover:bg-primary/80 transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {assignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus size={16} />}
            Priskirti
          </button>
        </div>
      </div>
      </div>
    );
  }

  // ── Session exists: show QC dashboard ────────────────────────────────────
  const total = items.length;
  const passed = items.filter(i => i.status === 'pass').length;
  const failed = items.filter(i => i.status === 'fail').length;
  const naCount = items.filter(i => i.status === 'n_a').length;
  const resolved = passed + naCount;
  const pct = total > 0 ? Math.round((resolved / total) * 100) : 0;

  // Group items by category
  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    const key = item.category || 'Kita';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const SESSION_STATUS: Record<'pending' | 'in_progress' | 'completed', { label: string; className: string }> = {
    pending:     { label: 'Laukia',      className: 'bg-surface-2 dark:bg-surface-2 text-subtle dark:text-subtle border-border/50 dark:border-white/10' },
    in_progress: { label: 'Vykdoma',     className: 'bg-[#EFF6FF] text-[#2563EB] border-[#2563EB]/20' },
    completed:   { label: 'Baigta',      className: 'bg-[#ECFDF5] text-[#059669] border-[#059669]/20' },
  };
  const ss = SESSION_STATUS[session.status];

  return (
    <>
    <div className="space-y-5">
      {/* Progress header */}
      <div className="bg-surface rounded-[16px] border border-border/20 dark:border-white/10 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[10px] bg-surface-2 dark:bg-primary/10 flex items-center justify-center border border-primary/10">
              <ListChecks size={20} className="text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-[15px] text-text dark:text-gray-100">QC Sesija</h3>
              <p className="text-[12px] text-subtle dark:text-subtle">{total} klausimai · {format(new Date(session.created_at!), 'yyyy-MM-dd')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-[6px] border ${ss.className}`}>{ss.label}</span>
            {failed > 0 && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-[6px] border bg-[#FEF2F2] text-[#DC2626] border-[#DC2626]/20 flex items-center gap-1">
                <AlertTriangle size={11} /> {failed} neatlikta
              </span>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Iš viso',    value: total,    cls: 'text-text dark:text-gray-100' },
            { label: 'Atlikta',    value: passed,   cls: 'text-[#059669]' },
            { label: 'Neatlikta', value: failed,   cls: 'text-[#DC2626]' },
            { label: 'Netaikoma', value: naCount,   cls: 'text-[#D97706]' },
          ].map(s => (
            <div key={s.label} className="bg-surface-2 dark:bg-surface-2 rounded-[10px] p-3 border border-border/30 dark:border-white/10 text-center">
              <span className={`text-[20px] font-bold block ${s.cls}`}>{s.value}</span>
              <span className="text-[10px] font-semibold text-subtle dark:text-subtle uppercase tracking-wider">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2.5 bg-border/20 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-[#7c3aed]"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
          <span className="text-[14px] font-bold text-primary w-10 text-right">{pct}%</span>
        </div>

        {/* Add custom item button */}
        <div className="flex justify-end mt-4 pt-3 border-t border-border/20 dark:border-white/10">
          <button
            onClick={() => setShowAddItem(true)}
            className="flex items-center gap-2 h-[34px] px-4 rounded-[8px] bg-surface-2 dark:bg-surface-2 text-primary font-semibold text-[13px] hover:bg-surface-2 border border-border/30 dark:border-white/10 transition-colors cursor-pointer"
          >
            <Plus size={14} />
            Pridėti papildomą darbą
          </button>
        </div>
      </div>

      {/* Grouped items */}
      {normalizedSiteType === 'b2b'
        ? renderB2BWorkCards()
        : Object.entries(grouped).map(([category, groupItems]) => {
          const groupPassed = groupItems.filter(i => i.status === 'pass').length;
          const groupTotal = groupItems.length;
          return (
            <div key={category} className="bg-surface rounded-[16px] border border-border/20 dark:border-white/10 shadow-sm overflow-hidden">
              {/* Group header */}
              <div className="px-5 py-3.5 bg-surface-2/70 border-b border-border/20 dark:border-white/10 flex items-center justify-between">
                <h4 className="text-[12px] font-bold text-subtle dark:text-subtle uppercase tracking-wider">{category}</h4>
                <span className="text-[12px] font-semibold text-subtle dark:text-subtle">{groupPassed}/{groupTotal}</span>
              </div>
              <div className="p-4 space-y-2">
                {groupItems.map(item => (
                  <ChecklistItemRow key={item.id} item={item as ChecklistRowItem} siteId={siteId} installerPhotos={photosForItem(item.id)} />
                ))}
              </div>
            </div>
          );
        })}

      {/* Installer-logged extra materials */}
      {extraMaterials && extraMaterials.length > 0 && (
        <div className="bg-surface rounded-[16px] border border-border/20 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-surface-2/70 border-b border-border/20 dark:border-white/10 flex items-center justify-between">
            <h4 className="text-[12px] font-bold text-subtle dark:text-subtle uppercase tracking-wider flex items-center gap-2">
              <Package size={14} className="text-primary" /> Papildomos medžiagos
            </h4>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#FBF0FF] text-primary border border-primary/20">
              PAPILDOMOS MEDŽIAGOS
            </span>
          </div>
          <div className="p-4 space-y-2">
            {extraMaterials.map(m => (
              <div key={m.id} className="flex items-center gap-3 bg-surface-2 dark:bg-surface-2 rounded-[10px] px-3.5 py-2.5 border border-border/30 dark:border-white/10">
                <Package size={15} className="text-subtle dark:text-subtle shrink-0" />
                <span className="flex-1 text-[13px] font-semibold text-text dark:text-gray-100 truncate">{m.name}</span>
                <span className="text-[13px] text-[#574f61] font-medium whitespace-nowrap">{m.quantity} {m.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

    {/* ── Add custom checklist item modal ── */}
    {showAddItem && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-surface rounded-[16px] shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/30 dark:border-white/10">
            <h3 className="text-[16px] font-bold text-text dark:text-gray-100">Papildomas darbas</h3>
            <button
              onClick={() => setShowAddItem(false)}
              className="cursor-pointer text-subtle dark:text-subtle hover:text-text transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-muted dark:text-subtle uppercase tracking-wider mb-2">
                Darbo aprašymas <span className="text-red-500">*</span>
              </label>
              <textarea
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                placeholder="Pvz.: Patikrinti DC jungčių sandarumą..."
                rows={3}
                autoFocus
                className="w-full px-3 py-2 bg-surface-2 dark:bg-surface-2 border border-border dark:border-white/10 rounded-[8px] text-[14px] text-text dark:text-gray-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={newItemRequired}
                onChange={(e) => setNewItemRequired(e.target.checked)}
                className="w-4 h-4 accent-primary cursor-pointer"
              />
              <span className="text-[14px] text-text dark:text-gray-100 font-medium">Reikalinga nuotrauka kaip įrodymas</span>
            </label>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex gap-3">
            <button
              onClick={() => { setShowAddItem(false); setNewItemText(''); }}
              disabled={addItemMutation.isPending}
              className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] border border-border dark:border-white/10 text-muted dark:text-subtle hover:bg-surface-2 transition-colors disabled:opacity-60 cursor-pointer"
            >
              Atšaukti
            </button>
            <button
              onClick={() => addItemMutation.mutate()}
              disabled={addItemMutation.isPending || !newItemText.trim()}
              className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] bg-primary text-white hover:bg-primary/80 transition-colors flex items-center justify-center disabled:opacity-70 cursor-pointer"
            >
              {addItemMutation.isPending ? <Loader2 className="animate-spin w-5 h-5" /> : 'Pridėti'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
