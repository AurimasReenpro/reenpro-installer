import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useConfirm } from '../../hooks/useConfirm';
import { toast } from 'sonner';
import * as Sentry from "@sentry/react";
import { Plus, MapPin, Trash2, Search, Loader2 } from 'lucide-react';
import { useCreateBlankSite } from '../../hooks/useCreateSite';

export default function Sites() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { createBlankSite, isCreating } = useCreateBlankSite();
  const [searchQuery, setSearchQuery] = useState('');

  const handleDeleteSite = async (siteId: string) => {
    const ok = await confirm({
      title: 'Ištrinti objektą',
      message: 'Ar tikrai norite ištrinti šį objektą? Šis veiksmas ištrins visus susijusius duomenis ir yra negrįžtamas.',
      confirmText: 'Ištrinti',
      cancelText: 'Atšaukti',
      variant: 'danger',
    });

    if (!ok) return;

    try {
      const { error } = await supabase
        .from('sites')
        .delete()
        .eq('id', siteId);

      if (error) throw error;

      toast.success('Objektas ištrintas');
      void queryClient.invalidateQueries({ queryKey: ['admin_all_sites'] });
    } catch (err) {
      console.error('Error deleting site:', err);
      Sentry.captureException(err, { extra: { context: 'Error deleting site' } });
      toast.error('Nepavyko ištrinti objekto');
    }
  };

  const { data: sites, isLoading } = useQuery({
    queryKey: ['admin_all_sites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select(`
          id,
          code,
          client_name,
          address,
          status,
          scheduled_start,
          team:teams(name)
        `)
        .order('scheduled_start', { ascending: false });

      if (error) {
        console.error('Error fetching sites:', error); Sentry.captureException(error, { extra: { context: 'Error fetching sites:' } });
        return [];
      }
      return data;
    },
    staleTime: 60_000,
  });

  // Instant client-side search across name, address and code (case-insensitive).
  const query = searchQuery.trim().toLowerCase();
  const filteredSites = query
    ? (sites ?? []).filter((site) =>
        [site.client_name, site.address, site.code]
          .some((field) => (field ?? '').toLowerCase().includes(query)),
      )
    : (sites ?? []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_progress':
        return <span className="bg-[#ECFDF5] text-[#10B981] px-2.5 py-1 rounded-full text-[12px] font-bold flex items-center gap-1.5 w-max"><span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse"></span>Vykdomas</span>;
      case 'paused':
        return <span className="bg-[#FFFBEB] text-[#F59E0B] px-2.5 py-1 rounded-full text-[12px] font-bold flex items-center gap-1.5 w-max">Sustabdytas</span>;
      case 'completed':
        return <span className="bg-[#F3F4F6] text-[#6B7280] px-2.5 py-1 rounded-full text-[12px] font-bold flex items-center gap-1.5 w-max">Baigtas</span>;
      case 'pending':
        return <span className="bg-[#F0F9FF] text-[#0284C7] px-2.5 py-1 rounded-full text-[12px] font-bold flex items-center gap-1.5 w-max">Laukia</span>;
      default:
        return <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full text-[12px] font-bold">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Visi Objektai</h2>
        <button
          onClick={() => { void createBlankSite(); }}
          disabled={isCreating}
          className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 transition-all shadow-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isCreating ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
          {isCreating ? 'Kuriama...' : 'Sukurti naują objektą'}
        </button>
      </div>

      {/* Instant search */}
      <div className="relative w-full max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Ieškoti pagal pavadinimą, adresą ar ID..."
          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#18181b] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
        />
      </div>

      <div className="bg-white dark:bg-[#18181b] border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-[#27272a]">
                <th className="py-4 px-6 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Kodas</th>
                <th className="py-4 px-6 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Pavadinimas</th>
                <th className="py-4 px-6 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Adresas</th>
                <th className="py-4 px-6 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Planuojama pradžia</th>
                <th className="py-4 px-6 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Statusas</th>
                <th className="py-4 px-6 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Komanda</th>
                <th className="py-4 px-6 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">Veiksmai</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400 dark:text-gray-500">Kraunama...</td>
                </tr>
              ) : filteredSites.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400 dark:text-gray-500">
                    {query ? `Pagal „${searchQuery}“ objektų nerasta.` : 'Objektų nerasta.'}
                  </td>
                </tr>
              ) : (
                filteredSites.map((site) => {
                  return (
                    <tr key={site.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50/50 dark:hover:bg-[#27272a] transition-colors">
                      <td className="py-4 px-6">
                        <span className="bg-[#fbf0ff] dark:bg-purple-900/30 border border-[#cdc3d4]/50 dark:border-white/10 text-[12px] font-bold px-2.5 py-1 rounded-md text-primary dark:text-purple-300">
                          {site.code}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-bold text-[#1d033a] dark:text-gray-100">{site.client_name}</td>
                      <td className="py-4 px-6 text-[#4b4452] dark:text-gray-400 text-[14px]">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={16} className="text-[#cdc3d4] dark:text-gray-600" />
                          {site.address}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-[#4b4452] dark:text-gray-400 text-[14px] font-medium">
                        {site.scheduled_start ? format(new Date(site.scheduled_start), 'yyyy-MM-dd HH:mm') : '-'}
                      </td>
                      <td className="py-4 px-6">
                        {getStatusBadge(site.status || '')}
                      </td>
                      <td className="py-4 px-6">
                        {(() => {
                          const team = site.team;
                          return team ? (
                            <span className="bg-[#f0fdf4] dark:bg-emerald-900/30 text-[#16a34a] dark:text-emerald-300 border border-[#16a34a]/20 dark:border-emerald-500/20 px-2.5 py-1 rounded-[6px] text-[12px] font-bold">
                              {team.name}
                            </span>
                          ) : (
                            <span className="text-[#cdc3d4] dark:text-gray-600 text-[13px]">Nepriskirta</span>
                          );
                        })()}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link to={`/admin/sites/${site.id}`} className="text-primary dark:text-purple-300 font-semibold text-[14px] hover:underline">
                            Žiūrėti
                          </Link>
                          <button
                            onClick={() => { void handleDeleteSite(site.id); }}
                            className="text-red-500 hover:text-red-700 transition-colors p-1 cursor-pointer"
                            title="Ištrinti objektą"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
