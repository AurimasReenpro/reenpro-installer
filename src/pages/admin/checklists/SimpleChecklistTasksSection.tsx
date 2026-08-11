import type { ChecklistTemplateTask } from '../../../lib/checklistTemplateTasks';
import ChecklistTaskRow from './ChecklistTaskRow';
import { getTaskSectionTitle } from './checklistSections';

/**
 * Flat task list for non-B2B tabs — "B2C užduotys", "Serviso užduotys",
 * plain "Užduotys" for Visi/custom groups. No B2B category grouping here.
 */
export default function SimpleChecklistTasksSection({
  activeCategory,
  items,
  isLoading,
  onEditTask,
  onDeactivateTask,
}: {
  activeCategory: string;
  items: ChecklistTemplateTask[];
  isLoading: boolean;
  onEditTask: (item: ChecklistTemplateTask) => void;
  onDeactivateTask: (id: string) => void;
}) {
  const showCategory = activeCategory === 'Visi';

  return (
    <div className="bg-surface border border-border rounded-card shadow-sm dark:shadow-none overflow-hidden">
      <div className="px-5 py-3.5 bg-surface-2 border-b border-border flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-bold text-text">{getTaskSectionTitle(activeCategory)}</h3>
        <span className="text-[12px] font-semibold text-subtle">{items.length}</span>
      </div>
      <div className="p-4 space-y-2">
        {isLoading ? (
          <p className="py-4 text-center text-[13px] text-subtle">Kraunama...</p>
        ) : items.length > 0 ? (
          items.map((item) => (
            <ChecklistTaskRow
              key={item.id}
              item={item}
              showCategory={showCategory}
              onEdit={onEditTask}
              onDeactivate={onDeactivateTask}
            />
          ))
        ) : (
          <p className="py-4 text-center text-[13px] text-subtle">Šablonų nerasta.</p>
        )}
      </div>
    </div>
  );
}
