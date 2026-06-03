import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import CreateSiteModal from '../../components/admin/CreateSiteModal';
import { useConfirm } from '../../hooks/useConfirm';
import { toast } from 'sonner';
import * as Sentry from "@sentry/react";
import { Plus, MapPin, Trash2 } from 'lucide-react';

export default function Sites() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [isModalOpen, setIsModalOpen] = useState(false);

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
          system_type,
          team_id,
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
        <h2 className="text-[24px] font-bold text-[#1d033a]">Visi Objektai</h2>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="h-[40px] px-4 font-semibold text-[14px] rounded-[8px] bg-primary text-white hover:bg-primary/80 transition-colors shadow-sm flex items-center gap-2"
        >
          <Plus size={18} />
          Sukurti naują objektą
        </button>
      </div>

      <div className="bg-white rounded-[16px] shadow-[0px_4px_20px_rgba(29,3,58,0.05)] border border-[#cdc3d4]/20 flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#cdc3d4]/40 bg-[#f6f5fa]/50">
                <th className="py-4 px-6 text-[13px] font-bold text-[#4b4452] uppercase tracking-wider">Kodas</th>
                <th className="py-4 px-6 text-[13px] font-bold text-[#4b4452] uppercase tracking-wider">Pavadinimas</th>
                <th className="py-4 px-6 text-[13px] font-bold text-[#4b4452] uppercase tracking-wider">Adresas</th>
                <th className="py-4 px-6 text-[13px] font-bold text-[#4b4452] uppercase tracking-wider">Planuojama pradžia</th>
                <th className="py-4 px-6 text-[13px] font-bold text-[#4b4452] uppercase tracking-wider">Statusas</th>
                <th className="py-4 px-6 text-[13px] font-bold text-[#4b4452] uppercase tracking-wider">Komanda</th>
                <th className="py-4 px-6 text-[13px] font-bold text-[#4b4452] uppercase tracking-wider text-right">Veiksmai</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#4b4452]">Kraunama...</td>
                </tr>
              ) : sites?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#4b4452]">Objektų nerasta.</td>
                </tr>
              ) : (
                sites?.map((site) => {
                  return (
                    <tr key={site.id} className="border-b border-[#cdc3d4]/20 hover:bg-[#f6f5fa]/30 transition-colors">
                      <td className="py-4 px-6">
                        <span className="bg-[#fbf0ff] border border-[#cdc3d4]/50 text-[12px] font-bold px-2.5 py-1 rounded-md text-primary">
                          {site.code}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-bold text-[#1d033a]">{site.client_name}</td>
                      <td className="py-4 px-6 text-[#4b4452] text-[14px]">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={16} className="text-[#cdc3d4]" />
                          {site.address}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-[#4b4452] text-[14px] font-medium">
                        {site.scheduled_start ? format(new Date(site.scheduled_start), 'yyyy-MM-dd HH:mm') : '-'}
                      </td>
                      <td className="py-4 px-6">
                        {getStatusBadge(site.status || '')}
                      </td>
                      <td className="py-4 px-6">
                        {(() => {
                          const team = site.team;
                          return team ? (
                            <span className="bg-[#f0fdf4] text-[#16a34a] border border-[#16a34a]/20 px-2.5 py-1 rounded-[6px] text-[12px] font-bold">
                              {team.name}
                            </span>
                          ) : (
                            <span className="text-[#cdc3d4] text-[13px]">Nepriskirta</span>
                          );
                        })()}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link to={`/admin/sites/${site.id}`} className="text-primary font-semibold text-[14px] hover:underline">
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

      <CreateSiteModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </div>
  );
}
