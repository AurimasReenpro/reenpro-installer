import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfISOWeek } from 'date-fns';
import { lt } from 'date-fns/locale/lt';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import SiteCard from '../../components/mobile/SiteCard';
import type { Site } from '../../components/mobile/SiteCard';

export default function Today() {
  const queryClient = useQueryClient();
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
      const { data, error } = await supabase
        .from('site_assignments')
        .select(`
          is_lead,
          sites!inner (*)
        `)
        .eq('installer_id', profile?.id as string)
        .in('sites.status', ['pending', 'in_progress']);

      if (error) throw error;

      const assignedSites = data?.map((item: any) => item.sites) || [];
      
      // Sort by scheduled_start locally
      assignedSites.sort((a: any, b: any) => {
        if (!a.scheduled_start) return 1;
        if (!b.scheduled_start) return -1;
        return new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime();
      });
      
      return assignedSites as Site[];
    },
    enabled: !!profile?.id // ONLY run if we have a profile ID
  });

  const startWorkMutation = useMutation({
    mutationFn: async (siteId: string) => {
      const { error } = await supabase
        .from('sites')
        .update({ status: 'in_progress' })
        .eq('id', siteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-sites-today'] });
      setActiveTab('active');
    },
    onError: (error) => {
      console.error('Error starting work:', error);
      alert('Nepavyko pradėti darbo.');
    }
  });

  const activeSites = sitesData?.filter(s => s.status === 'in_progress') || [];
  const pendingSites = sitesData?.filter(s => s.status === 'pending') || [];
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
          <span className="material-symbols-outlined text-5xl opacity-80" style={{ color: '#b69cd3' }}>
            {activeTab === 'active' ? 'check_circle' : 'event_busy'}
          </span>
          <p className="text-on-surface-variant mt-2 font-medium">
            {activeTab === 'active' ? 'Šiuo metu aktyvių objektų nėra.' : 'Šiuo metu ateinančių objektų nėra.'}
          </p>
        </div>
      )}
    </div>
  );
}
