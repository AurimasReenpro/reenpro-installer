import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Network, Pencil, Save, Loader2, Plus, X } from 'lucide-react';
import { updateSiteDetails } from '../../../api/sites';
import type { StringRow } from './types';

/** PV string-parameters table (lives in the Brėžiniai tab). */
export default function StringingSection({
  siteId,
  stringingDetails,
}: {
  siteId: string;
  stringingDetails: unknown;
}) {
  const queryClient = useQueryClient();
  const [localStringRows, setLocalStringRows] = useState<StringRow[] | null>(null);
  const stringRows = localStringRows ?? (stringingDetails as StringRow[] | null) ?? null;
  const [editingStrings, setEditingStrings] = useState(false);

  const saveStringsMutation = useMutation({
    mutationFn: () => updateSiteDetails(siteId, { stringing_details: stringRows }),
    onSuccess: () => {
      toast.success('Stringavimas išsaugotas!');
      setEditingStrings(false);
      void queryClient.invalidateQueries({ queryKey: ['admin_site', siteId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Klaida'),
  });

  return (
    <div className="bg-white dark:bg-[#18181b] rounded-[16px] border border-[#cdc3d4]/20 dark:border-white/10 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[16px] font-bold text-[#1d033a] dark:text-gray-100 flex items-center gap-2">
          <Network size={18} className="text-primary" />
          String parametrų lentelė
        </h2>

        {stringRows === null ? (
          <button
            onClick={() => { setLocalStringRows([]); setEditingStrings(true); }}
            className="h-[34px] px-4 rounded-[8px] bg-primary text-white font-semibold text-[13px] hover:bg-primary/80 transition-colors cursor-pointer"
          >
            Aktyvuoti lentelę
          </button>
        ) : !editingStrings ? (
          <button
            onClick={() => setEditingStrings(true)}
            className="flex items-center gap-2 h-[34px] px-4 rounded-[8px] bg-[#f6f5fa] dark:bg-[#27272a] text-primary font-semibold text-[13px] hover:bg-[#ede8f5] transition-colors cursor-pointer border border-[#cdc3d4]/30 dark:border-white/10"
          >
            <Pencil size={14} />
            Redaguoti
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setEditingStrings(false)}
              disabled={saveStringsMutation.isPending}
              className="h-[34px] px-4 rounded-[8px] border border-[#cdc3d4] dark:border-white/10 text-[#4b4452] dark:text-gray-300 font-semibold text-[13px] hover:bg-[#f6f5fa] transition-colors cursor-pointer"
            >
              Atšaukti
            </button>
            <button
              onClick={() => saveStringsMutation.mutate()}
              disabled={saveStringsMutation.isPending}
              className="flex items-center gap-2 h-[34px] px-4 rounded-[8px] bg-primary text-white font-semibold text-[13px] hover:bg-primary/80 transition-colors cursor-pointer"
            >
              {saveStringsMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : <Save size={14} />}
              Išsaugoti
            </button>
          </div>
        )}
      </div>

      {stringRows !== null && (
        <div className="rounded-[10px] border border-[#cdc3d4]/30 dark:border-white/10 overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead>
              <tr className="bg-[#f6f5fa] dark:bg-[#27272a] border-b border-[#cdc3d4]/30 dark:border-white/10">
                <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] dark:text-gray-400 uppercase tracking-wider">String</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] dark:text-gray-400 uppercase tracking-wider">Moduliai</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] dark:text-gray-400 uppercase tracking-wider">Galia kWp</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] dark:text-gray-400 uppercase tracking-wider">MPPT</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] dark:text-gray-400 uppercase tracking-wider">Orientacija</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#7c7484] dark:text-gray-400 uppercase tracking-wider">Kampas</th>
                {editingStrings && <th className="py-3 px-4 w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {stringRows.length === 0 && !editingStrings ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#7c7484] dark:text-gray-400 text-[13px]">
                    Nėra įvestų stringų.
                  </td>
                </tr>
              ) : (
                stringRows.map((row, i) => (
                  <tr key={i} className="border-b border-[#cdc3d4]/10 last:border-none">
                    {editingStrings ? (
                      <>
                        <td className="p-2"><input value={row.name} onChange={(e) => setLocalStringRows(r => (r ?? stringRows ?? []).map((rw, idx) => idx === i ? { ...rw, name: e.target.value } : rw))} className="w-full h-8 px-2 bg-[#f6f5fa] dark:bg-[#27272a] border border-[#cdc3d4]/50 dark:border-white/10 rounded text-[13px] outline-none focus:border-primary" /></td>
                        <td className="p-2"><input value={row.modules} onChange={(e) => setLocalStringRows(r => (r ?? stringRows ?? []).map((rw, idx) => idx === i ? { ...rw, modules: e.target.value } : rw))} className="w-full h-8 px-2 bg-[#f6f5fa] dark:bg-[#27272a] border border-[#cdc3d4]/50 dark:border-white/10 rounded text-[13px] outline-none focus:border-primary" /></td>
                        <td className="p-2"><input value={row.power} onChange={(e) => setLocalStringRows(r => (r ?? stringRows ?? []).map((rw, idx) => idx === i ? { ...rw, power: e.target.value } : rw))} className="w-full h-8 px-2 bg-[#f6f5fa] dark:bg-[#27272a] border border-[#cdc3d4]/50 dark:border-white/10 rounded text-[13px] outline-none focus:border-primary" /></td>
                        <td className="p-2"><input value={row.mppt} onChange={(e) => setLocalStringRows(r => (r ?? stringRows ?? []).map((rw, idx) => idx === i ? { ...rw, mppt: e.target.value } : rw))} className="w-full h-8 px-2 bg-[#f6f5fa] dark:bg-[#27272a] border border-[#cdc3d4]/50 dark:border-white/10 rounded text-[13px] outline-none focus:border-primary" /></td>
                        <td className="p-2"><input value={row.orientation} onChange={(e) => setLocalStringRows(r => (r ?? stringRows ?? []).map((rw, idx) => idx === i ? { ...rw, orientation: e.target.value } : rw))} className="w-full h-8 px-2 bg-[#f6f5fa] dark:bg-[#27272a] border border-[#cdc3d4]/50 dark:border-white/10 rounded text-[13px] outline-none focus:border-primary" /></td>
                        <td className="p-2"><input value={row.angle} onChange={(e) => setLocalStringRows(r => (r ?? stringRows ?? []).map((rw, idx) => idx === i ? { ...rw, angle: e.target.value } : rw))} className="w-full h-8 px-2 bg-[#f6f5fa] dark:bg-[#27272a] border border-[#cdc3d4]/50 dark:border-white/10 rounded text-[13px] outline-none focus:border-primary" /></td>
                        <td className="p-2 text-center">
                          <button onClick={() => setLocalStringRows(r => (r ?? stringRows ?? []).filter((_, idx) => idx !== i))} className="text-[#cdc3d4] hover:text-red-500 transition-colors"><X size={16}/></button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 px-4 font-semibold text-[#1d033a] dark:text-gray-100 text-[13px]">{row.name}</td>
                        <td className="py-3 px-4 text-[#4b4452] dark:text-gray-300 text-[13px]">{row.modules}</td>
                        <td className="py-3 px-4 text-[#4b4452] dark:text-gray-300 text-[13px]">{row.power}</td>
                        <td className="py-3 px-4 text-[#4b4452] dark:text-gray-300 text-[13px]">
                          <span className="bg-[#fbf0ff] dark:bg-purple-500/10 text-primary px-2 py-0.5 rounded text-[11px] font-semibold border border-primary/10">{row.mppt}</span>
                        </td>
                        <td className="py-3 px-4 text-[#4b4452] dark:text-gray-300 text-[13px]">
                          <span className="bg-[#ECFDF5] text-[#10B981] px-2 py-0.5 rounded text-[11px] font-semibold border border-[#10B981]/10">{row.orientation}</span>
                        </td>
                        <td className="py-3 px-4 text-[#4b4452] dark:text-gray-300 text-[13px]">{row.angle}</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {editingStrings && (
            <div className="p-2 border-t border-[#cdc3d4]/30 dark:border-white/10 bg-[#f6f5fa]/30">
              <button
                onClick={() => setLocalStringRows(r => [...(r ?? stringRows ?? []), { name:'', modules:'', power:'', mppt:'', orientation:'', angle:'' }])}
                className="flex items-center gap-1.5 text-primary font-semibold text-[13px] hover:underline px-2 py-1"
              >
                <Plus size={14}/> Pridėti eilutę
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
