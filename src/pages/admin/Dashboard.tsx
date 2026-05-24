import { useState, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { lt } from 'date-fns/locale/lt';
import { supabase } from '../../lib/supabase';
import LiveAdminTimer from '../../components/admin/LiveAdminTimer';
import CreateSiteModal from '../../components/admin/CreateSiteModal';
import * as Sentry from "@sentry/react";
import { Plus, MapPin, Users, CheckCircle2, Timer, Clock, CheckCheck, LogIn, Pause } from 'lucide-react';

const SiteMap = lazy(() => import('../../components/admin/SiteMap'));

export default function Dashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 1. KPI Stats Query
  const { data: stats } = useQuery({
    queryKey: ['admin_dashboard_stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_dashboard_stats')
        .select('*')
        .single();
      
      if (error) {
        console.error('Error fetching dashboard stats:', error); Sentry.captureException(error, { extra: { context: 'Error fetching dashboard stats:' } });
        return null;
      }
      return data;
    }
  });

  // 2. Active Sites Query ("Šiandien dirba")
  const { data: activeSites } = useQuery({
    queryKey: ['admin_active_sites_online'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select(`
          *,
          team:teams(name),
          time_entries(*)
        `)
        .in('status', ['in_progress', 'paused'])
        .order('scheduled_start', { ascending: false });

      if (error) {
        console.error('Error fetching active sites:', error); Sentry.captureException(error, { extra: { context: 'Error fetching active sites:' } });
        return [];
      }
      return data;
    },
    refetchInterval: 10000
  });

  // 2b. Pending Sites Query (for map – upcoming/planned)
  const { data: pendingSites } = useQuery({
    queryKey: ['admin_pending_sites_map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('id, client_name, code, status, latitude, longitude, team:teams(name)')
        .eq('status', 'pending')
        .not('latitude', 'is', null)
        .order('scheduled_start', { ascending: true })
        .limit(30);

      if (error) {
        console.error('Error fetching pending sites for map:', error);
        Sentry.captureException(error, { extra: { context: 'Error fetching pending sites for map' } });
        return [];
      }
      return data;
    },
    refetchInterval: 60_000,
  });

  // 2c. Company settings (for map base coords)
  const { data: companySettings } = useQuery({
    queryKey: ['company_settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('base_lat, base_lng, company_name')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      if (error) {
        console.error('Error fetching company settings:', error);
        return null;
      }
      return data;
    },
    staleTime: 5 * 60_000, // 5 min — rarely changes
  });

  // Derive base coords: DB → fallback to Kaunas
  const mapBaseCoords =
    companySettings?.base_lat && companySettings?.base_lng
      ? {
          lat: Number(companySettings.base_lat),
          lng: Number(companySettings.base_lng),
          label: companySettings.company_name ?? 'Įmonės sandėlis',
        }
      : null;

  // Combine active + pending for the map
  const mapSites = [
    ...(activeSites ?? []).map(s => ({
      id: s.id,
      client_name: s.client_name,
      code: s.code,
      status: s.status,
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
      team: s.team as unknown as { name: string } | null,
    })),
    ...(pendingSites ?? []).map(s => ({
      id: s.id,
      client_name: s.client_name,
      code: s.code,
      status: s.status,
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
      team: s.team as unknown as { name: string } | null,
    })),
  ];

  // 3. Activity Feed Query ("Veiklos žurnalas")
  const { data: activityFeed } = useQuery({
    queryKey: ['admin_activity_feed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_activity_view')
        .select('*')
        .limit(15);

      if (error) {
        console.error('Error fetching activity feed:', error); Sentry.captureException(error, { extra: { context: 'Error fetching activity feed:' } });
        return [];
      }
      return data;
    },
    staleTime: 10_000,
  });

  // Formatting hours
  const formatHours = (totalMinutes: number = 0) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes > 0 ? `${minutes}min` : ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-[24px] font-bold text-[#1d033a]">Apžvalga</h2>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="h-[40px] px-4 font-semibold text-[14px] rounded-[8px] bg-primary text-white hover:bg-primary/80 transition-colors shadow-sm flex items-center gap-2"
        >
          <Plus size={18} />
          Sukurti naują objektą
        </button>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-4 gap-6">
        {/* Card 1: Aktyvūs objektai */}
        <div className="bg-white rounded-[16px] shadow-[0px_4px_20px_rgba(29,3,58,0.05)] p-6 border border-[#cdc3d4]/20 relative">
          <div className="absolute top-6 right-6 w-10 h-10 bg-[#ecdcff] rounded-full flex items-center justify-center text-primary">
            <MapPin size={20} />
          </div>
          <p className="text-[14px] font-medium text-[#4b4452] mb-2">Aktyvūs objektai</p>
          <div className="flex items-baseline gap-3">
            <h3 className="text-[32px] font-bold text-[#1d033a] leading-none">{stats?.active_sites || 0}</h3>
          </div>
        </div>

        {/* Card 2: Dirba dabar */}
        <div className="bg-white rounded-[16px] shadow-[0px_4px_20px_rgba(29,3,58,0.05)] p-6 border border-[#cdc3d4]/20 relative">
          <div className="absolute top-6 right-6 w-10 h-10 bg-[#ECFDF5] rounded-full flex items-center justify-center text-[#10B981]">
            <Users size={20} />
          </div>
          <p className="text-[14px] font-medium text-[#4b4452] mb-2">Dirba dabar</p>
          <h3 className="text-[32px] font-bold text-[#1d033a] leading-none mb-1">
            {stats?.installers_online || 0} <span className="text-[14px] font-bold text-[#4b4452]">monteriai</span>
          </h3>
        </div>

        {/* Card 3: Šiandien užbaigta */}
        <div className="bg-white rounded-[16px] shadow-[0px_4px_20px_rgba(29,3,58,0.05)] p-6 border border-[#cdc3d4]/20 relative">
          <div className="absolute top-6 right-6 w-10 h-10 bg-[#f6e9ff] rounded-full flex items-center justify-center text-[#4b4452]">
            <CheckCircle2 size={20} className="text-primary" />
          </div>
          <p className="text-[14px] font-medium text-[#4b4452] mb-2">Šiandien užbaigta</p>
          <h3 className="text-[32px] font-bold text-[#1d033a] leading-none mb-1">{stats?.completed_today || 0}</h3>
        </div>

        {/* Card 4: Savaitės valandos */}
        <div className="bg-white rounded-[16px] shadow-[0px_4px_20px_rgba(29,3,58,0.05)] p-6 border border-[#cdc3d4]/20 relative">
          <div className="absolute top-6 right-6 w-10 h-10 bg-[#ecdcff] rounded-full flex items-center justify-center text-primary">
            <Timer size={20} />
          </div>
          <p className="text-[14px] font-medium text-[#4b4452] mb-2">Šios sav. valandos</p>
          <div className="flex items-baseline gap-3">
            <h3 className="text-[32px] font-bold text-[#1d033a] leading-none">
              {formatHours(stats?.weekly_minutes || 0)}
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
            <Link to="/admin" className="text-[14px] font-semibold text-primary hover:underline">Visi objektai →</Link>
          </div>
          
          <div className="space-y-4">
            {activeSites?.map((site) => {
              const timeEntries = site.time_entries as unknown as Array<{ start_time: string; end_time: string | null }> | undefined;
              const openTimeEntry = timeEntries?.find((e) => !e.end_time);
              const team = site.team as unknown as { name: string } | null;

              let timeDisplayText = '';
              if (openTimeEntry?.start_time) {
                try {
                  const startDate = new Date(openTimeEntry.start_time);
                  const hh = String(startDate.getHours()).padStart(2, '0');
                  const mm = String(startDate.getMinutes()).padStart(2, '0');
                  timeDisplayText = `Dirba nuo ${hh}:${mm}`;
                } catch {
                  timeDisplayText = 'Dirba';
                }
              }

              return (
                <div key={site.id} className="flex items-center p-3 rounded-[12px] border border-[#cdc3d4]/40 hover:border-primary/30 transition-colors">
                  <div className={`w-3 h-3 rounded-full mr-4 shadow-sm ${
                    site.status === 'paused' 
                      ? 'bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.5)]' 
                      : 'bg-[#10B981] animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  }`}></div>
                  <div className="flex-1">
                    <h4 className="text-[15px] font-bold text-[#1d033a]">{site.client_name || 'Nežinomas klientas'}</h4>
                    <div className="flex gap-2 items-center mt-1">
                      <span className="bg-[#fbf0ff] border border-[#cdc3d4]/50 text-[11px] font-semibold px-2 py-0.5 rounded-full text-[#4b4452]">
                        {site.code || 'B/N'}
                      </span>
                      <span className="text-[13px] text-[#4b4452] font-medium flex flex-wrap gap-2 items-center">
                        {site.status === 'paused' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-bold bg-[#fff7ed] text-[#ea580c] border border-[#ffedd5]">
                            Pristabdyta
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <Clock size={14} className="text-[#4b4452]" /> 
                          <LiveAdminTimer entries={timeEntries} />
                          {openTimeEntry?.start_time && timeDisplayText && (
                            <>
                              <span className="text-[#cdc3d4]">|</span>
                              <span className="text-[12px] font-normal text-[#4b4452]/80">{timeDisplayText}</span>
                            </>
                          )}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {team ? (
                      <span className="bg-[#fbf0ff] border border-[#cdc3d4]/50 text-[12px] font-bold px-2.5 py-1 rounded-md text-primary">
                        {team.name}
                      </span>
                    ) : (
                      <span className="text-[#cdc3d4] text-[13px] italic">Nepriskirta</span>
                    )}
                    <Link to={`/admin/sites/${site.id}`} className="text-primary font-semibold text-[14px] hover:underline">
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

        {/* Right: Live Map */}
        <div className="col-span-5 bg-white rounded-[16px] shadow-[0px_4px_20px_rgba(29,3,58,0.05)] border border-[#cdc3d4]/20 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[18px] font-bold text-[#1d033a]">Objektai žemėlapyje</h3>
            <div className="flex items-center gap-3 text-[11px] font-semibold">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#10B981] inline-block"></span>Vyksta</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] inline-block"></span>Sustabdyta</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#9CA3AF] inline-block"></span>Planuojama</span>
            </div>
          </div>
          <div className="flex-1 rounded-[12px] overflow-hidden border border-[#cdc3d4]/40 min-h-[320px]">
            <Suspense
              fallback={
                <div className="w-full h-full min-h-[320px] flex items-center justify-center bg-[#f6f5fa] rounded-[12px]">
                  <div className="flex flex-col items-center gap-2 text-[#4b4452]">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-[13px]">Kraunamas žemėlapis…</span>
                  </div>
                </div>
              }
            >
              <SiteMap sites={mapSites} baseCoords={mapBaseCoords} />
            </Suspense>
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
          
          {activityFeed?.map((entry, index) => {
            // activeSites contains only 'in_progress' and 'paused' sites.
            // If a site is NOT in activeSites and its latest entry is finished → it was completed.
            const activeSiteIds = new Set((activeSites ?? []).map(s => s.id));
            const isFinished = !!entry.end_time;
            const isLatestForSite = activityFeed.findIndex(e => e.site_id === entry.site_id) === index;
            const siteIsStillActive = entry.site_id ? activeSiteIds.has(entry.site_id) : false;

            // A closed entry is a completion if:
            //   1. It's the latest entry for that site (not a historical pause)
            //   2. The site is no longer in the active/paused list (i.e. it's completed)
            //   OR site_status explicitly says 'completed' (when migration is applied)
            const isCompleted = isFinished && isLatestForSite && (
              !siteIsStillActive || entry.site_status === 'completed'
            );
            const isPaused = isFinished && !isCompleted;
            
            const timeStr = entry.latest_action_time || (isFinished ? entry.end_time : entry.start_time);
            const timeAgo = formatDistanceToNow(new Date(timeStr!), { 
              addSuffix: true, 
              locale: lt 
            });
            const name = entry.installer_name || 'Nežinomas montuotojas';
            const siteName = entry.client_name || entry.site_code || 'Nežinomas objektas';
            
            let iconBgClass = 'bg-[#ecdcff]';
            let iconElement = <LogIn size={12} className="text-primary" />;
            let actionText = 'pradėjo darbus objekte';

            if (isCompleted) {
              iconBgClass = 'bg-[#ECFDF5]';
              iconElement = <CheckCheck size={12} className="text-[#10B981]" />;
              actionText = 'užbaigė darbus objekte';
            } else if (isPaused) {
              iconBgClass = 'bg-[#FFFBEB]';
              iconElement = <Pause size={12} className="text-[#D97706]" />;
              actionText = 'pristabdė darbus objekte';
            }
            
            return (
              <div key={entry.id} className="relative">
                <div className={`absolute -left-[22px] w-6 h-6 rounded-full border-[3px] border-white flex items-center justify-center ${iconBgClass}`}>
                  {iconElement}
                </div>
                <p className="text-[14px] text-[#1d033a]">
                  <span className="font-bold">{name}</span> 
                  <span className="text-[#4b4452] text-[12px] ml-2 capitalize">{timeAgo}</span>
                </p>
                <p className="text-[14px] text-[#4b4452] mt-1">
                  {actionText}{' '}
                  {entry.site_id ? (
                    <Link to={`/admin/sites/${entry.site_id}`} className="text-primary hover:underline font-medium">
                      {siteName}
                    </Link>
                  ) : (
                    <span className="font-medium">{siteName}</span>
                  )}
                </p>
              </div>
            );
          })}

          {(!activityFeed || activityFeed.length === 0) && (
            <p className="text-[#4b4452] text-[14px]">Įvykių nerasta.</p>
          )}

        </div>
      </div>

      <CreateSiteModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </div>
  );
}
