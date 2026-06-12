import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isSameWeek, isSameMonth } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { startWork } from '../../api/timeTracking';
import { getInstallerSites } from '../../api/sites';
import { useAuthStore } from '../../stores/authStore';
import SiteCard from '../../components/mobile/SiteCard';
import * as Sentry from "@sentry/react";
import { toast } from 'sonner';
import { FolderOpen } from 'lucide-react';

export default function Sites() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  
  const [statusFilter, setStatusFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');

  const { data: sitesData, isLoading } = useQuery({
    queryKey: ['my-sites-all', profile?.id],
    queryFn: async () => {
      const assignedSites = await getInstallerSites(profile?.id as string);
      
      // Sort locally by scheduled_start descending
      const sortedSites = [...assignedSites];
      sortedSites.sort((a, b) => {
        if (!a.scheduled_start) return 1;
        if (!b.scheduled_start) return -1;
        return new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime();
      });
      
      return sortedSites;
    },
    enabled: !!profile?.id,
    staleTime: 60_000,
  });

  const startWorkMutation = useMutation({
    mutationFn: async (siteId: string) => {
      await startWork(siteId);
      return siteId;
    },
    onSuccess: (_, siteId) => { 
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['my-sites-all'] }); 
      void queryClient.invalidateQueries({ queryKey: ['my-sites-today'] });
      void queryClient.invalidateQueries({ queryKey: ['installer_sites'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_active_sites_online'] });
      void queryClient.invalidateQueries({ queryKey: ['admin_activity_feed'] });
      setStatusFilter('in_progress');
      void navigate(`/m/sites/${siteId}`);
    },
    onError: (error) => {
      console.error('Error starting work:', error); Sentry.captureException(error, { extra: { context: 'Error starting work:' } });
      toast.error('Nepavyko pradėti darbo.');
    }
  });

  const getFilteredSites = () => {
    if (!sitesData) return [];
    
    return sitesData.filter(site => {
      // Status Filter
      if (statusFilter !== 'all' && site.status !== statusFilter) {
        return false;
      }
      
      // Time Filter
      if (timeFilter !== 'all' && site.scheduled_start) {
        const siteDate = new Date(site.scheduled_start);
        const now = new Date();
        
        if (timeFilter === 'this_week' && !isSameWeek(siteDate, now, { weekStartsOn: 1 })) {
          return false;
        }
        if (timeFilter === 'this_month' && !isSameMonth(siteDate, now)) {
          return false;
        }
      }
      
      return true;
    });
  };

  const filteredSites = getFilteredSites();

  return (
    <div className="pb-20">
      <div className="bg-white dark:bg-[#18181b] px-4 pt-8 pb-4 shadow-sm sticky top-0 z-20">
        <h2 className="text-on-surface font-bold text-2xl mb-4">Visi objektai</h2>
        
        {/* Status Filters */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${
              statusFilter === 'all' 
                ? 'bg-primary text-white' 
                : 'bg-app-bg text-on-surface-variant hover:bg-outline-variant/30'
            }`}
          >
            Visi
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${
              statusFilter === 'pending' 
                ? 'bg-primary text-white' 
                : 'bg-app-bg text-on-surface-variant hover:bg-outline-variant/30'
            }`}
          >
            Ateinantys
          </button>
          <button
            onClick={() => setStatusFilter('in_progress')}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${
              statusFilter === 'in_progress' 
                ? 'bg-primary text-white' 
                : 'bg-app-bg text-on-surface-variant hover:bg-outline-variant/30'
            }`}
          >
            Aktyvūs
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${
              statusFilter === 'completed' 
                ? 'bg-primary text-white' 
                : 'bg-app-bg text-on-surface-variant hover:bg-outline-variant/30'
            }`}
          >
            Užbaigti
          </button>
        </div>

        {/* Time Filters */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setTimeFilter('all')}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${
              timeFilter === 'all' 
                ? 'bg-[#4b4452] text-white' 
                : 'bg-app-bg text-on-surface-variant hover:bg-outline-variant/30'
            }`}
          >
            Visi laikai
          </button>
          <button
            onClick={() => setTimeFilter('this_week')}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${
              timeFilter === 'this_week' 
                ? 'bg-[#4b4452] text-white' 
                : 'bg-app-bg text-on-surface-variant hover:bg-outline-variant/30'
            }`}
          >
            Ši savaitė
          </button>
          <button
            onClick={() => setTimeFilter('this_month')}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${
              timeFilter === 'this_month' 
                ? 'bg-[#4b4452] text-white' 
                : 'bg-app-bg text-on-surface-variant hover:bg-outline-variant/30'
            }`}
          >
            Šis mėnuo
          </button>
        </div>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <>
            <div className="rounded-2xl bg-white dark:bg-[#18181b] animate-pulse h-48 mx-4 mb-3"></div>
            <div className="rounded-2xl bg-white dark:bg-[#18181b] animate-pulse h-48 mx-4 mb-3"></div>
          </>
        ) : filteredSites.length > 0 ? (
          filteredSites.map((site) => (
            <SiteCard 
              key={site.id} 
              site={site} 
              onStartWork={() => startWorkMutation.mutate(site.id)}
            />
          ))
        ) : (
          <div className="mx-4 text-center py-12">
            <FolderOpen className="w-12 h-12 text-[#b69cd3] mx-auto opacity-80" />
            <p className="text-on-surface-variant mt-2 font-medium">
              Nerasta jokių objektų
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
