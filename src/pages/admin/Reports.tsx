import { useMemo, useState, type ElementType } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  BatteryCharging,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Layers3,
  Wrench,
} from 'lucide-react';
import { getTeams } from '../../api/installers';
import { getLaborAnalyticsReport, getReportInstallers } from '../../api/reports';
import { AdminEmptyState, AdminPageError, AdminPanelSkeleton } from '../../components/admin/AdminStates';
import {
  anomalyLabel,
  calculateLaborAnalyticsKpis,
  excludeAnomalousSites,
  groupByModuleModel,
  serializeLaborFilters,
  type LaborAnalyticsFilters,
} from './reportAnalytics';

const today = new Date();
const MONTHS_LT = [
  'Sausis',
  'Vasaris',
  'Kovas',
  'Balandis',
  'Gegužė',
  'Birželis',
  'Liepa',
  'Rugpjūtis',
  'Rugsėjis',
  'Spalis',
  'Lapkritis',
  'Gruodis',
];
const initialFilters: LaborAnalyticsFilters = {
  period_mode: 'month',
  year: today.getFullYear(),
  month: today.getMonth() + 1,
};

const controlCls =
  'h-10 rounded-xl border border-border bg-surface px-3 text-[13px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60';
const thCls = 'px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-subtle whitespace-nowrap';
const tdMuted = 'px-4 py-3 text-[13px] text-muted';

function fmt(value: number | null | undefined, digits = 2) {
  return value == null || !Number.isFinite(value) ? '-' : value.toFixed(digits);
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone = 'primary',
}: {
  icon: ElementType;
  label: string;
  value: string;
  tone?: 'primary' | 'emerald' | 'amber' | 'blue';
}) {
  const tones = {
    primary: 'text-primary bg-primary-fixed dark:bg-primary/15',
    emerald: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'text-amber-700 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300',
    blue: 'text-blue-700 bg-blue-50 dark:bg-blue-500/15 dark:text-blue-300',
  };

  return (
    <div className="flex min-h-[112px] flex-col justify-between rounded-2xl border border-border bg-surface p-4 shadow-sm dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">{label}</p>
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon size={16} />
        </span>
      </div>
      <p className="text-2xl font-extrabold tabular-nums text-text">{value}</p>
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4 2xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => (
          <AdminPanelSkeleton key={index} className="h-28" />
        ))}
      </section>
      <AdminPanelSkeleton className="h-72" />
      <AdminPanelSkeleton className="h-96" />
    </div>
  );
}

export default function Reports() {
  const [filters, setFilters] = useState<LaborAnalyticsFilters>(initialFilters);
  const filterPayload = useMemo(() => serializeLaborFilters(filters), [filters]);
  const { data: teams = [] } = useQuery({ queryKey: ['admin_teams'], queryFn: getTeams });
  const { data: installers = [] } = useQuery({ queryKey: ['report-installers'], queryFn: getReportInstallers });
  const {
    data: sites = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['labor-analytics-view', filterPayload],
    queryFn: () => getLaborAnalyticsReport(filters),
  });

  const visibleSites = useMemo(
    () => excludeAnomalousSites(sites, !!filters.exclude_anomalies),
    [filters.exclude_anomalies, sites],
  );
  const kpis = useMemo(() => calculateLaborAnalyticsKpis(visibleSites), [visibleSites]);
  const moduleRows = useMemo(() => groupByModuleModel(visibleSites), [visibleSites]);
  const moduleModels = useMemo(
    () => [...new Set(sites.map((site) => site.module_model).filter((value): value is string => !!value))].sort(),
    [sites],
  );
  const manufacturers = useMemo(
    () => [...new Set(sites.map((site) => site.module_manufacturer).filter((value): value is string => !!value))].sort(),
    [sites],
  );
  const monthLabel = filters.year && filters.month ? `${filters.year} m. ${MONTHS_LT[filters.month - 1]}` : 'Pasirinkite mėnesį';
  const update = <K extends keyof LaborAnalyticsFilters>(key: K, value: LaborAnalyticsFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <header className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary-fixed text-primary dark:bg-primary/15 dark:text-primary-ink">
          <BarChart3 size={20} />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-text">Ataskaitos</h1>
          <p className="mt-0.5 text-[13px] text-muted">Darbo laiko ir našumo analizė pagal objektus, komandas ir įrangą.</p>
        </div>
      </header>

      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3 shadow-sm dark:shadow-none">
        <CalendarRange size={16} className="ml-1 text-subtle" />
        <div className="inline-flex h-10 items-center rounded-xl bg-surface-2 p-1 text-[12px] font-semibold">
          <button
            type="button"
            onClick={() => update('period_mode', 'all_time')}
            className={`h-full whitespace-nowrap rounded-lg px-3 transition-colors ${
              filters.period_mode === 'all_time' ? 'bg-surface text-text shadow-sm' : 'text-subtle hover:text-text'
            }`}
          >
            Visas laikotarpis
          </button>
          <button
            type="button"
            onClick={() =>
              setFilters((current) => ({
                ...current,
                period_mode: 'month',
                year: current.year ?? today.getFullYear(),
                month: current.month ?? today.getMonth() + 1,
              }))
            }
            className={`h-full whitespace-nowrap rounded-lg px-3 transition-colors ${
              filters.period_mode === 'month' ? 'bg-surface text-text shadow-sm' : 'text-subtle hover:text-text'
            }`}
          >
            Mėnuo
          </button>
        </div>
        {filters.period_mode === 'month' ? (
          <>
            <span className="inline-flex h-10 items-center px-3 text-[13px] font-semibold text-text">{monthLabel}</span>
            <input
              aria-label="Ataskaitų mėnuo"
              type="month"
              value={`${filters.year ?? today.getFullYear()}-${String(filters.month ?? today.getMonth() + 1).padStart(2, '0')}`}
              onChange={(event) => {
                const [year = 0, month = 0] = event.target.value.split('-').map(Number);
                if (year && month >= 1 && month <= 12) setFilters((current) => ({ ...current, year, month }));
              }}
              className={`${controlCls} w-[150px]`}
            />
          </>
        ) : null}
        <select value={filters.team_id ?? ''} onChange={(event) => update('team_id', event.target.value || undefined)} className={`${controlCls} min-w-[150px]`}>
          <option value="">Visos komandos</option>
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <select value={filters.installer_id ?? ''} onChange={(event) => update('installer_id', event.target.value || undefined)} className={`${controlCls} min-w-[150px]`}>
          <option value="">Visi montuotojai</option>
          {installers.map((installer) => <option key={installer.id} value={installer.id}>{installer.full_name ?? 'Be vardo'}</option>)}
        </select>
        <select value={filters.has_bess === undefined ? '' : String(filters.has_bess)} onChange={(event) => update('has_bess', event.target.value === '' ? undefined : event.target.value === 'true')} className={`${controlCls} min-w-[150px]`}>
          <option value="">BESS: visi</option>
          <option value="true">Su BESS</option>
          <option value="false">Be BESS</option>
        </select>
        <select value={filters.has_optimizers === undefined ? '' : String(filters.has_optimizers)} onChange={(event) => update('has_optimizers', event.target.value === '' ? undefined : event.target.value === 'true')} className={`${controlCls} min-w-[170px]`}>
          <option value="">Optimizatoriai: visi</option>
          <option value="true">Su optimizatoriais</option>
          <option value="false">Be optimizatorių</option>
        </select>
        <select value={filters.module_model ?? ''} onChange={(event) => update('module_model', event.target.value || undefined)} className={`${controlCls} min-w-[150px]`}>
          <option value="">Modulio modelis</option>
          {moduleModels.map((model) => <option key={model} value={model}>{model}</option>)}
        </select>
        <select value={filters.module_manufacturer ?? ''} onChange={(event) => update('module_manufacturer', event.target.value || undefined)} className={`${controlCls} min-w-[150px]`}>
          <option value="">Gamintojas</option>
          {manufacturers.map((manufacturer) => <option key={manufacturer} value={manufacturer}>{manufacturer}</option>)}
        </select>
        <input type="number" min="0" aria-label="kWp nuo" value={filters.kwp_min ?? ''} onChange={(event) => update('kwp_min', event.target.value ? Number(event.target.value) : undefined)} placeholder="kWp nuo" className={`${controlCls} w-[94px]`} />
        <input type="number" min="0" aria-label="kWp iki" value={filters.kwp_max ?? ''} onChange={(event) => update('kwp_max', event.target.value ? Number(event.target.value) : undefined)} placeholder="kWp iki" className={`${controlCls} w-[94px]`} />
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 px-2 text-[13px] font-medium text-text">
          <input type="checkbox" checked={!!filters.exclude_anomalies} onChange={(event) => update('exclude_anomalies', event.target.checked)} className="accent-primary" />
          Be anomalijų
        </label>
      </section>

      {isLoading ? (
        <ReportsSkeleton />
      ) : isError ? (
        <AdminPageError
          message="Patikrinkite, ar pritaikyta analitikos view migracija."
          onRetry={() => {
            void refetch();
          }}
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4 2xl:grid-cols-7">
            <Kpi icon={BarChart3} label="Vid. h/kWp" value={fmt(kpis.avg_h_per_kwp)} />
            <Kpi icon={Layers3} label="Mediana h/kWp" value={fmt(kpis.median_h_per_kwp)} tone="blue" />
            <Kpi icon={Layers3} label="Vid. h/moduliui" value={fmt(kpis.avg_h_per_module, 3)} tone="emerald" />
            <Kpi icon={Layers3} label="Mediana h/moduliui" value={fmt(kpis.median_h_per_module, 3)} />
            <Kpi icon={Clock3} label="Iš viso valandų" value={fmt(kpis.total_installer_hours, 1)} tone="emerald" />
            <Kpi icon={CheckCircle2} label="Užbaigti objektai" value={String(kpis.completed_sites)} tone="blue" />
            <Kpi icon={AlertTriangle} label="Anomalijos" value={String(kpis.anomaly_count)} tone="amber" />
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm dark:shadow-none">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Layers3 size={16} className="text-primary dark:text-primary-ink" />
              <h2 className="text-[14px] font-bold text-text">Modulių našumas</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[830px] text-left">
                <thead className="bg-surface-2/70 dark:bg-surface-2">
                  <tr>
                    {['Modulis', 'Gamintojas', 'Objektų sk.', 'Modulių sk.', 'Vid. h/moduliui', 'Mediana h/moduliui', 'Vid. h/kWp', 'Anomalijos'].map((label) => (
                      <th key={label} className={thCls}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {moduleRows.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <AdminEmptyState title="Įrašų nerasta." message="Nėra modulių našumo duomenų." />
                      </td>
                    </tr>
                  ) : moduleRows.map((row) => (
                    <tr key={`${row.module_model}-${row.manufacturer}`} className="hover:bg-surface-2/50">
                      <td className="px-4 py-3 text-[13px] font-semibold text-text">{row.module_model}</td>
                      <td className={tdMuted}>{row.manufacturer ?? '-'}</td>
                      <td className={`${tdMuted} tabular-nums`}>{row.site_count}</td>
                      <td className={`${tdMuted} tabular-nums`}>{fmt(row.module_count, 0)}</td>
                      <td className="px-4 py-3 text-[13px] font-bold tabular-nums text-primary dark:text-primary-ink">{fmt(row.avg_h_per_module, 3)}</td>
                      <td className={`${tdMuted} tabular-nums`}>{fmt(row.median_h_per_module, 3)}</td>
                      <td className={`${tdMuted} tabular-nums`}>{fmt(row.avg_h_per_kwp)}</td>
                      <td className="px-4 py-3 text-[13px] tabular-nums text-amber-700 dark:text-amber-300">{row.anomaly_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm dark:shadow-none">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Wrench size={16} className="text-primary dark:text-primary-ink" />
              <h2 className="text-[14px] font-bold text-text">Objektų darbo analizė</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1160px] text-left">
                <thead className="bg-surface-2/70 dark:bg-surface-2">
                  <tr>
                    {['Objektas', 'Komanda', 'kWp', 'Modulis', 'Modulių sk.', 'BESS', 'Optimizatoriai', 'Valandos', 'h/kWp', 'h/moduliui', 'Dalyviai', 'Anomalijos'].map((label) => (
                      <th key={label} className={thCls}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {visibleSites.length === 0 ? (
                    <tr>
                      <td colSpan={12}>
                        <AdminEmptyState title="Pagal pasirinktus filtrus rezultatų nėra." />
                      </td>
                    </tr>
                  ) : visibleSites.map((site) => (
                    <tr key={site.site_id} className={`${site.is_anomaly ? 'bg-amber-50/70 dark:bg-amber-500/10' : ''} hover:bg-surface-2/50`}>
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-semibold text-text">{site.site_code}</p>
                        <p className="max-w-[150px] truncate text-[11px] text-subtle">{site.client_name}</p>
                      </td>
                      <td className={tdMuted}>{site.team_name ?? '-'}</td>
                      <td className={`${tdMuted} tabular-nums`}>{fmt(site.kwp, 1)}</td>
                      <td className={`${tdMuted} max-w-[170px] truncate`}>{site.module_model ?? site.module_type ?? '-'}</td>
                      <td className={`${tdMuted} tabular-nums`}>{fmt(site.module_count, 0)}</td>
                      <td className="px-4 py-3">{site.has_bess ? <BatteryCharging size={16} className="text-emerald-600 dark:text-emerald-300" /> : <span className="text-subtle">-</span>}</td>
                      <td className={`${tdMuted} tabular-nums`}>{fmt(site.optimizer_count, 0)}</td>
                      <td className={`${tdMuted} tabular-nums`}>{fmt(site.total_installer_hours, 1)}</td>
                      <td className="px-4 py-3 text-[13px] font-bold tabular-nums text-primary dark:text-primary-ink">{fmt(site.h_per_kwp)}</td>
                      <td className={`${tdMuted} tabular-nums`}>{fmt(site.h_per_module, 3)}</td>
                      <td className={`${tdMuted} tabular-nums`}>{site.installer_count}</td>
                      <td className="px-4 py-3">
                        {site.is_anomaly ? (
                          <span title={anomalyLabel(site.anomaly_reasons)} className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                            <AlertTriangle size={13} />
                            {site.anomaly_reasons.length}
                          </span>
                        ) : (
                          <span className="text-subtle">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
