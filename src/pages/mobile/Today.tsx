import { useQuery } from '@tanstack/react-query';
import { format, startOfISOWeek } from 'date-fns';
import { lt } from 'date-fns/locale/lt';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import SiteCard from '../../components/mobile/SiteCard';
import type { Site } from '../../components/mobile/SiteCard';

export default function Today() {
  const { profile } = useAuthStore();
  const hour = new Date().getHours();

  let greeting = 'Labas vakaras';
  if (hour < 12) greeting = 'Labas rytas';
  else if (hour < 18) greeting = 'Laba diena';

  const firstName = profile?.full_name?.split(' ')[0] || 'Vartotojau';

  // Hours query
  const { data: hoursData, isLoading: isLoadingHours } = useQuery({
    queryKey: ['weeklyHours', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const startOfWeek = startOfISOWeek(new Date());
      const { data, error } = await supabase
        .from('time_entries')
        .select('duration_minutes')
        .eq('installer_id', profile.id)
        .gte('start_time', startOfWeek.toISOString())
        .not('duration_minutes', 'is', null);

      if (error) {
        console.error('Error fetching time_entries', error);
        return 0;
      }

      const entries = data as Array<{ duration_minutes: number | null }> | null;
      return entries?.reduce((sum: number, e) => sum + (e.duration_minutes || 0), 0) ?? 0;
    },
    enabled: !!profile?.id,
  });

  const totalMinutes = hoursData || 0;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // Sites query
  const { data: sitesData, isLoading: isLoadingSites } = useQuery({
    queryKey: ['my-sites-today', profile?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('site_assignments')
        .select(`
          is_lead,
          sites!inner (*)
        `)
        .eq('installer_id', profile?.id as string)
        .gte('sites.scheduled_start', `${today}T00:00:00.000Z`)
        .lte('sites.scheduled_start', `${today}T23:59:59.999Z`);

      if (error) throw error;

      const assignedSites = data?.map((item: any) => item.sites) || [];
      return assignedSites as Site[];
    },
    enabled: !!profile?.id // ONLY run if we have a profile ID
  });

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

        <div className="bg-app-bg rounded-xl p-4 mt-4 flex items-center justify-between">
          <div>
            <div className="text-primary-light text-xs font-semibold uppercase">
              Šios savaitės valandos
            </div>
            <div className="text-primary font-bold text-2xl mt-0.5">
              {isLoadingHours ? (
                <span className="animate-pulse bg-outline-variant/30 h-8 w-24 rounded inline-block mt-1"></span>
              ) : (
                `${hours}h ${minutes}min`
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary">
            <span className="material-symbols-outlined">schedule</span>
          </div>
        </div>
      </div>

      {/* Sites Section */}
      <div className="mx-4 mt-6 mb-3">
        <h3 className="text-on-surface font-bold text-lg">
          Šiandien dirbti: {sitesData?.length || 0} objektai
        </h3>
      </div>

      {isLoadingSites ? (
        <>
          <div className="rounded-2xl bg-white animate-pulse h-48 mx-4 mb-3"></div>
          <div className="rounded-2xl bg-white animate-pulse h-48 mx-4 mb-3"></div>
        </>
      ) : sitesData && sitesData.length > 0 ? (
        sitesData.map((site) => <SiteCard key={site.id} site={site} />)
      ) : (
        <div className="mx-4 text-center py-12">
          <span className="material-symbols-outlined text-5xl opacity-80" style={{ color: '#b69cd3' }}>
            event_busy
          </span>
          <p className="text-on-surface-variant mt-2 font-medium">Šiandien objektų nėra</p>
          <Link to="/m/sites" className="text-primary font-semibold mt-4 inline-block active:scale-95 transition-transform">
            Žiūrėti visus →
          </Link>
        </div>
      )}
    </div>
  );
}
