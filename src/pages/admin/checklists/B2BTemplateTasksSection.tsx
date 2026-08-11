import { Plus } from 'lucide-react';
import type { B2BChecklistTemplateTaskGroup, ChecklistTemplateTask } from '../../../lib/checklistTemplateTasks';
import ChecklistTaskRow from './ChecklistTaskRow';

/**
 * "B2B užduotys" — checklist TEMPLATE tasks grouped by B2B work category.
 * Tasks without a category render under "Nepriskirtos B2B užduotys" (the
 * group label comes from the grouping lib) and are never auto-applied to
 * new sites. Adding is only offered on ACTIVE catalog categories.
 */
export default function B2BTemplateTasksSection({
  groups,
  onAddTask,
  onEditTask,
  onDeactivateTask,
}: {
  groups: B2BChecklistTemplateTaskGroup[];
  onAddTask: (categoryId: string) => void;
  onEditTask: (item: ChecklistTemplateTask) => void;
  onDeactivateTask: (id: string) => void;
}) {
  const totalTasks = groups.reduce((sum, group) => sum + group.tasks.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-text">B2B užduotys</h3>
        <span className="text-[12px] font-semibold text-subtle">{totalTasks}</span>
      </div>

      {groups.map((group) => (
        <div key={group.categoryId ?? 'unassigned'} className="bg-surface border border-border rounded-2xl shadow-sm dark:shadow-none overflow-hidden">
          <div className="px-5 py-3.5 bg-surface-2 border-b border-border flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-[13px] font-bold text-text truncate">{group.label}</h4>
              <p className="text-[12px] text-subtle">{group.tasks.length} užduotys</p>
            </div>
            <div className="flex items-center gap-2">
              {!group.isActive && group.categoryId && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-[6px] border bg-surface text-subtle border-border">
                  Neaktyvus
                </span>
              )}
              {group.categoryId && group.isActive && (
                <button
                  onClick={() => onAddTask(group.categoryId!)}
                  className="h-[34px] px-3 rounded-lg bg-primary text-white font-semibold text-[12px] flex items-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  <Plus size={14} />
                  Pridėti užduotį
                </button>
              )}
            </div>
          </div>

          <div className="p-4 space-y-2">
            {group.tasks.length > 0 ? group.tasks.map((item) => (
              <ChecklistTaskRow key={item.id} item={item} onEdit={onEditTask} onDeactivate={onDeactivateTask} />
            )) : (
              <p className="text-[12px] text-subtle italic">Užduočių nėra.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
