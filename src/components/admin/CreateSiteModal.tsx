import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import * as Sentry from "@sentry/react";
import { toast } from 'sonner';
import { X, Loader2 } from 'lucide-react';
import { getTeams } from '../../api/installers';

// ── Nominatim geocoding (free, no key required) ──────────────────────────────
interface NominatimResult { lat: string; lon: string; }

async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'lt,en', 'User-Agent': 'InstallerApp/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const results = (await res.json()) as NominatimResult[];
    if (!results.length || !results[0]) return null;
    return {
      latitude:  parseFloat(results[0].lat),
      longitude: parseFloat(results[0].lon),
    };
  } catch (err) {
    console.warn('[Geocode] Failed to geocode address:', err);
    return null;
  }
}

interface CreateSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SiteFormData {
  code: string;
  name: string;
  address: string;
  scheduled_start: string;
  category: string;
  system_type: string;
  team_id: string;
  roof_type: string;
  roof_material: string;
  roof_angle: string;
}

export default function CreateSiteModal({ isOpen, onClose }: CreateSiteModalProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<SiteFormData>({
    code: '',
    name: '',
    address: '',
    scheduled_start: '',
    category: '',
    system_type: 'PV',
    team_id: '',
    roof_type: '',
    roof_material: '',
    roof_angle: '',
  });

  // Fetch teams for dropdown
  const { data: teams } = useQuery({
    queryKey: ['admin_teams'],
    queryFn: getTeams,
    enabled: isOpen,
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
      // 1. Geocode the address (best-effort; null coords are acceptable)
      const coords = data.address.trim()
        ? await geocodeAddress(data.address)
        : null;
      if (coords) {
        console.log('[Geocode] Resolved', data.address, '→', coords);
      } else {
        console.warn('[Geocode] No coordinates found for:', data.address);
      }

      // 2. Insert into sites
      // Guard against RangeError from new Date('').toISOString()
      const startDate = new Date(data.scheduled_start);
      if (isNaN(startDate.getTime())) {
        throw new Error(`Neteisinga pradžios data: "${data.scheduled_start}"`);
      }

      const { data: newSite, error: siteError } = await supabase
        .from('sites')
        .insert({
          code:            data.code.trim(),
          client_name:     data.name.trim(),
          address:         data.address.trim(),
          latitude:        coords?.latitude  ?? null,
          longitude:       coords?.longitude ?? null,
          scheduled_start: startDate.toISOString(),
          system_type:     data.system_type,
          status:          'pending',
          team_id:         data.team_id || null,
          roof_type:       data.roof_type || null,
          roof_material:   data.roof_material || null,
          roof_angle:      data.roof_angle || null,
        })
        .select()
        .single();
        
      if (siteError) throw siteError;

      // 3. Checklist Sync — Session model (SolarGrade Phase 8A)
      if (data.category) {
        const { data: templates, error: templatesError } = await supabase
          .from('checklist_templates')
          .select('*')
          .eq('category', data.category)
          .order('phase', { ascending: true })
          .order('name', { ascending: true });

        if (templatesError) throw templatesError;

        if (templates && templates.length > 0) {
          // 3a. Create one session record
          const { data: session, error: sessionError } = await supabase
            .from('site_checklists')
            .insert({ site_id: newSite.id, status: 'pending' })
            .select()
            .single();
          if (sessionError) throw sessionError;

          // 3b. Snapshot each template item into site_checklist_items
          const items = templates.map(t => ({
            site_checklist_id: session.id,
            question_text: t.name,
            category: t.category ?? null,
            phase: t.phase ?? null,
            is_required: t.requires_photo ?? false,
            status: 'pending' as const,
          }));
          const { error: itemsError } = await supabase
            .from('site_checklist_items')
            .insert(items);
          if (itemsError) throw itemsError;
        }
      }

      // Return the new site so onSuccess receives its id
      return newSite;
    },
    onSuccess: (newSite) => {
      toast.success('Objektas sėkmingai sukurtas!');
      const siteId = newSite.id;
      setTimeout(() => {
        void navigate(`/admin/sites/${siteId}`);
        onClose();
        void queryClient.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
        void queryClient.invalidateQueries({ queryKey: ['admin_active_sites'] });
        void queryClient.invalidateQueries({ queryKey: ['admin_all_sites'] });
        void queryClient.invalidateQueries({ queryKey: ['sites'] });
        setFormData({
          code: '',
          name: '',
          address: '',
          scheduled_start: '',
          category: '',
          system_type: 'PV',
          team_id: '',
          roof_type: '',
          roof_material: '',
          roof_angle: '',
        });
      }, 0);
    },
    onError: (err) => {
      // err can be a PostgrestError, RangeError, or generic Error — handle all
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      console.error('[CreateSite] Failed:', err);
      Sentry.captureException(err, { extra: { context: 'Error creating site' } });
      toast.error(`Klaida kuriant objektą: ${message}`);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // ── Explicit JS validation ─────────────────────────────────────────────
    // Browser's native validation bubbles are clipped by the modal's
    // overflow-hidden wrapper and are invisible to the user, so we validate
    // here and surface errors as toasts instead.
    if (!formData.code.trim()) {
      toast.error('Įveskite objekto kodą.');
      return;
    }
    if (!formData.name.trim()) {
      toast.error('Įveskite objekto pavadinimą (kliento vardą).');
      return;
    }
    if (!formData.address.trim()) {
      toast.error('Įveskite objekto adresą.');
      return;
    }
    if (!formData.scheduled_start) {
      toast.error('Pasirinkite planuojamą pradžios datą.');
      return;
    }
    if (!formData.category) {
      toast.error('Pasirinkite checklist kategoriją.');
      return;
    }

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
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* noValidate: browser tooltip bubbles are clipped by overflow-hidden;
            validation is handled explicitly in handleSubmit with toast feedback */}
        <form onSubmit={handleSubmit} noValidate className="p-6 overflow-y-auto space-y-4 flex-1">
          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Objekto kodas</label>
            <input 
              type="text" 
              required
              value={formData.code}
              onChange={e => setFormData({...formData, code: e.target.value})}
              placeholder="Pvz.: SITE-005"
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
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
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
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
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Planuojama pradžia</label>
            <input 
              type="datetime-local" 
              required
              value={formData.scheduled_start}
              onChange={e => setFormData({...formData, scheduled_start: e.target.value})}
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Sistemos tipas</label>
            <select 
              required
              value={formData.system_type}
              onChange={e => setFormData({...formData, system_type: e.target.value})}
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="PV">Saulės elektrinė (PV)</option>
              <option value="PV+BESS">Saulės elektrinė + Baterija (PV+BESS)</option>
              <option value="BESS">Baterija (BESS)</option>
              <option value="OTHER">Šilumos siurblys / Kita</option>
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Komanda</label>
            <select
              value={formData.team_id}
              onChange={e => setFormData({...formData, team_id: e.target.value})}
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="">Nepriskirta</option>
              {teams?.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Kategorija (Checklist)</label>
            <select 
              required
              value={formData.category}
              onChange={e => setFormData({...formData, category: e.target.value})}
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="">-- Pasirinkti --</option>
              {categories?.map((cat) => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Stogo tipas</label>
            <select
              value={formData.roof_type}
              onChange={e => setFormData({...formData, roof_type: e.target.value})}
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="">-- Pasirinkti --</option>
              <option value="Plokščias">Plokščias</option>
              <option value="Šlaitinis">Šlaitinis</option>
              <option value="Ant žemės">Ant žemės</option>
              <option value="Netaikoma">Netaikoma</option>
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Stogo danga</label>
            <input
              type="text"
              value={formData.roof_material}
              onChange={e => setFormData({...formData, roof_material: e.target.value})}
              placeholder="Įvesti arba pasirinkti..."
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['Bitumas', 'Čerpės', 'Trapecinė skarda', 'Klasikinė / Falcai', 'Šiferis', 'Netaikoma'].map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setFormData({...formData, roof_material: opt})}
                  className={`px-2.5 py-1 rounded-[6px] text-[12px] font-medium border transition-colors cursor-pointer ${
                    formData.roof_material === opt
                      ? 'bg-primary text-white border-primary'
                      : 'bg-[#f6f5fa] text-[#4b4452] border-[#cdc3d4] hover:border-primary/50 hover:text-primary'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] uppercase tracking-wider mb-2">Stogo nuolydis</label>
            <select
              value={formData.roof_angle}
              onChange={e => setFormData({...formData, roof_angle: e.target.value})}
              className="w-full h-[44px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="">-- Pasirinkti --</option>
              <option value="Iki 30°">Iki 30°</option>
              <option value="Virš 30°">Virš 30°</option>
              <option value="Plokščias (0° - 10°)">Plokščias (0° - 10°)</option>
              <option value="Netaikoma">Netaikoma</option>
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
              className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] bg-primary text-white hover:bg-primary/80 transition-colors flex items-center justify-center disabled:opacity-70"
            >
              {createSiteMutation.isPending ? (
                <Loader2 className="animate-spin w-5 h-5" />
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
