import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import * as Sentry from "@sentry/react";
import { toast } from 'sonner';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { FolderCog, RefreshCw, Plus, Camera, Edit2, Trash2, X } from 'lucide-react';

type ChecklistTemplate = {
  id: string;
  name: string;
  phase: 'pre' | 'post';
  requires_photo: boolean;
  category: string;
};


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
    phase: 'pre' as 'pre' | 'post',
    requires_photo: false,
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
        .order('phase', { ascending: false })
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data as ChecklistTemplate[];
    }
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('checklist_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checklist_templates'] });
    },
    onError: (err) => {
      console.error("Delete error:", err); Sentry.captureException(err, { extra: { context: "Delete error:" } });
      toast.error("Nepavyko ištrinti šablono.");
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

  const handleOpenModal = (item?: ChecklistTemplate) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        phase: item.phase,
        requires_photo: item.requires_photo,
        category: item.category || '',
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        phase: 'pre',
        requires_photo: false,
        category: categories && categories.length > 0 ? categories[0]?.name || '' : '',
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
    saveMutation.mutate(formData);
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

  const activeTabs = ['Visi', ...(categories?.map(c => c.name) || [])];

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-[20px] font-bold text-[#1d033a]">Checklist'ų šablonai</h2>
          <p className="text-[14px] text-[#4b4452]">Valdykite pre ir post darbų užduotis</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="h-[40px] px-4 font-semibold text-[14px] rounded-[8px] border border-[#cdc3d4] text-[#1d033a] bg-white hover:bg-[#f6f5fa] transition-colors flex items-center gap-2"
          >
            <FolderCog size={18} />
            Valdyti grupes
          </button>
          <button 
            onClick={handleSync}
            className="h-[40px] px-4 font-semibold text-[14px] rounded-[8px] border border-[#cdc3d4] text-[#1d033a] bg-white hover:bg-[#f6f5fa] transition-colors flex items-center gap-2"
          >
            <RefreshCw size={18} />
            Pritaikyti naujiems objektams
          </button>
          <button 
            onClick={() => handleOpenModal()}
            className="h-[40px] px-4 font-semibold text-[14px] rounded-[8px] bg-[#490891] text-white hover:bg-[#8052b2] transition-colors shadow-sm flex items-center gap-2"
          >
            <Plus size={18} />
            Pridėti naują punktą
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#cdc3d4]/30 gap-6 overflow-x-auto scrollbar-hide">
        {activeTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveCategory(tab)}
            className={`py-3 text-[14px] font-bold transition-colors border-b-2 -mb-[1px] whitespace-nowrap ${
              activeCategory === tab 
                ? 'border-[#490891] text-[#490891]' 
                : 'border-transparent text-[#4b4452] hover:text-[#1d033a]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-[16px] shadow-[0px_4px_20px_rgba(29,3,58,0.05)] border border-[#cdc3d4]/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#cdc3d4]/30 bg-[#fbf0ff]">
                <th className="py-3 px-6 text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider">Pavadinimas</th>
                <th className="py-3 px-6 text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider">Fazė</th>
                <th className="py-3 px-6 text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider">Kategorija</th>
                <th className="py-3 px-6 text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider text-center">Nuotrauka</th>
                <th className="py-3 px-6 text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider text-right">Veiksmai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#cdc3d4]/20">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#4b4452]">Kraunama...</td>
                </tr>
              ) : templates && templates.length > 0 ? (
                templates
                  .filter((item) => activeCategory === 'Visi' || item.category === activeCategory)
                  .map((item) => (
                  <tr key={item.id} className="hover:bg-[#f6f5fa] transition-colors group">
                    <td className="py-4 px-6 text-[14px] font-medium text-[#1d033a]">{item.name}</td>
                    <td className="py-4 px-6">
                      <span className={`px-2.5 py-1 rounded-[6px] text-[12px] font-bold uppercase tracking-wide border ${
                        item.phase === 'pre' 
                          ? 'bg-[#ecdcff] text-[#490891] border-[#490891]/20' 
                          : 'bg-[#ffdad6] text-[#ba1a1a] border-[#ba1a1a]/20'
                      }`}>
                        {item.phase}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="bg-[#f6f5fa] text-[#4b4452] px-2.5 py-1 rounded-[6px] text-[12px] font-bold uppercase tracking-wide border border-[#cdc3d4]/50">
                        {item.category || '-'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      {item.requires_photo ? (
                        <span className="bg-[#ECFDF5] rounded-full p-1 border border-[#10B981]/20 inline-flex items-center justify-center">
                          <Camera className="text-[#10B981] w-4 h-4" />
                        </span>
                      ) : (
                        <span className="text-[#cdc3d4] text-[14px]">-</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleOpenModal(item)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[#7c7484] hover:text-[#490891] hover:bg-[#ecdcff] transition-colors"
                          title="Redaguoti"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[#7c7484] hover:text-[#e2250a] hover:bg-[#ffdad6] transition-colors"
                          title="Trinti"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#4b4452]">Šablonų nerasta.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit/Add Template Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#cdc3d4]/30">
              <h3 className="text-[18px] font-bold text-[#1d033a]">
                {editingItem ? 'Redaguoti punktą' : 'Pridėti naują punktą'}
              </h3>
              <button 
                onClick={closeModal}
                className="text-[#7c7484] hover:text-[#1d033a] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Pavadinimas</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="Šablono užduotis..."
                  className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-[#490891] focus:ring-1 focus:ring-[#490891]"
                />
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Fazė</label>
                <select 
                  required
                  value={formData.phase}
                  onChange={e => setFormData({...formData, phase: e.target.value as 'pre' | 'post'})}
                  className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-[#490891] focus:ring-1 focus:ring-[#490891]"
                >
                  <option value="pre">Pre (prieš pradžią)</option>
                  <option value="post">Post (pabaigus darbus)</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Grupė / Kategorija</label>
                <select 
                  required
                  value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value})}
                  className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-[#490891] focus:ring-1 focus:ring-[#490891]"
                >
                  <option value="">-- Pasirinkti --</option>
                  {categories?.map((cat) => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input 
                  type="checkbox"
                  id="requires_photo"
                  checked={formData.requires_photo}
                  onChange={e => setFormData({...formData, requires_photo: e.target.checked})}
                  className="w-4 h-4 text-[#490891] border-[#cdc3d4] rounded focus:ring-[#490891]"
                />
                <label htmlFor="requires_photo" className="text-[14px] font-medium text-[#1d033a]">Reikalauja nuotraukos</label>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] border border-[#cdc3d4] text-[#4b4452] hover:bg-[#f6f5fa] transition-colors"
                >
                  Atšaukti
                </button>
                <button 
                  type="submit" 
                  disabled={saveMutation.isPending}
                  className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] bg-[#490891] text-white hover:bg-[#8052b2] transition-colors flex items-center justify-center disabled:opacity-70"
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
          <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#cdc3d4]/30 flex-shrink-0">
              <h3 className="text-[18px] font-bold text-[#1d033a]">Valdyti grupes</h3>
              <button 
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-[#7c7484] hover:text-[#1d033a] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-2 mb-6">
                {isLoadingCategories ? (
                  <p className="text-[14px] text-[#4b4452] text-center">Kraunama...</p>
                ) : categories && categories.length > 0 ? (
                  categories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between bg-[#f6f5fa] px-4 py-3 rounded-[8px] border border-[#cdc3d4]/50">
                      <span className="font-semibold text-[#1d033a] text-[14px]">{cat.name}</span>
                      <button 
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="text-[#7c7484] hover:text-[#e2250a] transition-colors p-1 rounded-full hover:bg-[#ffdad6]"
                        title="Trinti grupę"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-[14px] text-[#4b4452] text-center">Grupių nerasta.</p>
                )}
              </div>

              <form onSubmit={handleAddCategory} className="flex gap-2 border-t border-[#cdc3d4]/30 pt-6">
                <input 
                  type="text"
                  required
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Naujos grupės pavadinimas"
                  className="flex-1 h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-[#490891] focus:ring-1 focus:ring-[#490891]"
                />
                <button 
                  type="submit"
                  disabled={addCategoryMutation.isPending || !newCategoryName.trim()}
                  className="h-[44px] px-4 font-semibold text-[14px] rounded-[8px] bg-[#490891] text-white hover:bg-[#8052b2] transition-colors disabled:opacity-70 flex-shrink-0"
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
        title="Ištrinti šabloną"
        message="Ar tikrai norite trinti šį šabloną?"
        confirmText="Ištrinti"
        cancelText="Atšaukti"
        variant="danger"
        onConfirm={() => {
          if (templateToDelete) {
            deleteMutation.mutate(templateToDelete);
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
