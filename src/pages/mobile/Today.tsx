import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { lt } from 'date-fns/locale/lt';
import { useNavigate } from 'react-router-dom';
import { startWork } from '../../api/timeTracking';
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
      await startWork(siteId);
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

  const activeSites = sitesData?.filter(s => s.status === 'in_progress' || s.status === 'paused') || [];
  const pendingSites = sitesData?.filter(s => s.status !== 'in_progress' && s.status !== 'paused') || [];
  const currentViewSites = activeTab === 'active' ? activeSites : pendingSites;

  return (
    <div>
      {/* Greeting Card */}
      <div className="bg-white rounded-2xl mx-4 mt-4 p-6 shadow-sm">
        <h2 className="text-primary font-bold text-2xl">
          {greeting}, {firstName}! ☀️
        </h2>
        <p className="text-primary-light text-sm mt-1 capitalize">
          {format(new Date(), "yyyy 'm.' MMMM d 'd.,' EEEE", { locale: lt })}
        </p>

      </div>

      {/* Tabs */}
      <div className="mx-4 mt-6 mb-4 flex rounded-xl bg-outline-variant/20 p-1">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 py-2 text-[14px] font-bold rounded-lg transition-colors ${
            activeTab === 'active' 
              ? 'bg-white shadow-sm text-primary' 
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Aktyvūs objektai ({activeSites.length})
        </button>
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`flex-1 py-2 text-[14px] font-bold rounded-lg transition-colors ${
            activeTab === 'upcoming' 
              ? 'bg-white shadow-sm text-primary' 
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Ateinantys ({pendingSites.length})
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
        <div className="mx-4 text-center py-12">
          <div className="flex justify-center mb-2">
            {activeTab === 'active' ? (
              <CheckCircle2 className="w-12 h-12 text-[#b69cd3] opacity-80" />
            ) : (
              <CalendarX className="w-12 h-12 text-[#b69cd3] opacity-80" />
            )}
          </div>
          <p className="text-on-surface-variant mt-2 font-medium">
            {activeTab === 'active' ? 'Šiuo metu aktyvių objektų nėra.' : 'Šiuo metu ateinančių objektų nėra.'}
          </p>
        </div>
      )}
    </div>
  );
}
