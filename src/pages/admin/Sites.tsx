import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import CreateSiteModal from '../../components/admin/CreateSiteModal';

export default function Sites() {
  const [isModalOpen, setIsModalOpen] = useState(false);

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
          site_assignments (
            installer_id,
            is_lead,
            user_profiles (
              full_name
            )
          )
        `)
        .order('scheduled_start', { ascending: false });

      if (error) {
        console.error('Error fetching sites:', error);
        return [];
      }
      return data;
    }
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
          className="h-[40px] px-4 font-semibold text-[14px] rounded-[8px] bg-[#490891] text-white hover:bg-[#8052b2] transition-colors shadow-sm flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
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
                <th className="py-4 px-6 text-[13px] font-bold text-[#4b4452] uppercase tracking-wider">Montuotojas</th>
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
                sites?.map((site: any) => {
                  const leadAssignment = site.site_assignments?.find((a: any) => a.is_lead) || site.site_assignments?.[0];
                  const installerName = leadAssignment?.user_profiles?.full_name || 'Nepriskirtas';
                  
                  return (
                    <tr key={site.id} className="border-b border-[#cdc3d4]/20 hover:bg-[#f6f5fa]/30 transition-colors">
                      <td className="py-4 px-6">
                        <span className="bg-[#fbf0ff] border border-[#cdc3d4]/50 text-[12px] font-bold px-2.5 py-1 rounded-md text-[#490891]">
                          {site.code}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-bold text-[#1d033a]">{site.client_name}</td>
                      <td className="py-4 px-6 text-[#4b4452] text-[14px]">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-[#cdc3d4]">location_on</span>
                          {site.address}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-[#4b4452] text-[14px] font-medium">
                        {site.scheduled_start ? format(new Date(site.scheduled_start), 'yyyy-MM-dd HH:mm') : '-'}
                      </td>
                      <td className="py-4 px-6">
                        {getStatusBadge(site.status)}
                      </td>
                      <td className="py-4 px-6 text-[#4b4452] text-[14px] font-medium flex items-center gap-2">
                        {leadAssignment && (
                          <div className="w-6 h-6 rounded-full bg-[#490891] text-white flex items-center justify-center text-[10px] font-bold">
                            {installerName.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        {installerName}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <Link to={`/admin/sites/${site.id}`} className="text-[#490891] font-semibold text-[14px] hover:underline" title="Funkcija ruošiama">
                          Žiūrėti
                        </Link>
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
