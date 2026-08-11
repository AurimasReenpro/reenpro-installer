import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import * as Sentry from "@sentry/react";
import { toast } from 'sonner';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { FolderCog, RefreshCw, Plus, Trash2, X } from 'lucide-react';
import { checklistCategoryMatchesFilter, normalizeChecklistCategory, REQUIRED_CHECKLIST_CATEGORY_TABS } from '../../lib/siteTypes';
import {
  createB2BWorkCategory,
  deactivateB2BWorkCategory,
  getB2BWorkCategories,
  updateB2BWorkCategory,
} from '../../api/b2bWorkCategories';
import {
  groupChecklistTemplateTasksByB2BWorkCategory,
  type ChecklistTemplateTask,
} from '../../lib/checklistTemplateTasks';
import B2BWorkCategoriesSection from './checklists/B2BWorkCategoriesSection';
import B2BTemplateTasksSection from './checklists/B2BTemplateTasksSection';
import SimpleChecklistTasksSection from './checklists/SimpleChecklistTasksSection';

// Template task rows share the lib model so every section renders identically.
type ChecklistTemplate = ChecklistTemplateTask;

export default function Checklists() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistTemplate | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('Visi');
  
  // Category Form State
  const [newCategoryName, setNewCategoryName] = useState('');

  // Confirmation States
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phase: 'pre' as 'pre' | 'during' | 'post',
    requires_photo: false,
    min_photo_count: 0,
    is_required: true,
    is_active: true,
    sort_order: 0,
    template_work_phase_id: '',
    b2b_work_category_id: '',
    category: '',
  });

  const { data: categories, isLoading: isLoadingCategories } = useQuery({
    queryKey: ['checklist_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_categories')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data;
    }
  });

  const { data: templates, isLoading } = useQuery({
    queryKey: ['checklist_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_templates')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('phase', { ascending: true })
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data as ChecklistTemplate[];
    }
  });

  const { data: b2bWorkCategories = [] } = useQuery({
    queryKey: ['b2b_work_categories'],
    queryFn: getB2BWorkCategories,
  });

  const addWorkCategoryMutation = useMutation({
    mutationFn: async (label: string) => {
      const nextOrder = Math.max(0, ...b2bWorkCategories.map((category) => category.sort_order)) + 10;
      await createB2BWorkCategory({
        label,
        sort_order: nextOrder,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['b2b_work_categories'] });
    },
    onError: (err) => {
      console.error('Add B2B work category error:', err);
      Sentry.captureException(err, { extra: { context: 'Add B2B work category' } });
      toast.error('Nepavyko pridėti darbo.');
    },
  });

  const updateWorkCategoryMutation = useMutation({
    mutationFn: async ({ categoryId, update }: { categoryId: string; update: { label?: string; sort_order?: number; is_active?: boolean } }) => {
      await updateB2BWorkCategory(categoryId, update);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['b2b_work_categories'] });
    },
    onError: (err) => {
      console.error('Update B2B work category error:', err);
      Sentry.captureException(err, { extra: { context: 'Update B2B work category' } });
      toast.error('Nepavyko išsaugoti darbo.');
    },
  });

  const deactivateWorkCategoryMutation = useMutation({
    mutationFn: deactivateB2BWorkCategory,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['b2b_work_categories'] });
    },
    onError: (err) => {
      console.error('Deactivate B2B work category error:', err);
      Sentry.captureException(err, { extra: { context: 'Deactivate B2B work category' } });
      toast.error('Nepavyko deaktyvuoti darbo.');
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (item: Omit<ChecklistTemplate, 'id'> & { id?: string }) => {
      if (editingItem?.id) {
        const { error } = await supabase
          .from('checklist_templates')
          .update(item)
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('checklist_templates')
          .insert([item]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checklist_templates'] });
      closeModal();
    },
    onError: (err) => {
      console.error("Save error:", err); Sentry.captureException(err, { extra: { context: "Save error:" } });
      toast.error("Nepavyko išsaugoti šablono.");
    }
  });

  const deactivateTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('checklist_templates')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checklist_templates'] });
    },
    onError: (err) => {
      console.error("Deactivate template error:", err); Sentry.captureException(err, { extra: { context: "Deactivate template error:" } });
      toast.error("Nepavyko deaktyvuoti šablono.");
    }
  });

  const addCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('checklist_categories').insert([{ name }]);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checklist_categories'] });
      setNewCategoryName('');
    },
    onError: (err) => {
      console.error("Add category error:", err); Sentry.captureException(err, { extra: { context: "Add category error:" } });
      toast.error("Nepavyko pridėti kategorijos.");
    }
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('checklist_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checklist_categories'] });
    },
    onError: (err) => {
      console.error("Delete category error:", err); Sentry.captureException(err, { extra: { context: "Delete category error:" } });
      toast.error("Nepavyko ištrinti kategorijos.");
    }
  });

  const handleOpenModal = (item?: ChecklistTemplate, b2bWorkCategoryId?: string | null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        phase: item.phase,
        requires_photo: item.requires_photo,
        min_photo_count: item.min_photo_count ?? (item.requires_photo ? 1 : 0),
        is_required: item.is_required ?? true,
        is_active: item.is_active ?? true,
        sort_order: item.sort_order ?? 0,
        template_work_phase_id: item.template_work_phase_id ?? '',
        b2b_work_category_id: item.b2b_work_category_id ?? '',
        category: item.category || '',
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        phase: 'pre',
        requires_photo: false,
        min_photo_count: 0,
        is_required: true,
        is_active: true,
        sort_order: (() => {
          const matching = (templates ?? []).filter((template) => (
            b2bWorkCategoryId !== undefined
              ? template.b2b_work_category_id === b2bWorkCategoryId
              : checklistCategoryMatchesFilter(template.category, activeCategory)
          ));
          return Math.max(0, ...matching.map((template) => template.sort_order ?? 0)) + 10;
        })(),
        template_work_phase_id: '',
        b2b_work_category_id: b2bWorkCategoryId ?? '',
        category: b2bWorkCategoryId !== undefined
          ? 'B2B'
          : activeCategory !== 'Visi'
            ? activeCategory
            : categories && categories.length > 0 ? categories[0]?.name || '' : '',
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.warning('Prašome įvesti pavadinimą.');
      return;
    }
    const isB2B = normalizeChecklistCategory(formData.category) === 'b2b';
    saveMutation.mutate({
      ...formData,
      min_photo_count: formData.requires_photo ? Math.max(1, formData.min_photo_count) : 0,
      sort_order: Number(formData.sort_order) || 0,
      is_active: true,
      template_work_phase_id: formData.template_work_phase_id || null,
      b2b_work_category_id: isB2B ? formData.b2b_work_category_id || null : null,
    });
  };

  const handleDelete = (id: string) => {
    setTemplateToDelete(id);
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    addCategoryMutation.mutate(newCategoryName);
  };

  const handleDeleteCategory = (id: string) => {
    setCategoryToDelete(id);
  };

  const handleSync = () => {
    toast.info('Ši funkcija bus pajungta vėliau, kartu su naujų objektų generavimo logika.');
  };

  const activeTabs = [
    'Visi',
    ...new Set([
      ...REQUIRED_CHECKLIST_CATEGORY_TABS,
      ...(categories?.map(c => c.name) || []),
    ]),
  ];

  const showB2BWorkPhases = activeCategory === 'B2B' || normalizeChecklistCategory(activeCategory) === 'b2b';
  const b2bTaskGroups = showB2BWorkPhases
    ? groupChecklistTemplateTasksByB2BWorkCategory(templates ?? [], b2bWorkCategories)
    : [];
  const visibleTemplates = (templates ?? []).filter((item) => checklistCategoryMatchesFilter(item.category, activeCategory));
  const formCategoryIsB2B = normalizeChecklistCategory(formData.category) === 'b2b';

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-text">Checklist'ų šablonai</h2>
          <p className="text-[14px] text-muted">Valdykite šablonų užduotis</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="h-[40px] px-4 font-medium text-[14px] rounded-card border border-border text-muted bg-surface hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors flex items-center gap-2"
          >
            <FolderCog size={18} />
            Valdyti grupes
          </button>
          <button
            onClick={handleSync}
            className="h-[40px] px-4 font-medium text-[14px] rounded-card border border-border text-muted bg-surface hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors flex items-center gap-2"
          >
            <RefreshCw size={18} />
            Pritaikyti naujiems objektams
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="h-[40px] px-4 font-medium text-[14px] rounded-card bg-primary text-white hover:bg-primary transition-all shadow-sm flex items-center gap-2"
          >
            <Plus size={18} />
            Pridėti užduotį
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-6 overflow-x-auto scrollbar-hide">
        {activeTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveCategory(tab)}
            className={`py-3 text-[14px] font-bold transition-colors border-b-2 -mb-[1px] whitespace-nowrap ${
              activeCategory === tab
                ? 'border-primary text-primary dark:text-primary-ink'
                : 'border-transparent text-subtle hover:text-muted dark:hover:text-subtle'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* "B2B darbai" = reusable work catalog only; tasks live in the section below. */}
      {showB2BWorkPhases && (
        <B2BWorkCategoriesSection
          categories={b2bWorkCategories}
          isSaving={updateWorkCategoryMutation.isPending}
          isDeactivating={deactivateWorkCategoryMutation.isPending}
          isAdding={addWorkCategoryMutation.isPending}
          onSave={(categoryId, draft) => updateWorkCategoryMutation.mutate({ categoryId, update: draft })}
          onDeactivate={(categoryId) => deactivateWorkCategoryMutation.mutate(categoryId)}
          onAdd={(label) => addWorkCategoryMutation.mutate(label)}
        />
      )}

      {showB2BWorkPhases && (
        <B2BTemplateTasksSection
          groups={b2bTaskGroups}
          onAddTask={(categoryId) => handleOpenModal(undefined, categoryId)}
          onEditTask={handleOpenModal}
          onDeactivateTask={handleDelete}
        />
      )}

      {!showB2BWorkPhases && (
        <SimpleChecklistTasksSection
          activeCategory={activeCategory}
          items={visibleTemplates}
          isLoading={isLoading}
          onEditTask={handleOpenModal}
          onDeactivateTask={handleDelete}
        />
      )}

      {/* Edit/Add Template Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-surface rounded-card shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-[18px] font-bold text-text">
                {editingItem ? 'Redaguoti užduotį' : 'Pridėti užduotį'}
              </h3>
              <button 
                onClick={closeModal}
                className="text-subtle hover:text-muted dark:hover:text-subtle transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-2">Užduoties pavadinimas</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="Užduoties pavadinimas..."
                  className="w-full h-[44px] px-4 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text dark:text-white focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-2">Fazė</label>
                <select 
                  required
                  value={formData.phase}
                  onChange={e => setFormData({...formData, phase: e.target.value as 'pre' | 'during' | 'post'})}
                  className="w-full h-[44px] px-4 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text dark:text-white focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                >
                  <option value="pre">Pre (prieš pradžią)</option>
                  <option value="during">During (darbų eigoje)</option>
                  <option value="post">Post (pabaigus darbus)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-2">Eilė</label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={e => setFormData({...formData, sort_order: Number(e.target.value)})}
                  className="w-full h-[44px] px-4 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text dark:text-white focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                />
                <p className="mt-1 text-[11px] text-subtle">Tik rikiavimui.</p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-2">Grupė / Kategorija</label>
                <select 
                  required
                  value={formData.category}
                  onChange={e => setFormData({
                    ...formData,
                    category: e.target.value,
                    template_work_phase_id: normalizeChecklistCategory(e.target.value) === 'b2b'
                      ? formData.template_work_phase_id
                      : '',
                    b2b_work_category_id: normalizeChecklistCategory(e.target.value) === 'b2b'
                      ? formData.b2b_work_category_id
                      : '',
                  })}
                  className="w-full h-[44px] px-4 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text dark:text-white focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                >
                  <option value="">-- Pasirinkti --</option>
                  {categories?.map((cat) => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {formCategoryIsB2B && (
                <div>
                  <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-2">B2B darbas</label>
                  <select
                    value={formData.b2b_work_category_id}
                    onChange={e => setFormData({...formData, b2b_work_category_id: e.target.value})}
                    className="w-full h-[44px] px-4 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text dark:text-white focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                  >
                    <option value="">-- Nepriskirta --</option>
                    {b2bWorkCategories
                      .filter((category) => category.is_active || category.id === formData.b2b_work_category_id)
                      .map((category) => (
                      <option key={category.id} value={category.id}>{category.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_required"
                  checked={formData.is_required}
                  onChange={e => setFormData({...formData, is_required: e.target.checked})}
                  className="w-4 h-4 text-primary border-border rounded focus:ring-primary"
                />
                <label htmlFor="is_required" className="text-[14px] font-medium text-text">Privaloma</label>
              </div>

              <div className="flex items-center gap-2">
                <input 
                  type="checkbox"
                  id="requires_photo"
                  checked={formData.requires_photo}
                  onChange={e => setFormData({
                    ...formData,
                    requires_photo: e.target.checked,
                    min_photo_count: e.target.checked ? Math.max(1, formData.min_photo_count) : 0,
                  })}
                  className="w-4 h-4 text-primary border-border rounded focus:ring-primary"
                />
                <label htmlFor="requires_photo" className="text-[14px] font-medium text-text">Reikia nuotraukos</label>
              </div>

              {formData.requires_photo && (
                <div>
                  <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-2">Min. nuotraukų</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={formData.min_photo_count}
                    onChange={e => setFormData({...formData, min_photo_count: Number(e.target.value)})}
                    className="w-full h-[44px] px-4 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text dark:text-white focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 h-[44px] font-medium text-[14px] rounded-card border border-border text-muted dark:text-subtle hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors"
                >
                  Atšaukti
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="flex-1 h-[44px] font-medium text-[14px] rounded-card bg-primary text-white hover:bg-primary transition-all flex items-center justify-center disabled:opacity-70"
                >
                  {saveMutation.isPending ? 'Saugoma...' : 'Išsaugoti'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Manager Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-surface rounded-card shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
              <h3 className="text-[18px] font-bold text-text">Valdyti grupes</h3>
              <button 
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-subtle hover:text-muted dark:hover:text-subtle transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-2 mb-6">
                {isLoadingCategories ? (
                  <p className="text-[14px] text-subtle text-center">Kraunama...</p>
                ) : categories && categories.length > 0 ? (
                  categories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between bg-surface-2 px-4 py-3 rounded-card border border-border">
                      <span className="font-semibold text-text text-[14px]">{cat.name}</span>
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="text-subtle hover:text-[#e2250a] transition-colors p-1 rounded-full hover:bg-[#ffdad6] dark:hover:bg-danger/30"
                        title="Trinti grupę"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-[14px] text-subtle text-center">Grupių nerasta.</p>
                )}
              </div>

              <form onSubmit={handleAddCategory} className="flex gap-2 border-t border-border pt-6">
                <input
                  type="text"
                  required
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Naujos grupės pavadinimas"
                  className="flex-1 h-[44px] px-4 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text dark:text-white focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all"
                />
                <button
                  type="submit"
                  disabled={addCategoryMutation.isPending || !newCategoryName.trim()}
                  className="h-[44px] px-4 font-medium text-[14px] rounded-card bg-primary text-white hover:bg-primary transition-all disabled:opacity-70 flex-shrink-0"
                >
                  {addCategoryMutation.isPending ? '...' : 'Pridėti'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={templateToDelete !== null}
        title="Deaktyvuoti užduotį"
        message="Ar tikrai norite deaktyvuoti šią užduotį? Ji liks duomenų bazėje, bet nebebus rodoma aktyviuose šablonuose."
        confirmText="Deaktyvuoti"
        cancelText="Atšaukti"
        variant="danger"
        onConfirm={() => {
          if (templateToDelete) {
            deactivateTemplateMutation.mutate(templateToDelete);
          }
          setTemplateToDelete(null);
        }}
        onCancel={() => setTemplateToDelete(null)}
      />

      <ConfirmModal
        isOpen={categoryToDelete !== null}
        title="Ištrinti kategoriją"
        message="Ar tikrai norite trinti šią kategoriją? Priskirti šablonai nebus ištrinti, bet liks be kategorijos."
        confirmText="Ištrinti"
        cancelText="Atšaukti"
        variant="danger"
        onConfirm={() => {
          if (categoryToDelete) {
            deleteCategoryMutation.mutate(categoryToDelete);
          }
          setCategoryToDelete(null);
        }}
        onCancel={() => setCategoryToDelete(null)}
      />
    </div>
  );
}
