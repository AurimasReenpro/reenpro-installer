import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import * as Sentry from "@sentry/react";

interface CreateSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SiteFormData {
  code: string;
  name: string;
  address: string;
  scheduled_start: string;
  installer_id: string;
  category: string;
  system_type: string;
}

export default function CreateSiteModal({ isOpen, onClose }: CreateSiteModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<SiteFormData>({
    code: '',
    name: '',
    address: '',
    scheduled_start: '',
    installer_id: '',
    category: '',
    system_type: 'PV'
  });

  // Fetch installers for dropdown
  const { data: installers } = useQuery({
    queryKey: ['installers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('role', 'installer');
      if (error) throw error;
      return data;
    }
  });

  // Fetch categories for dropdown
  const { data: categories } = useQuery({
    queryKey: ['checklist_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_categories')
        .select('*');
      if (error) throw error;
      return data;
    }
  });

  // Create site mutation
  const createSiteMutation = useMutation({
    mutationFn: async (data: SiteFormData) => {
      // 1. Insert into sites
      const { data: newSite, error: siteError } = await supabase
        .from('sites')
        .insert({
          code: data.code,
          client_name: data.name,
          address: data.address,
          scheduled_start: new Date(data.scheduled_start).toISOString(),
          system_type: data.system_type,
          status: 'pending'
        })
        .select()
        .single();
        
      if (siteError) throw siteError;

      // 2. Insert into site_assignments
      if (data.installer_id) {
        const { error: assignmentError } = await supabase
          .from('site_assignments')
          .insert({
            site_id: newSite.id,
            installer_id: data.installer_id,
            is_lead: true
          });
        if (assignmentError) throw assignmentError;
      }

      // 3. Checklist Sync
      if (data.category) {
        const { data: templates, error: templatesError } = await supabase
          .from('checklist_templates')
          .select('*')
          .eq('category', data.category);
          
        if (templatesError) throw templatesError;
        
        if (templates && templates.length > 0) {
          const newChecklists = templates.map(t => ({
            site_id: newSite.id,
            phase: t.phase || 'pre',
            task_name: t.name,
            requires_photo: t.requires_photo,
            category: t.category
          }));
          const { error: checklistError } = await supabase
            .from('site_checklists')
            .insert(newChecklists);
          if (checklistError) throw checklistError;
        }
      }
    },
    onSuccess: () => {
      alert('Objektas sėkmingai sukurtas!');
      void queryClient.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_active_sites'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_all_sites'] });
      void queryClient.invalidateQueries({ queryKey: ['sites'] });
      onClose();
      setFormData({
        code: '',
        name: '',
        address: '',
        scheduled_start: '',
        installer_id: '',
        category: '',
        system_type: 'PV'
      });
    },
    onError: (error: Error) => {
      console.error('Error creating site:', error); Sentry.captureException(error, { extra: { context: 'Error creating site:' } });
      alert(`Nepavyko sukurti objekto: ${error.message || JSON.stringify(error)}`);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createSiteMutation.mutate(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#cdc3d4]/30 flex-shrink-0">
          <h3 className="text-[18px] font-bold text-[#1d033a]">Sukurti naują objektą</h3>
          <button 
            onClick={onClose}
            className="text-[#7c7484] hover:text-[#1d033a] transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Objekto kodas</label>
            <input 
              type="text" 
              required
              value={formData.code}
              onChange={e => setFormData({...formData, code: e.target.value})}
              placeholder="Pvz.: SITE-005"
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-[#490891] focus:ring-1 focus:ring-[#490891]"
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Pavadinimas</label>
            <input 
              type="text" 
              required
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder="Pvz.: UAB Saulės Energija"
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-[#490891] focus:ring-1 focus:ring-[#490891]"
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Adresas</label>
            <input 
              type="text" 
              required
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
              placeholder="Pvz.: Vilniaus g. 1, Vilnius"
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-[#490891] focus:ring-1 focus:ring-[#490891]"
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Planuojama pradžia</label>
            <input 
              type="datetime-local" 
              required
              value={formData.scheduled_start}
              onChange={e => setFormData({...formData, scheduled_start: e.target.value})}
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-[#490891] focus:ring-1 focus:ring-[#490891]"
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Sistemos tipas</label>
            <select 
              required
              value={formData.system_type}
              onChange={e => setFormData({...formData, system_type: e.target.value})}
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-[#490891] focus:ring-1 focus:ring-[#490891]"
            >
              <option value="PV">Saulės elektrinė (PV)</option>
              <option value="PV+BESS">Saulės elektrinė + Baterija (PV+BESS)</option>
              <option value="BESS">Baterija (BESS)</option>
              <option value="OTHER">Šilumos siurblys / Kita</option>
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Montuotojas</label>
            <select 
              required
              value={formData.installer_id}
              onChange={e => setFormData({...formData, installer_id: e.target.value})}
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-[#490891] focus:ring-1 focus:ring-[#490891]"
            >
              <option value="">-- Pasirinkti --</option>
              {installers?.map((user) => (
                <option key={user.id} value={user.id}>{user.full_name || user.email}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Kategorija (Checklist)</label>
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

          <div className="pt-4 flex gap-3 flex-shrink-0">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] border border-[#cdc3d4] text-[#4b4452] hover:bg-[#f6f5fa] transition-colors"
            >
              Atšaukti
            </button>
            <button 
              type="submit" 
              disabled={createSiteMutation.isPending}
              className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] bg-[#490891] text-white hover:bg-[#8052b2] transition-colors flex items-center justify-center disabled:opacity-70"
            >
              {createSiteMutation.isPending ? (
                <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
              ) : (
                'Sukurti'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
