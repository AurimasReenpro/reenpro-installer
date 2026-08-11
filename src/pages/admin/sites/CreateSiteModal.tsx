import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ClipboardList, Loader2, X } from 'lucide-react';
import { getChecklistTemplateGroupsForSiteType } from '../../../api/sites';
import { getActiveB2BWorkCategories } from '../../../api/b2bWorkCategories';
import { hasB2BWorkSelection } from '../../../lib/siteCreationB2B';
import {
  DEFAULT_SITE_TYPE,
  SITE_TYPE_OPTIONS,
  siteTypeLabel,
  type ChecklistTemplateGroup,
  type SiteType,
} from '../../../lib/siteTypes';
import type { CreateBlankSiteOptions } from '../../../hooks/useCreateSite';

export default function CreateSiteModal({
  isCreating,
  onClose,
  onCreate,
}: {
  isCreating: boolean;
  onClose: () => void;
  onCreate: (options: CreateBlankSiteOptions) => Promise<string | null>;
}) {
  const [siteType, setSiteType] = useState<SiteType>(DEFAULT_SITE_TYPE);
  const [checklistCategory, setChecklistCategory] = useState('');
  const [selectedB2BIds, setSelectedB2BIds] = useState<Set<string>>(new Set());
  const [b2bError, setB2bError] = useState(false);
  const isB2B = siteType === 'b2b';

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['checklist_template_groups', siteType],
    queryFn: () => getChecklistTemplateGroupsForSiteType(siteType),
    enabled: !isB2B,
  });

  const { data: b2bCategories = [], isLoading: b2bLoading } = useQuery({
    queryKey: ['b2b_work_categories', 'active'],
    queryFn: getActiveB2BWorkCategories,
    enabled: isB2B,
  });

  const selectedChecklistCategory = groups.some((group) => group.category === checklistCategory)
    ? checklistCategory
    : groups.length === 1 ? groups[0]?.category ?? '' : '';

  const toggleB2B = (id: string) => {
    setB2bError(false);
    setSelectedB2BIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const b2bCategoryIds = [...selectedB2BIds];
    if (isB2B && !hasB2BWorkSelection(b2bCategoryIds)) {
      setB2bError(true);
      return;
    }
    const id = await onCreate({
      siteType,
      checklistCategory: isB2B ? null : (selectedChecklistCategory || null),
      b2bCategoryIds: isB2B ? b2bCategoryIds : undefined,
    });
    if (id) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(event) => { if (event.target === event.currentTarget && !isCreating) onClose(); }}
    >
      <div className="bg-surface dark:bg-[#18181b] rounded-[20px] shadow-2xl w-full max-w-md border border-border dark:border-white/10 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-white/10">
          <div className="min-w-0">
            <h2 className="font-bold text-[16px] text-text flex items-center gap-2">
              <ClipboardList size={17} className="text-primary" />
              Naujas objektas
            </h2>
            <p className="text-[12px] text-subtle mt-0.5">Pasirinkite objekto tipą ir checklist šabloną.</p>
          </div>
          <button
            onClick={onClose}
            disabled={isCreating}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X size={18} className="text-subtle" />
          </button>
        </div>

        <form onSubmit={(event) => { void handleSubmit(event); }} className="p-6 space-y-5">
          <div>
            <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-2">
              Objekto tipas
            </label>
            <select
              value={siteType}
              onChange={(event) => {
                setSiteType(event.target.value as SiteType);
                setChecklistCategory('');
                setSelectedB2BIds(new Set());
                setB2bError(false);
              }}
              disabled={isCreating}
              className="w-full h-[44px] px-3 bg-surface-2 border border-border rounded-card text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer disabled:opacity-60"
            >
              {SITE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {isB2B ? (
            <div>
              <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-2">
                B2B darbai
              </label>
              {b2bLoading ? (
                <p className="text-[12px] text-subtle">Kraunami B2B darbai...</p>
              ) : b2bCategories.length === 0 ? (
                <p className="text-[12px] text-subtle">Aktyvių B2B darbų katalogas tuščias — sukurkite darbus Checklist puslapyje.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {b2bCategories.map((category) => {
                    const selected = selectedB2BIds.has(category.id);
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => toggleB2B(category.id)}
                        disabled={isCreating}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-card border text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-60 ${
                          selected
                            ? 'bg-primary/10 border-primary text-primary dark:text-primary-ink'
                            : 'bg-surface-2 border-border text-muted hover:border-primary/40'
                        }`}
                      >
                        {selected && <Check size={13} />}
                        {category.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {b2bError && (
                <p className="text-[12px] text-danger mt-1.5 font-medium">Pasirinkite bent vieną B2B darbą.</p>
              )}
              <p className="text-[12px] text-subtle mt-1.5">
                Pasirinkti darbai sukurs objekto etapus, checklist užduotis ir bus naudojami laiko fiksavimui.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-2">
                Checklist šablonas
              </label>
              <select
                value={selectedChecklistCategory}
                onChange={(event) => setChecklistCategory(event.target.value)}
                disabled={isCreating || isLoading || groups.length === 0}
                className="w-full h-[44px] px-3 bg-surface-2 border border-border rounded-card text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer disabled:opacity-60"
              >
                <option value="">Be checklist šablono</option>
                {groups.map((group) => (
                  <option key={group.category} value={group.category}>
                    {formatGroupLabel(group)}
                  </option>
                ))}
              </select>
              <p className="text-[12px] text-subtle mt-1.5">
                {isLoading
                  ? 'Kraunami galimi checklist šablonai...'
                  : groups.length === 0
                    ? `${siteTypeLabel(siteType)} tipui checklist šablonų nerasta.`
                    : 'Pasirinktas šablonas bus pritaikytas sukūrus objektą.'}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="flex-1 h-[42px] rounded-card border border-border text-muted dark:text-subtle font-medium text-[14px] hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              Atšaukti
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="flex-1 h-[42px] rounded-card bg-primary text-white font-medium text-[14px] hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Sukurti
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatGroupLabel(group: ChecklistTemplateGroup): string {
  const phaseCount = group.phases.length;
  const photoText = group.requiresPhotoCount > 0 ? `, ${group.requiresPhotoCount} su foto` : '';
  const phaseText = phaseCount > 0 ? `, ${phaseCount} fazės` : '';
  return `${group.label} (${group.itemCount} punktai${phaseText}${photoText})`;
}
