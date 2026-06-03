import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { lt } from 'date-fns/locale/lt';
import { useNavigate } from 'react-router-dom';
import { startWork } from '../../api/timeTracking';
import { getCurrentPositionWithTimeout } from '../../lib/geolocation';
import { getInstallerSites } from '../../api/sites';
import { useAuthStore } from '../../stores/authStore';
import SiteCard from '../../components/mobile/SiteCard';
import * as Sentry from "@sentry/react";
import { toast } from 'sonner';
import { CheckCircle2, CalendarX } from 'lucide-react';

export default function Today() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'active' | 'upcoming'>('active');
  const hour = new Date().getHours();

  let greeting = 'Labas vakaras';
  if (hour < 12) greeting = 'Labas rytas';
  else if (hour < 18) greeting = 'Laba diena';

  const firstName = profile?.full_name?.split(' ')[0] || 'Vartotojau';

  // Hours tracking removed from UI as per business logic

  // Sites query
  const { data: sitesData, isLoading: isLoadingSites } = useQuery({
    queryKey: ['my-sites-today', profile?.id],
    queryFn: async () => {
      const assignedSites = await getInstallerSites(profile?.id as string);
      
      // Sort by scheduled_start locally
      const sorted = [...assignedSites];
      sorted.sort((a, b) => {
        if (!a.scheduled_start) return 1;
        if (!b.scheduled_start) return -1;
        return new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime();
      });
      
      return sorted;
    },
    enabled: !!profile?.id, // ONLY run if we have a profile ID
    staleTime: 60_000,
  });

  const startWorkMutation = useMutation({
    mutationFn: async (siteId: string) => {
      // Always attempt GPS capture before starting — keeps clock-in location
      // consistent regardless of which screen the job was started from. Geo is
      // best-effort (resolves null after the timeout) and never blocks the start.
      let pos = null;
      try {
        pos = await getCurrentPositionWithTimeout(10000);
      } catch (geoError) {
        console.warn('Start work geolocation warning:', geoError);
      }
      await startWork(siteId, pos?.lat, pos?.lng);
      return siteId;
    },
    onSuccess: (_, siteId) => {
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['my-sites-today'] });
      void queryClient.invalidateQueries({ queryKey: ['my-sites-all'] });
      void queryClient.invalidateQueries({ queryKey: ['installer_sites'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_active_sites_online'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_activity_feed'] });
      setActiveTab('active');
      void navigate(`/m/sites/${siteId}`);
    },
    onError: (error) => {
      console.error('Error starting work:', error); Sentry.captureException(error, { extra: { context: 'Error starting work:' } });
      toast.error('Nepavyko pradėti darbo.');
    }
  });

  // "Aktyvūs": work currently started/paused. "Ateinantys": assigned but not yet
  // started — and STRICTLY never completed jobs.
  const activeSites = sitesData?.filter(s => s.status === 'in_progress' || s.status === 'paused') || [];
  const upcomingSites = sitesData?.filter(
    s => s.status !== 'in_progress' && s.status !== 'paused' && s.status !== 'completed',
  ) || [];
  const currentViewSites = activeTab === 'active' ? activeSites : upcomingSites;

  return (
    <div>
      {/* Greeting — clean iOS header on the page background (no card) */}
      <div className="px-4 pt-5">
        <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
          {greeting}, {firstName}!
        </h2>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">
          {format(new Date(), "yyyy 'm.' MMMM d 'd.,' EEEE", { locale: lt })}
        </p>
      </div>

      {/* iOS segmented control */}
      <div className="mx-4 mt-5 mb-4 flex rounded-xl bg-gray-100 p-1">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 py-2 text-[14px] font-semibold rounded-md transition-colors ${
            activeTab === 'active' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
          }`}
        >
          Aktyvūs ({activeSites.length})
        </button>
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`flex-1 py-2 text-[14px] font-semibold rounded-md transition-colors ${
            activeTab === 'upcoming' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
          }`}
        >
          Ateinantys ({upcomingSites.length})
        </button>
      </div>

      {isLoadingSites ? (
        <>
          <div className="rounded-2xl bg-white animate-pulse h-48 mx-4 mb-3"></div>
          <div className="rounded-2xl bg-white animate-pulse h-48 mx-4 mb-3"></div>
        </>
      ) : currentViewSites.length > 0 ? (
        currentViewSites.map((site) => (
          <SiteCard 
            key={site.id} 
            site={site} 
            onStartWork={() => startWorkMutation.mutate(site.id)}
          />
        ))
      ) : (
        <div className="mx-4 text-center py-14 flex flex-col items-center gap-2">
          {activeTab === 'active' ? (
            <CheckCircle2 className="w-10 h-10 text-gray-300" />
          ) : (
            <CalendarX className="w-10 h-10 text-gray-300" />
          )}
          <p className="text-[14px] text-gray-400">
            {activeTab === 'active' ? 'Šiuo metu aktyvių objektų nėra.' : 'Šiuo metu ateinančių objektų nėra.'}
          </p>
        </div>
      )}
    </div>
  );
}
