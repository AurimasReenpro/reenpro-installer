import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useIsMutating, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { lt } from 'date-fns/locale/lt';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileText,
  FileWarning,
  Loader2,
  MapPin,
  Pause,
  Play,
  Plus,
  Users,
  WalletCards,
} from 'lucide-react';
import { useCreateBlankSite } from '../../hooks/useCreateSite';
import { AdminPageError } from '../../components/admin/AdminStates';
import {
  DashboardLoadError,
  getAdminOperationsDashboard,
  type DashboardAttentionItem,
  type DashboardAttentionTone,
  type DashboardSite,
} from '../../api/dashboard';
import { useSyncStore } from '../../stores/useSyncStore';
import { formatElapsedWorkTimer, formatStartedLabel, formatStartedTitle } from './dashboardTime';

const SiteMap = lazy(() => import('../../components/admin/SiteMap'));

type ActivityFilter = 'all' | 'started' | 'ended';

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: {
    label: 'Nepradėta',
    cls: 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300',
  },
  in_progress: {
    label: 'Vyksta',
    cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  paused: {
    label: 'Pristabdyta',
    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  completed: {
    label: 'Užbaigta',
    cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  },
};

function useMinuteNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, [enabled]);

  return now;
}

function Kpi({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  detail: string;
  tone: string;
}) {
  return (
    <div className="min-h-[116px] rounded-2xl border border-border bg-surface px-4 py-4 shadow-sm dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}><Icon size={16} /></span>
      </div>
      <p className="mt-3 text-3xl font-extrabold tabular-nums tracking-tight text-text">{value}</p>
      <p className="mt-1 text-[12px] text-muted">{detail}</p>
    </div>
  );
}

function AttentionIcon({ tone }: { tone: DashboardAttentionTone }) {
  if (tone === 'critical') return <CircleAlert size={16} className="text-red-600 dark:text-red-400" />;
  if (tone === 'warning') return <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />;
  return <CircleCheck size={16} className="text-blue-600 dark:text-blue-400" />;
}

function AttentionRow({ item }: { item: DashboardAttentionItem }) {
  const content = (
    <>
      <AttentionIcon tone={item.tone} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-text">{item.title}</p>
        <p className="truncate text-[12px] text-muted">{item.detail}</p>
      </div>
      {item.siteId && <ChevronRight size={15} className="shrink-0 text-subtle" />}
    </>
  );

  if (item.siteId) {
    return (
      <Link
        to={`/admin/sites/${item.siteId}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
      >
        {content}
      </Link>
    );
  }

  return <div className="flex items-center gap-3 px-4 py-3">{content}</div>;
}

function TodayWorkRow({ site, now }: { site: DashboardSite; now: number }) {
  const status = STATUS[site.status] ?? {
    label: 'Nepradėta',
    cls: 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300',
  };
  const StatusIcon = site.status === 'in_progress' ? Play : site.status === 'paused' ? Pause : CalendarDays;
  const elapsed = site.status === 'in_progress' ? formatElapsedWorkTimer(site.openWorkStartedAt, now) : '-';
  const startedLabel = formatStartedLabel(site.openWorkStartedAt);
  const startedTitle = formatStartedTitle(site.openWorkStartedAt);
  const teamLabel = site.teamName ?? 'Komanda nepriskirta';
  const identity = `${site.clientName} - ${site.code}${site.address ? ` - ${site.address}` : ''}`;

  return (
    <Link
      to={`/admin/sites/${site.id}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_minmax(120px,170px)_auto_16px] sm:items-center"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${status.cls}`} title={status.label}><StatusIcon size={13} /></span>
        <p className="min-w-0 truncate text-[13px] whitespace-nowrap" title={identity}>
          <span className="font-semibold text-text">{site.clientName}</span>
          <span className="text-muted"> - {site.code}{site.address ? ` - ${site.address}` : ''}</span>
        </p>
      </div>
      <p className="min-w-0 truncate pl-8 text-[12px] text-muted sm:pl-0" title={teamLabel}>{teamLabel}</p>
      <div className="row-span-2 flex shrink-0 flex-col items-end justify-center whitespace-nowrap text-right sm:row-auto sm:flex-row sm:items-center sm:gap-1.5">
        <span className="text-[13px] font-semibold tabular-nums text-text">{elapsed}</span>
        <span className="hidden text-[12px] text-subtle sm:inline">-</span>
        <span className="text-[12px] tabular-nums text-muted" title={startedTitle}>{startedLabel}</span>
      </div>
      <ChevronRight size={16} className="hidden shrink-0 text-subtle sm:block" />
    </Link>
  );
}

function SummaryRow({ icon: Icon, label, value, href, tone = 'text-text' }: {
  icon: React.ElementType;
  label: string;
  value: string;
  href: string;
  tone?: string;
}) {
  return (
    <Link to={href} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2">
      <Icon size={16} className="text-subtle" />
      <span className="flex-1 text-[13px] text-muted">{label}</span>
      <span className={`text-[13px] font-bold ${tone}`}>{value}</span>
      <ArrowUpRight size={14} className="text-subtle" />
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-16 w-72 rounded-lg bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((key) => <div key={key} className="h-[116px] rounded-2xl bg-surface-2" />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-12">
        <div className="h-[420px] rounded-2xl bg-surface-2 xl:col-span-7" />
        <div className="h-[420px] rounded-2xl bg-surface-2 xl:col-span-5" />
      </div>
    </div>
  );
}

function formatDashboardError(error: unknown): string {
  if (!import.meta.env.DEV) return 'DuomenÅ³ nepavyko Ä¯kelti.';
  if (error instanceof DashboardLoadError) return error.toDevMessage();
  if (error instanceof Error) return error.message;
  return 'NeÅ¾inoma Dashboard duomenÅ³ klaida.';
}

export default function Dashboard() {
  const { createBlankSite, isCreating } = useCreateBlankSite();
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const pendingPhotos = useSyncStore((state) => state.pendingPhotos);
  const pausedMutations = useIsMutating({ predicate: (mutation) => mutation.state.isPaused });

  const { data, error, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-operations-dashboard', format(new Date(), 'yyyy-MM-dd')],
    queryFn: () => getAdminOperationsDashboard(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const attention = useMemo(() => {
    const items = [...(data?.attention ?? [])];
    const pendingSync = pausedMutations + pendingPhotos;
    if (pendingSync > 0) {
      items.unshift({
        id: 'offline-sync-pending',
        tone: 'info',
        title: 'Laukia sinchronizavimo',
        detail: `${pendingSync} neperduoti veiksmai arba nuotraukos`,
      });
    }
    return items;
  }, [data?.attention, pausedMutations, pendingPhotos]);

  const filteredActivity = useMemo(() => (data?.activity ?? []).filter((entry) => {
    if (activityFilter === 'started') return !entry.endTime;
    if (activityFilter === 'ended') return !!entry.endTime;
    return true;
  }), [data?.activity, activityFilter]);
  const hasLiveWork = !!data?.todaySites.some((site) => site.status === 'in_progress' && !!site.openWorkStartedAt);
  const now = useMinuteNow(hasLiveWork);

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !data) {
    return (
      <AdminPageError
        message={formatDashboardError(error)}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const mapBaseCoords = data.companySettings?.warehouse_lat && data.companySettings?.warehouse_lng
    ? {
        lat: Number(data.companySettings.warehouse_lat),
        lng: Number(data.companySettings.warehouse_lng),
        label: data.companySettings.company_name ?? 'Įmonės bazė',
      }
    : null;

  const mapSites = data.mapSites.map((site) => ({
    id: site.id,
    client_name: site.clientName,
    code: site.code,
    status: site.status,
    latitude: site.latitude,
    longitude: site.longitude,
    team: site.teamName ? { name: site.teamName } : null,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-semibold text-primary dark:text-primary-ink">
            <Clock3 size={14} /> Operacijų centras
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-text">Šiandienos darbai</h1>
          <p className="mt-1 text-[13px] capitalize text-muted">{format(new Date(), "EEEE, yyyy 'm.' MMMM d 'd.'", { locale: lt })}</p>
        </div>
        <button
          onClick={() => { void createBlankSite(); }}
          disabled={isCreating}
          className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-semibold text-white shadow-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {isCreating ? 'Kuriama...' : 'Naujas objektas'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={CalendarDays} label="Šiandien suplanuota" value={data.scheduledTodayCount} detail="Objektai darbo plane" tone="bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300" />
        <Kpi icon={Users} label="Dirba dabar" value={data.workingNowCount} detail="Su atvira darbo eiga" tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" />
        <Kpi icon={AlertTriangle} label="Reikia dėmesio" value={attention.length} detail="Veiksmai, kuriuos verta patikrinti" tone="bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300" />
        <Kpi icon={CheckCircle2} label="Užbaigta šiandien" value={data.completedTodayCount} detail="Uždaryti darbai" tone="bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300" />
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm dark:shadow-none xl:col-span-7">
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
            <div>
              <h2 className="text-[15px] font-extrabold tracking-tight text-text">Šiandienos darbai</h2>
              <p className="mt-0.5 text-[12px] text-muted">Aktyvūs ir šiandien suplanuoti objektai</p>
            </div>
            <Link to="/admin/schedule" className="flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline dark:text-primary-ink">
              Darbo planas <ArrowUpRight size={13} />
            </Link>
          </div>
          {data.todaySites.length === 0 ? (
            <div className="px-4 py-16 text-center text-[13px] text-muted">Šiandien suplanuotų ar aktyvių darbų nėra.</div>
          ) : (
            <div className="divide-y divide-border">
              {data.todaySites.slice(0, 10).map((site) => <TodayWorkRow key={site.id} site={site} now={now} />)}
            </div>
          )}
        </section>

        <section className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm dark:shadow-none xl:col-span-5">
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
            <div>
              <h2 className="text-[15px] font-extrabold tracking-tight text-text">Objektai žemėlapyje</h2>
              <p className="mt-0.5 text-[12px] text-muted">Šiandienos maršrutas ir aktyvūs darbai</p>
            </div>
            <MapPin size={17} className="text-primary dark:text-primary-ink" />
          </div>
          <div className="min-h-[350px] flex-1 p-3">
            <div className="h-full min-h-[350px] overflow-hidden rounded-xl">
              <Suspense fallback={<div className="flex h-full min-h-[350px] items-center justify-center rounded-xl bg-surface-2 text-[13px] text-muted"><Loader2 size={18} className="mr-2 animate-spin" /> Kraunamas žemėlapis</div>}>
                <SiteMap sites={mapSites} baseCoords={mapBaseCoords} />
              </Suspense>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm dark:shadow-none xl:col-span-7">
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
            <div>
              <h2 className="text-[15px] font-extrabold tracking-tight text-text">Reikia dėmesio</h2>
              <p className="mt-0.5 text-[12px] text-muted">Tik tie signalai, kurie keičia šiandienos planą</p>
            </div>
            <span className="text-[12px] font-bold tabular-nums text-muted">{attention.length}</span>
          </div>
          {attention.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-12 text-[13px] text-emerald-700 dark:text-emerald-300"><CircleCheck size={17} /> Šiuo metu dėmesio reikalaujančių signalų nėra.</div>
          ) : (
            <div className="divide-y divide-border">
              {attention.slice(0, 8).map((item) => <AttentionRow key={item.id} item={item} />)}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm dark:shadow-none xl:col-span-5">
          <div className="border-b border-border px-4 py-3.5">
            <h2 className="text-[15px] font-extrabold tracking-tight text-text">Payroll ir dokumentacija</h2>
            <p className="mt-0.5 text-[12px] text-muted">Kontroliniai dienos uždarymo signalai</p>
          </div>
          <div className="divide-y divide-border">
            <SummaryRow
              icon={WalletCards}
              label="Payroll periodas"
              value={data.payrollStatus === 'locked' ? 'Užrakintas' : data.payrollStatus === 'review' ? 'Peržiūroje' : data.payrollStatus === 'open' ? 'Atviras' : 'Nėra'}
              href="/admin/payroll"
            />
            <SummaryRow icon={AlertTriangle} label="Payroll įspėjimai" value={String(data.payrollWarningCount)} href="/admin/payroll" tone={data.payrollWarningCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'} />
            <SummaryRow icon={FileWarning} label="Trūksta PDF ataskaitos" value={String(data.completedMissingPdfCount)} href="/admin/sites" tone={data.completedMissingPdfCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'} />
            <SummaryRow icon={FileText} label="Šiandien užbaigti objektai" value={String(data.completedTodayCount)} href="/admin/reports" />
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
          <div>
            <h2 className="text-[15px] font-extrabold tracking-tight text-text">Veiklos žurnalas</h2>
            <p className="mt-0.5 text-[12px] text-muted">Paskutiniai darbo eigos įvykiai</p>
          </div>
          <div className="flex rounded-lg bg-surface-2 p-0.5">
            {([
              ['all', 'Visi'],
              ['started', 'Pradėti'],
              ['ended', 'Užbaigti'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActivityFilter(id)}
                className={`h-7 rounded-md px-2.5 text-[12px] font-semibold transition-colors ${activityFilter === id ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {filteredActivity.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-muted">Šiam filtrui įvykių nėra.</p>
        ) : (
          <div className="divide-y divide-border">
            {filteredActivity.slice(0, 12).map((entry) => {
              const ended = !!entry.endTime;
              const Icon = ended ? CheckCircle2 : Play;
              const action = ended ? 'užbaigė darbus' : 'pradėjo darbus';
              const when = entry.latestActionTime ?? entry.endTime ?? entry.startTime;
              return (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ended ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-primary-fixed text-primary-ink dark:bg-primary/20'}`}><Icon size={14} /></span>
                  <p className="min-w-0 flex-1 truncate text-[13px] text-muted">
                    <span className="font-semibold text-text">{entry.installerName ?? 'Montuotojas'}</span> {action}{' '}
                    {entry.siteId ? <Link to={`/admin/sites/${entry.siteId}`} className="font-semibold text-primary hover:underline dark:text-primary-ink">{entry.clientName ?? entry.siteCode ?? 'objekte'}</Link> : <span>{entry.clientName ?? entry.siteCode ?? 'objekte'}</span>}
                  </p>
                  <span className="shrink-0 text-[12px] text-subtle">{when ? formatDistanceToNow(new Date(when), { addSuffix: true, locale: lt }) : ''}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
