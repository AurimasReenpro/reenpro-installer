import { lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import WorkingTodayPanel, { type WorkingEntry } from '../../components/admin/WorkingTodayPanel';
import { formatDistanceToNow } from 'date-fns';
import { lt } from 'date-fns/locale/lt';
import { supabase } from '../../lib/supabase';
import * as Sentry from "@sentry/react";
import { Plus, MapPin, Users, CheckCircle2, Timer, CheckCheck, LogIn, Pause, Loader2 } from 'lucide-react';
import { useCreateBlankSite } from '../../hooks/useCreateSite';
import { getCompanySettings } from '../../api/settings';

const SiteMap = lazy(() => import('../../components/admin/SiteMap'));

export default function Dashboard() {
  const { createBlankSite, isCreating } = useCreateBlankSite();
  const navigate = useNavigate();

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
          time_entries(*, installer:user_profiles(full_name, avatar_url)),
          site_checklists(site_checklist_items(status))
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
    queryFn: getCompanySettings,
    staleTime: 5 * 60_000, // 5 min — rarely changes
  });

  // Derive base coords: DB → fallback to Lithuania center (handled inside SiteMap)
  const mapBaseCoords =
    companySettings?.warehouse_lat && companySettings?.warehouse_lng
      ? {
          lat: Number(companySettings.warehouse_lat),
          lng: Number(companySettings.warehouse_lng),
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
      team: s.team,
    })),
    ...(pendingSites ?? []).map(s => ({
      id: s.id,
      client_name: s.client_name,
      code: s.code,
      status: s.status,
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
      team: s.team,
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

  // Map the live active sites → the WorkingTodayPanel shape (real data).
  const workingEntries: WorkingEntry[] = (activeSites ?? []).map((site) => {
    const tEntries = (site.time_entries ?? []) as unknown as Array<{
      start_time: string;
      end_time: string | null;
      installer?: { full_name: string | null; avatar_url: string | null } | null;
    }>;
    const open = tEntries.find((e) => !e.end_time);
    const latest = open ?? [...tEntries].sort((a, b) => +new Date(b.start_time) - +new Date(a.start_time))[0];

    const checklists = (site.site_checklists ?? []) as unknown as Array<{
      site_checklist_items?: Array<{ status: string | null }>;
    }>;
    const items = checklists.flatMap((c) => c.site_checklist_items ?? []);
    const done = items.filter((i) => i.status === 'pass' || i.status === 'n_a').length;

    return {
      id: site.id,
      installerName: latest?.installer?.full_name || site.team?.name || 'Monteris',
      avatarUrl: latest?.installer?.avatar_url ?? null,
      siteName: site.address || site.client_name || '—',
      siteCode: site.code || 'B/N',
      startTime: latest?.start_time ?? site.actual_start ?? new Date().toISOString(),
      // "Online" = actively in progress with an open (unclosed) time entry; paused → offline dot.
      isOnline: site.status === 'in_progress' && !!open,
      lastPhotoAt: null,
      checklistDone: done,
      checklistTotal: items.length,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Apžvalga</h2>
        <button
          onClick={() => { void createBlankSite(); }}
          disabled={isCreating}
          className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 transition-all shadow-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isCreating ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
          {isCreating ? 'Kuriama...' : 'Sukurti naują objektą'}
        </button>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-4 gap-5">
        {/* Card 1: Aktyvūs objektai */}
        <div className="bg-white dark:bg-[#18181b] border border-gray-100 dark:border-white/10 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">Aktyvūs objektai</p>
            <div className="bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 p-2 rounded-xl shrink-0">
              <MapPin size={18} />
            </div>
          </div>
          <h3 className="text-4xl font-extrabold text-gray-900 dark:text-gray-100 mt-4 tracking-tight">{stats?.active_sites || 0}</h3>
        </div>

        {/* Card 2: Dirba dabar */}
        <div className="bg-white dark:bg-[#18181b] border border-gray-100 dark:border-white/10 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">Dirba dabar</p>
            <div className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-2 rounded-xl shrink-0">
              <Users size={18} />
            </div>
          </div>
          <h3 className="text-4xl font-extrabold text-gray-900 dark:text-gray-100 mt-4 tracking-tight">
            {stats?.installers_online || 0}
            <span className="text-sm font-semibold text-gray-400 ml-2">monteriai</span>
          </h3>
        </div>

        {/* Card 3: Šiandien užbaigta */}
        <div className="bg-white dark:bg-[#18181b] border border-gray-100 dark:border-white/10 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">Šiandien užbaigta</p>
            <div className="bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 p-2 rounded-xl shrink-0">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <h3 className="text-4xl font-extrabold text-gray-900 dark:text-gray-100 mt-4 tracking-tight">{stats?.completed_today || 0}</h3>
        </div>

        {/* Card 4: Savaitės valandos */}
        <div className="bg-white dark:bg-[#18181b] border border-gray-100 dark:border-white/10 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">Šios sav. valandos</p>
            <div className="bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 p-2 rounded-xl shrink-0">
              <Timer size={18} />
            </div>
          </div>
          <h3 className="text-4xl font-extrabold text-gray-900 dark:text-gray-100 mt-4 tracking-tight">
            {formatHours(stats?.weekly_minutes || 0)}
          </h3>
        </div>
      </div>

      {/* Row 2: Split 60/40 */}
      <div className="grid grid-cols-12 gap-5">
        {/* Left: Šiandien dirba — premium live ops panel */}
        <div className="col-span-7">
          <WorkingTodayPanel
            entries={workingEntries}
            onSelect={(e) => { void navigate(e.id ? `/admin/sites/${e.id}` : '/admin/sites'); }}
            onOpenMap={() => { void navigate('/admin/schedule'); }}
          />
        </div>

        {/* Right: Live Map */}
        <div className="col-span-5 bg-white dark:bg-[#18181b] border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[17px] font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Objektai žemėlapyje</h3>
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

      {/* Row 3: Activity feed — spacious Apple-style timeline */}
      <div className="bg-white dark:bg-[#18181b] border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-3">
          <h3 className="text-[17px] font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Veiklos žurnalas</h3>
          <span className="bg-[#FFF1F0] text-[#fc391d] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-[#fc391d] rounded-full animate-pulse"></span>
            LIVE
          </span>
        </div>

        {(!activityFeed || activityFeed.length === 0) ? (
          <p className="text-gray-400 dark:text-gray-500 text-[14px] py-8">Įvykių nerasta.</p>
        ) : (
          <div className="relative border-l-2 border-gray-100 dark:border-white/10 ml-4 my-6">
            {activityFeed.map((entry, index) => {
              // activeSites contains only 'in_progress' and 'paused' sites.
              // If a site is NOT in activeSites and its latest entry is finished → it was completed.
              const activeSiteIds = new Set((activeSites ?? []).map(s => s.id));
              const isFinished = !!entry.end_time;
              const isLatestForSite = activityFeed.findIndex(e => e.site_id === entry.site_id) === index;
              const siteIsStillActive = entry.site_id ? activeSiteIds.has(entry.site_id) : false;

              const isCompleted = isFinished && isLatestForSite && (
                !siteIsStillActive || entry.site_status === 'completed'
              );
              const isPaused = isFinished && !isCompleted;

              const timeStr = entry.latest_action_time || (isFinished ? entry.end_time : entry.start_time);
              const timeAgo = formatDistanceToNow(new Date(timeStr!), { addSuffix: true, locale: lt });
              const name = entry.installer_name || 'Nežinomas montuotojas';
              const siteName = entry.client_name || entry.site_code || 'Nežinomas objektas';

              // Per-type icon + soft circle border colour (one purple family, semantic accents)
              let Icon = LogIn;
              let iconColor = 'text-purple-600';
              let borderColor = 'border-purple-100 dark:border-purple-900/50';
              let actionText = 'pradėjo darbus objekte';

              if (isCompleted) {
                Icon = CheckCheck;
                iconColor = 'text-emerald-600';
                borderColor = 'border-emerald-100 dark:border-emerald-900/50';
                actionText = 'užbaigė darbus objekte';
              } else if (isPaused) {
                Icon = Pause;
                iconColor = 'text-amber-600';
                borderColor = 'border-amber-100 dark:border-amber-900/50';
                actionText = 'pristabdė darbus objekte';
              }

              return (
                <div key={entry.id} className="relative pl-8 pb-8 last:pb-0">
                  <div className={`absolute -left-3.5 top-0 w-7 h-7 rounded-full bg-white dark:bg-[#18181b] border-2 ${borderColor} flex items-center justify-center`}>
                    <Icon size={12} className={iconColor} />
                  </div>
                  <p className="text-sm leading-relaxed">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{name}</span>
                    <span className="text-gray-400 dark:text-gray-500 text-xs ml-2 capitalize">{timeAgo}</span>
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">
                    {actionText}{' '}
                    {entry.site_id ? (
                      <Link to={`/admin/sites/${entry.site_id}`} className="text-purple-600 hover:text-purple-700 transition-colors font-medium">
                        {siteName}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-700 dark:text-gray-300">{siteName}</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
