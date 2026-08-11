import { Camera, Edit2, Ban } from 'lucide-react';
import type { ChecklistTemplateTask } from '../../../lib/checklistTemplateTasks';

/**
 * One checklist template task row — shared verbatim by B2B, B2C and Servisas
 * sections so task editing looks identical everywhere. "Eilė" is sort_order:
 * ordering only, never time.
 */
export default function ChecklistTaskRow({
  item,
  showCategory = false,
  onEdit,
  onDeactivate,
}: {
  item: ChecklistTemplateTask;
  showCategory?: boolean;
  onEdit: (item: ChecklistTemplateTask) => void;
  onDeactivate: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 bg-surface-2 border border-border rounded-card px-3.5 py-2.5 sm:flex-row sm:items-center">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-text truncate">{item.name}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-subtle">
          <span className="px-2 py-0.5 rounded-[6px] bg-surface border border-border">Eilė {item.sort_order}</span>
          <span className="px-2 py-0.5 rounded-[6px] bg-surface border border-border">{item.phase}</span>
          {showCategory && (
            <span className="px-2 py-0.5 rounded-[6px] bg-surface border border-border">{item.category || '-'}</span>
          )}
          {item.is_required && (
            <span className="px-2 py-0.5 rounded-[6px] bg-surface border border-border">Privaloma</span>
          )}
          {item.requires_photo && (
            <>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[#ECFDF5] text-[#10B981] border border-[#10B981]/20">
                <Camera size={12} />
                Reikia nuotraukos
              </span>
              <span className="px-2 py-0.5 rounded-[6px] bg-surface border border-border">
                Min. nuotraukų: {Math.max(1, item.min_photo_count ?? 1)}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <button
          onClick={() => onEdit(item)}
          className="h-[30px] px-3 rounded-[6px] flex items-center gap-1.5 text-[12px] font-semibold text-primary dark:text-primary-ink bg-surface hover:bg-[#ecdcff] dark:hover:bg-primary/30 border border-border hover:border-primary/20 transition-colors cursor-pointer"
          title="Redaguoti"
        >
          <Edit2 size={13} />
          Redaguoti
        </button>
        <button
          onClick={() => onDeactivate(item.id)}
          className="h-[30px] px-3 rounded-[6px] flex items-center gap-1.5 text-[12px] font-semibold text-subtle hover:text-[#e2250a] hover:bg-[#ffdad6] dark:hover:bg-danger/30 border border-border hover:border-[#e2250a]/20 transition-colors cursor-pointer"
          title="Deaktyvuoti"
        >
          <Ban size={13} />
          Deaktyvuoti
        </button>
      </div>
    </div>
  );
}
