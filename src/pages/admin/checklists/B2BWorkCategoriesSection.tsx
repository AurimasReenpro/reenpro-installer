import { useState } from 'react';
import { Plus, Save, Ban } from 'lucide-react';
import type { B2BWorkCategory } from '../../../lib/b2bWorkCategories';
import { B2B_CATALOG_HINT, EILE_ORDER_HINT } from './checklistSections';

export interface WorkCategoryDraft {
  label: string;
  sort_order: number;
  is_active: boolean;
}

/**
 * "B2B darbai" — the reusable work CATALOG only (no checklist tasks here).
 * Shows every category, including deactivated ones (muted), so an admin can
 * re-activate via the "Aktyvus" checkbox + save.
 */
export default function B2BWorkCategoriesSection({
  categories,
  isSaving,
  isDeactivating,
  isAdding,
  onSave,
  onDeactivate,
  onAdd,
}: {
  categories: B2BWorkCategory[];
  isSaving: boolean;
  isDeactivating: boolean;
  isAdding: boolean;
  onSave: (categoryId: string, draft: WorkCategoryDraft) => void;
  onDeactivate: (categoryId: string) => void;
  onAdd: (label: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, WorkCategoryDraft>>({});
  const [newWorkLabel, setNewWorkLabel] = useState('');

  const getDraft = (category: B2BWorkCategory): WorkCategoryDraft =>
    drafts[category.id] ?? {
      label: category.label,
      sort_order: category.sort_order,
      is_active: category.is_active,
    };
  const updateDraft = (category: B2BWorkCategory, patch: Partial<WorkCategoryDraft>) => {
    setDrafts((current) => ({ ...current, [category.id]: { ...getDraft(category), ...patch } }));
  };

  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sm dark:shadow-none overflow-hidden">
      <div className="px-5 py-3.5 bg-surface-2 border-b border-border">
        <h3 className="text-[14px] font-bold text-text">B2B darbai</h3>
        <p className="text-[12px] text-subtle mt-0.5">{B2B_CATALOG_HINT}</p>
        <p className="text-[11px] text-subtle mt-1">
          <span className="font-bold">Eilė</span> — {EILE_ORDER_HINT}
        </p>
      </div>
      <div className="p-4 space-y-2">
        {categories.map((category) => {
          const draft = getDraft(category);
          return (
            <div
              key={category.id}
              className={`grid grid-cols-[minmax(0,1fr)_92px_auto] gap-2 items-end bg-surface-2 border border-border rounded-xl px-3 py-2 ${category.is_active ? '' : 'opacity-60'}`}
            >
              <div className="min-w-0">
                <input
                  value={draft.label}
                  onChange={(e) => updateDraft(category, { label: e.target.value })}
                  className="h-[36px] w-full px-3 bg-surface border border-border rounded-lg text-[13px] text-text focus:outline-none focus:border-primary"
                  aria-label="Darbo pavadinimas"
                />
                <p className="mt-1 text-[10px] font-semibold text-subtle truncate" title={category.code}>
                  Kodas: {category.code}
                  {!category.is_active && <span className="ml-2 uppercase tracking-wider">Neaktyvus</span>}
                </p>
              </div>
              <label className="block">
                <span className="block text-[10px] font-bold text-subtle uppercase tracking-wider mb-1">Eilė</span>
                <input
                  type="number"
                  value={draft.sort_order}
                  onChange={(e) => updateDraft(category, { sort_order: Number(e.target.value) })}
                  className="h-[36px] w-full px-2 bg-surface border border-border rounded-lg text-[13px] text-text focus:outline-none focus:border-primary"
                  aria-label="Eilė"
                  title={EILE_ORDER_HINT}
                />
              </label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                  <input
                    type="checkbox"
                    checked={draft.is_active}
                    onChange={(e) => updateDraft(category, { is_active: e.target.checked })}
                    className="w-4 h-4 text-primary border-border rounded focus:ring-primary"
                  />
                  Aktyvus
                </label>
                <button
                  onClick={() => onSave(category.id, draft)}
                  className="w-[34px] h-[34px] rounded-lg bg-primary text-white flex items-center justify-center cursor-pointer disabled:opacity-60"
                  disabled={isSaving}
                  title="Išsaugoti"
                >
                  <Save size={15} />
                </button>
                <button
                  onClick={() => onDeactivate(category.id)}
                  className="w-[34px] h-[34px] rounded-lg border border-border text-subtle hover:text-danger hover:bg-[var(--danger)]/10 flex items-center justify-center cursor-pointer disabled:opacity-60"
                  disabled={isDeactivating || !category.is_active}
                  title="Deaktyvuoti"
                >
                  <Ban size={15} />
                </button>
              </div>
            </div>
          );
        })}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const label = newWorkLabel.trim();
            if (!label) return;
            onAdd(label);
            setNewWorkLabel('');
          }}
          className="flex gap-2 pt-2"
        >
          <input
            value={newWorkLabel}
            onChange={(e) => setNewWorkLabel(e.target.value)}
            placeholder="Darbo pavadinimas"
            className="flex-1 h-[40px] px-3 bg-surface-2 border border-border rounded-xl text-[13px] text-text focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!newWorkLabel.trim() || isAdding}
            className="h-[40px] px-4 rounded-xl bg-primary text-white font-semibold text-[13px] flex items-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            <Plus size={15} />
            Pridėti darbą
          </button>
        </form>
      </div>
    </div>
  );
}
