import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { lt } from 'date-fns/locale/lt';
import { supabase } from '../../lib/supabase';
import LiveTimer from '../../components/mobile/LiveTimer';

export default function Dashboard() {
  // 1. KPI Stats Query
  const { data: stats } = useQuery({
    queryKey: ['admin_dashboard_stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_dashboard_stats')
        .select('*')
        .single();
      
      if (error) {
        console.error('Error fetching dashboard stats:', error);
        return null;
      }
      return data;
    }
  });

  // 2. Active Sites Query ("Šiandien dirba")
  const { data: activeSites } = useQuery({
    queryKey: ['admin_active_sites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select(`
          id,
          project_code,
          client_name,
          address,
          status,
          site_assignments (
            installer_id,
            is_lead,
            user_profiles (
              full_name,
              avatar_url
            )
          ),
          time_entries (
            id,
            installer_id,
            start_time,
            end_time,
            duration_minutes
          )
        `)
        .eq('status', 'in_progress')
        .order('scheduled_start', { ascending: false });

      if (error) {
        console.error('Error fetching active sites:', error);
        return [];
      }
      return data;
    }
  });

  // 3. Activity Feed Query ("Veiklos žurnalas")
  const { data: activityFeed } = useQuery({
    queryKey: ['admin_activity_feed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          id,
          start_time,
          end_time,
          installer_id,
          site_id,
          user_profiles (
            full_name
          ),
          sites (
            client_name,
            project_code
          )
        `)
        .order('start_time', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching activity feed:', error);
        return [];
      }
      return data;
    }
  });

  // Formatting hours
  const formatHours = (totalMinutes: number = 0) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes > 0 ? `${minutes}min` : ''}`;
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-4 gap-6">
        {/* Card 1: Aktyvūs objektai */}
        <div className="bg-white rounded-[16px] shadow-[0px_4px_20px_rgba(29,3,58,0.05)] p-6 border border-[#cdc3d4]/20 relative">
          <div className="absolute top-6 right-6 w-10 h-10 bg-[#ecdcff] rounded-full flex items-center justify-center text-[#490891]">
            <span className="material-symbols-outlined">location_on</span>
          </div>
          <p className="text-[14px] font-medium text-[#4b4452] mb-2">Aktyvūs objektai</p>
          <div className="flex items-baseline gap-3">
            <h3 className="text-[32px] font-bold text-[#1d033a] leading-none">{stats?.active_sites || 0}</h3>
          </div>
        </div>

        {/* Card 2: Dirba dabar */}
        <div className="bg-white rounded-[16px] shadow-[0px_4px_20px_rgba(29,3,58,0.05)] p-6 border border-[#cdc3d4]/20 relative">
          <div className="absolute top-6 right-6 w-10 h-10 bg-[#ECFDF5] rounded-full flex items-center justify-center text-[#10B981]">
            <span className="material-symbols-outlined">groups</span>
          </div>
          <p className="text-[14px] font-medium text-[#4b4452] mb-2">Dirba dabar</p>
          <h3 className="text-[32px] font-bold text-[#1d033a] leading-none mb-1">
            {stats?.working_now || 0} <span className="text-[14px] font-bold text-[#4b4452]">monteriai</span>
          </h3>
        </div>

        {/* Card 3: Šiandien užbaigta */}
        <div className="bg-white rounded-[16px] shadow-[0px_4px_20px_rgba(29,3,58,0.05)] p-6 border border-[#cdc3d4]/20 relative">
          <div className="absolute top-6 right-6 w-10 h-10 bg-[#f6e9ff] rounded-full flex items-center justify-center text-[#4b4452]">
            <span className="material-symbols-outlined">task_alt</span>
          </div>
          <p className="text-[14px] font-medium text-[#4b4452] mb-2">Šiandien užbaigta</p>
          <h3 className="text-[32px] font-bold text-[#1d033a] leading-none mb-1">{stats?.completed_today || 0}</h3>
        </div>

        {/* Card 4: Savaitės valandos */}
        <div className="bg-white rounded-[16px] shadow-[0px_4px_20px_rgba(29,3,58,0.05)] p-6 border border-[#cdc3d4]/20 relative">
          <div className="absolute top-6 right-6 w-10 h-10 bg-[#ecdcff] rounded-full flex items-center justify-center text-[#490891]">
            <span className="material-symbols-outlined">timer</span>
          </div>
          <p className="text-[14px] font-medium text-[#4b4452] mb-2">Šios sav. valandos</p>
          <div className="flex items-baseline gap-3">
            <h3 className="text-[32px] font-bold text-[#1d033a] leading-none">
              {formatHours(stats?.weekly_hours || 0)}
            </h3>
          </div>
        </div>
      </div>

      {/* Row 2: Split 60/40 */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left: Šiandien dirba */}
        <div className="col-span-7 bg-white rounded-[16px] shadow-[0px_4px_20px_rgba(29,3,58,0.05)] border border-[#cdc3d4]/20 p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <h3 className="text-[18px] font-bold text-[#1d033a]">Šiandien dirba</h3>
              <div className="w-2 h-2 bg-[#fc391d] rounded-full animate-pulse"></div>
            </div>
            <Link to="/admin/sites" className="text-[14px] font-semibold text-[#490891] hover:underline">Visi objektai →</Link>
          </div>
          
          <div className="space-y-4">
            {activeSites?.map((site: any) => {
              // Find the lead installer or the first installer to use their ID for LiveTimer
              const assignments = site.site_assignments || [];
              const leadAssignment = assignments.find((a: any) => a.is_lead) || assignments[0];
              const leadInstallerId = leadAssignment?.installer_id;

              return (
                <div key={site.id} className="flex items-center p-3 rounded-[12px] border border-[#cdc3d4]/40 hover:border-[#490891]/30 transition-colors">
                  <div className="w-3 h-3 bg-[#10B981] rounded-full animate-pulse mr-4 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  <div className="flex-1">
                    <h4 className="text-[15px] font-bold text-[#1d033a]">{site.client_name || 'Nežinomas klientas'}</h4>
                    <div className="flex gap-2 items-center mt-1">
                      <span className="bg-[#fbf0ff] border border-[#cdc3d4]/50 text-[11px] font-semibold px-2 py-0.5 rounded-full text-[#4b4452]">
                        {site.project_code || 'B/N'}
                      </span>
                      <span className="text-[13px] text-[#4b4452] font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">schedule</span> 
                        {leadInstallerId ? (
                          <LiveTimer entries={site.time_entries || []} installerId={leadInstallerId} />
                        ) : (
                          "0h 0min 0s"
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex -space-x-2 mr-2">
                      {assignments.map((assignment: any, index: number) => {
                        const name = assignment.user_profiles?.full_name || 'Vartotojas';
                        return (
                          <div 
                            key={assignment.installer_id || index}
                            className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold ${
                              assignment.is_lead ? 'bg-[#490891] text-white z-20' : 'bg-[#b71500] text-white z-10'
                            }`}
                            title={name}
                          >
                            {getInitials(name)}
                          </div>
                        );
                      })}
                    </div>
                    <Link to={`/admin/sites/${site.id}`} className="text-[#490891] font-semibold text-[14px] hover:underline">
                      Žiūrėti
                    </Link>
                  </div>
                </div>
              );
            })}
            
            {(!activeSites || activeSites.length === 0) && (
              <div className="text-center py-6 text-[#4b4452]">Šiuo metu aktyvių objektų nėra.</div>
            )}
          </div>
        </div>

        {/* Right: Map Placeholder */}
        <div className="col-span-5 bg-white rounded-[16px] shadow-[0px_4px_20px_rgba(29,3,58,0.05)] border border-[#cdc3d4]/20 p-6 flex flex-col">
          <h3 className="text-[18px] font-bold text-[#1d033a] mb-4">Aktyvūs objektai žemėlapyje</h3>
          <div className="flex-1 bg-[#f6f5fa] rounded-[12px] border border-[#cdc3d4]/40 flex items-center justify-center relative min-h-[200px] overflow-hidden">
            {/* Fake map background */}
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, #4b4452 10px, #4b4452 11px)' }}></div>
            {/* Dots */}
            <div className="absolute top-[40%] left-[30%] w-3 h-3 bg-[#10B981] rounded-full shadow-[0_0_0_4px_rgba(16,185,129,0.2)]"></div>
            <div className="absolute top-[60%] right-[40%] w-3 h-3 bg-[#fc391d] rounded-full shadow-[0_0_0_4px_rgba(252,57,29,0.2)] animate-pulse"></div>
            <div className="absolute top-[70%] right-[20%] w-3 h-3 bg-[#490891] rounded-full shadow-[0_0_0_4px_rgba(73,8,145,0.2)]"></div>
            <span className="text-[#4b4452] font-medium text-[14px] relative z-10 bg-white/80 px-3 py-1 rounded">Lietuvos žemėlapis (Placeholder)</span>
          </div>
        </div>
      </div>

      {/* Row 3: Activity feed */}
      <div className="bg-white rounded-[16px] shadow-[0px_4px_20px_rgba(29,3,58,0.05)] border border-[#cdc3d4]/20 p-6">
        <div className="flex items-center gap-3 mb-6">
          <h3 className="text-[18px] font-bold text-[#1d033a]">Veiklos žurnalas</h3>
          <span className="bg-[#FFF1F0] text-[#fc391d] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border border-[#fc391d]/20 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-[#fc391d] rounded-full animate-pulse"></span>
            LIVE
          </span>
        </div>
        
        <div className="relative pl-[22px] space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-[#cdc3d4]/40">
          
          {activityFeed?.map((entry: any) => {
            const isFinished = !!entry.end_time;
            const timeAgo = formatDistanceToNow(new Date(isFinished ? entry.end_time : entry.start_time), { 
              addSuffix: true, 
              locale: lt 
            });
            const name = entry.user_profiles?.full_name || 'Nežinomas montuotojas';
            const siteName = entry.sites?.client_name || entry.sites?.project_code || 'Nežinomas objektas';
            
            return (
              <div key={entry.id} className="relative">
                <div className={`absolute -left-[22px] w-6 h-6 rounded-full border-[3px] border-white flex items-center justify-center ${
                  isFinished ? 'bg-[#ECFDF5]' : 'bg-[#ecdcff]'
                }`}>
                  <span className={`material-symbols-outlined text-[14px] ${
                    isFinished ? 'text-[#10B981]' : 'text-[#490891]'
                  }`}>
                    {isFinished ? 'done_all' : 'login'}
                  </span>
                </div>
                <p className="text-[14px] text-[#1d033a]">
                  <span className="font-bold">{name}</span> 
                  <span className="text-[#4b4452] text-[12px] ml-2 capitalize">{timeAgo}</span>
                </p>
                <p className="text-[14px] text-[#4b4452] mt-1">
                  {isFinished ? 'užbaigė montavimo darbus' : 'pradėjo darbus objekte'}{' '}
                  <Link to={`/admin/sites/${entry.site_id}`} className="text-[#490891] hover:underline font-medium">
                    {siteName}
                  </Link>
                </p>
              </div>
            );
          })}

          {(!activityFeed || activityFeed.length === 0) && (
            <p className="text-[#4b4452] text-[14px]">Įvykių nerasta.</p>
          )}

        </div>
      </div>
    </div>
  );
}
