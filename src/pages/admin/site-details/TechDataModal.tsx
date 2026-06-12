import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Cpu, X, Sun, Battery, Loader2, Save } from 'lucide-react';
import { format } from 'date-fns';
import { updateTechData } from '../../../api/sites';
import { ROOF_TYPES, ROOF_ANGLES } from '../../../lib/siteOptions';
import type { SiteWithTeam } from './types';

/** Modal for editing a site's technical data (kWp/kWh, system type, schedule, roof). */
export default function TechDataModal({
  site,
  siteId,
  onClose,
}: {
  site: SiteWithTeam;
  siteId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [techForm, setTechForm] = useState({
    kwp:             site.kwp != null ? String(site.kwp) : '',
    kwh:             site.kwh != null ? String(site.kwh) : '',
    system_type:     site.system_type     ?? 'PV',
    scheduled_start: site.scheduled_start
      ? format(new Date(site.scheduled_start), "yyyy-MM-dd'T'HH:mm")
      : '',
    roof_type:      site.roof_type      ?? '',
    roof_material:  site.roof_material  ?? '',
    roof_angle:     site.roof_angle     ?? '',
  });

  const saveTechMutation = useMutation({
    mutationFn: () => updateTechData(siteId, {
      kwp:             techForm.kwp !== '' ? parseFloat(techForm.kwp) : null,
      kwh:             techForm.kwh !== '' ? parseFloat(techForm.kwh) : null,
      system_type:     techForm.system_type,
      scheduled_start: techForm.scheduled_start
        ? new Date(techForm.scheduled_start).toISOString()
        : null,
      roof_type:      techForm.roof_type      || null,
      roof_material:  techForm.roof_material  || null,
      roof_angle:     techForm.roof_angle     || null,
    }),
    onSuccess: () => {
      toast.success('Techniniai duomenys išsaugoti!');
      onClose();
      void queryClient.invalidateQueries({ queryKey: ['admin_site', siteId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#18181b] rounded-[16px] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#cdc3d4]/30 dark:border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-primary" />
            <h3 className="text-[16px] font-bold text-[#1d033a] dark:text-gray-100">Redaguoti techninius duomenis</h3>
          </div>
          <button
            onClick={onClose}
            disabled={saveTechMutation.isPending}
            className="text-[#7c7484] dark:text-gray-400 hover:text-[#1d033a] transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1.5 text-[13px] font-semibold text-[#4b4452] dark:text-gray-300 uppercase tracking-wider mb-2"><Sun className="w-4 h-4 text-gray-400" /> Galia (kWp)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={techForm.kwp}
                onChange={e => setTechForm(f => ({ ...f, kwp: e.target.value }))}
                placeholder="Pvz.: 10.5"
                className="w-full h-[44px] px-3 bg-[#f6f5fa] dark:bg-[#27272a] border border-[#cdc3d4] dark:border-white/10 rounded-[8px] text-[14px] text-[#1d033a] dark:text-gray-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[13px] font-semibold text-[#4b4452] dark:text-gray-300 uppercase tracking-wider mb-2"><Battery className="w-4 h-4 text-gray-400" /> Baterija (kWh)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={techForm.kwh}
                onChange={e => setTechForm(f => ({ ...f, kwh: e.target.value }))}
                placeholder="Pvz.: 15"
                className="w-full h-[44px] px-3 bg-[#f6f5fa] dark:bg-[#27272a] border border-[#cdc3d4] dark:border-white/10 rounded-[8px] text-[14px] text-[#1d033a] dark:text-gray-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] dark:text-gray-300 uppercase tracking-wider mb-2">Sistemos tipas</label>
            <select
              value={techForm.system_type}
              onChange={e => setTechForm(f => ({ ...f, system_type: e.target.value }))}
              className="w-full h-[44px] px-3 bg-[#f6f5fa] dark:bg-[#27272a] border border-[#cdc3d4] dark:border-white/10 rounded-[8px] text-[14px] text-[#1d033a] dark:text-gray-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="PV">Saulės elektrinė (PV)</option>
              <option value="PV+BESS">Saulės elektrinė + Baterija (PV+BESS)</option>
              <option value="BESS">Baterija (BESS)</option>
              <option value="OTHER">Šilumos siurblys / Kita</option>
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] dark:text-gray-300 uppercase tracking-wider mb-2">Planuojama pradžia</label>
            <input
              type="datetime-local"
              value={techForm.scheduled_start}
              onChange={e => setTechForm(f => ({ ...f, scheduled_start: e.target.value }))}
              className="w-full h-[44px] px-3 bg-[#f6f5fa] dark:bg-[#27272a] border border-[#cdc3d4] dark:border-white/10 rounded-[8px] text-[14px] text-[#1d033a] dark:text-gray-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] dark:text-gray-300 uppercase tracking-wider mb-2">Stogo tipas</label>
            <select
              value={techForm.roof_type}
              onChange={e => setTechForm(f => ({ ...f, roof_type: e.target.value }))}
              className="w-full h-[44px] px-3 bg-[#f6f5fa] dark:bg-[#27272a] border border-[#cdc3d4] dark:border-white/10 rounded-[8px] text-[14px] text-[#1d033a] dark:text-gray-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="">-- Pasirinkti --</option>
              {ROOF_TYPES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] dark:text-gray-300 uppercase tracking-wider mb-2">Stogo danga</label>
            <input
              type="text"
              value={techForm.roof_material}
              onChange={e => setTechForm(f => ({ ...f, roof_material: e.target.value }))}
              placeholder="Įvesti arba pasirinkti..."
              className="w-full h-[44px] px-3 bg-[#f6f5fa] dark:bg-[#27272a] border border-[#cdc3d4] dark:border-white/10 rounded-[8px] text-[14px] text-[#1d033a] dark:text-gray-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['Bitumas', 'Čerpės', 'Trapecinė skarda', 'Klasikinė / Falcai', 'Šiferis', 'Netaikoma'].map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setTechForm(f => ({ ...f, roof_material: opt }))}
                  className={`px-2.5 py-1 rounded-[6px] text-[12px] font-medium border transition-colors cursor-pointer ${
                    techForm.roof_material === opt
                      ? 'bg-primary text-white border-primary'
                      : 'bg-[#f6f5fa] dark:bg-[#27272a] text-[#4b4452] dark:text-gray-300 border-[#cdc3d4] dark:border-white/10 hover:border-primary/50 hover:text-primary'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#4b4452] dark:text-gray-300 uppercase tracking-wider mb-2">Stogo nuolydis</label>
            <select
              value={techForm.roof_angle}
              onChange={e => setTechForm(f => ({ ...f, roof_angle: e.target.value }))}
              className="w-full h-[44px] px-3 bg-[#f6f5fa] dark:bg-[#27272a] border border-[#cdc3d4] dark:border-white/10 rounded-[8px] text-[14px] text-[#1d033a] dark:text-gray-100 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="">-- Pasirinkti --</option>
              {ROOF_ANGLES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
        </div>

        <div className="px-6 pb-6 pt-4 flex gap-3 flex-shrink-0 border-t border-[#cdc3d4]/20 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={saveTechMutation.isPending}
            className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] border border-[#cdc3d4] dark:border-white/10 text-[#4b4452] dark:text-gray-300 hover:bg-[#f6f5fa] transition-colors disabled:opacity-60 cursor-pointer"
          >
            Atšaukti
          </button>
          <button
            type="button"
            onClick={() => saveTechMutation.mutate()}
            disabled={saveTechMutation.isPending}
            className="flex-1 h-[44px] font-semibold text-[14px] rounded-[8px] bg-primary text-white hover:bg-primary/80 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-70 cursor-pointer"
          >
            {saveTechMutation.isPending ? (
              <Loader2 className="animate-spin w-5 h-5" />
            ) : (
              <>
                <Save size={15} />
                Išsaugoti
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
