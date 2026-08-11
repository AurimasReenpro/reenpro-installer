import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Plus, MapPin, Search, Loader2, AlertTriangle, ListChecks, Image as ImageIcon, Clock,
} from 'lucide-react';
import { useConfirm } from '../../hooks/useConfirm';
import { useCreateBlankSite } from '../../hooks/useCreateSite';
import { getSitesList, archiveSite, deleteSiteSafe } from '../../api/sites';
import { getActiveTeams, getActiveInstallers } from '../../api/installers';
import { AdminEmptyState, AdminTableSkeletonRows } from '../../components/admin/AdminStates';
import {
  buildSiteRow, matchesFilters, computeKpis, WARNING_LABELS, EMPTY_FILTERS, STATUS_OPTIONS,
  type SiteListRow, type SiteFilters, type PeriodFilter,
} from './sites/siteListModel';
import SiteActionsMenu from './sites/SiteActionsMenu';
import SiteQuickModal from './sites/SiteQuickModal';
import CreateSiteModal from './sites/CreateSiteModal';

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  pending:     { label: 'Laukia',      cls: 'bg-[#F0F9FF] text-[#0284C7] dark:bg-sky-500/15 dark:text-sky-300' },
  in_progress: { label: 'Vykdomas',    cls: 'bg-[#ECFDF5] text-[#10B981] dark:bg-emerald-500/15 dark:text-emerald-300' },
  paused:      { label: 'Sustabdytas', cls: 'bg-[#FFFBEB] text-[#F59E0B] dark:bg-amber-500/15 dark:text-amber-300' },
  completed:   { label: 'Baigtas',     cls: 'bg-[#F3F4F6] text-[#6B7280] dark:bg-white/10 dark:text-zinc-300' },
  archived:    { label: 'Archyvuotas', cls: 'bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-500' },
};
const statusChip = (s: string | null) => STATUS_CHIP[s ?? 'pending'] ?? { label: s ?? '-', cls: 'bg-surface-2 text-muted' };

function fmtDuration(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h} val. ${m} min.` : `${m} min.`;
}

const th = 'py-3 px-4 text-[11px] font-bold text-subtle uppercase tracking-wider whitespace-nowrap';
const selectCls = 'h-[40px] px-3 rounded-xl bg-surface border border-border text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer';

export default function Sites() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { createBlankSite, isCreating } = useCreateBlankSite();
  const [filters, setFilters] = useState<SiteFilters>(EMPTY_FILTERS);
  const [quick, setQuick] = useState<{ site: SiteListRow; mode: 'team' | 'status' } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: rawSites, isLoading } = useQuery({
    queryKey: ['admin_sites_list'],
    queryFn: getSitesList,
    staleTime: 30_000,
  });
  const { data: teams = [] } = useQuery({ queryKey: ['active_teams'], queryFn: getActiveTeams });
  const { data: installers = [] } = useQuery({ queryKey: ['installers_list'], queryFn: getActiveInstallers });

  // Captured once at mount (relative time for warnings/elapsed); refreshes with data.
  const [now] = useState(() => Date.now());
  const rows = useMemo(() => (rawSites ?? []).map((s) => buildSiteRow(s, now)), [rawSites, now]);
  const kpis = useMemo(() => computeKpis(rows), [rows]);
  const filtered = useMemo(() => rows.filter((r) => matchesFilters(r, filters, now)), [rows, filters, now]);

  const setF = (patch: Partial<SiteFilters>) => setFilters((p) => ({ ...p, ...patch }));

  // ── Archive (soft, reversible) ──
  const archive = useMutation({
    mutationFn: (id: string) => archiveSite(id),
    onSuccess: () => { toast.success('Objektas archyvuotas.'); void queryClient.invalidateQueries({ queryKey: ['admin_sites_list'] }); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Nepavyko archyvuoti.'),
  });
  const handleArchive = async (row: SiteListRow) => {
    const ok = await confirm({
      title: 'Archyvuoti objektą?',
      message: `„${row.code} - ${row.client_name}" bus paslėptas iš aktyvaus sąrašo. Galėsite jį grąžinti pakeitę statusą.`,
      confirmText: 'Archyvuoti', cancelText: 'Atšaukti', variant: 'primary',
    });
    if (ok) archive.mutate(row.id);
  };

  // ── Protected hard delete ──
  const del = useMutation({
    mutationFn: (id: string) => deleteSiteSafe(id),
    onSuccess: () => { toast.success('Objektas ištrintas.'); void queryClient.invalidateQueries({ queryKey: ['admin_sites_list'] }); },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message === 'SITE_HAS_RELATED_DATA') {
        toast.error('Objektas turi susijusių duomenų, todėl jo ištrinti negalima. Galite jį archyvuoti.');
      } else {
        toast.error(e instanceof Error ? e.message : 'Nepavyko ištrinti objekto.');
      }
    },
  });
  const handleDelete = async (row: SiteListRow) => {
    const ok = await confirm({
      title: 'Ištrinti objektą?',
      message: 'Objektas bus ištrintas visam laikui. Tai galima tik jei jis neturi susijusių duomenų (laiko įrašų, checklist, nuotraukų, atlygio). Kitu atveju archyvuokite.',
      confirmText: 'Ištrinti', cancelText: 'Atšaukti', variant: 'danger',
    });
    if (ok) del.mutate(row.id);
  };

  const noData = !isLoading && (rawSites ?? []).length === 0;

  return (
    <div className="space-y-5 h-full flex flex-col">
      {/* ── Header ── */}
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text">Visi objektai</h1>
          <p className="text-[14px] text-subtle mt-0.5">Objektų sąrašas, komandos, statusai ir vykdymo eiga.</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          disabled={isCreating}
          className="flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-primary px-4 text-[14px] font-medium text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
          {isCreating ? 'Kuriama...' : 'Sukurti naują objektą'}
        </button>
      </div>

      {/* ── KPI row (clickable → sets filters) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Visi objektai" value={kpis.total} active={filters === EMPTY_FILTERS} onClick={() => setFilters(EMPTY_FILTERS)} />
        <Kpi label="Laukia" value={kpis.pending} tone="sky" active={filters.status === 'pending'} onClick={() => setF({ status: filters.status === 'pending' ? '' : 'pending' })} />
        <Kpi label="Vykdomi" value={kpis.inProgress} tone="emerald" active={filters.status === 'in_progress'} onClick={() => setF({ status: filters.status === 'in_progress' ? '' : 'in_progress' })} />
        <Kpi label="Baigti" value={kpis.completed} tone="zinc" active={filters.status === 'completed'} onClick={() => setF({ status: filters.status === 'completed' ? '' : 'completed' })} />
        <Kpi label="Be komandos" value={kpis.noTeam} tone="amber" active={filters.onlyNoTeam} onClick={() => setF({ onlyNoTeam: !filters.onlyNoTeam })} />
        <Kpi label="Reikia dėmesio" value={kpis.attention} tone="red" active={filters.onlyProblems} onClick={() => setF({ onlyProblems: !filters.onlyProblems })} />
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={filters.search} onChange={(e) => setF({ search: e.target.value })}
            placeholder="Ieškoti pagal kodą, pavadinimą ar adresą..."
            className="h-[40px] w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-[14px] text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select value={filters.status} onChange={(e) => setF({ status: e.target.value })} className={selectCls} title="Statusas">
          <option value="">Visi statusai</option>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filters.teamId} onChange={(e) => setF({ teamId: e.target.value })} className={selectCls} title="Komanda">
          <option value="">Visos komandos</option>
          <option value="none">Be komandos</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={filters.installerId} onChange={(e) => setF({ installerId: e.target.value })} className={selectCls} title="Montuotojas">
          <option value="">Visi montuotojai</option>
          {installers.map((u) => <option key={u.id} value={u.id}>{u.full_name ?? 'Be vardo'}</option>)}
        </select>
        <select value={filters.period} onChange={(e) => setF({ period: e.target.value as PeriodFilter })} className={selectCls} title="Laikotarpis">
          <option value="all">Visas laikotarpis</option>
          <option value="this_month">Šis mėnuo</option>
          <option value="next_month">Kitas mėnuo</option>
        </select>
        <button onClick={() => setF({ onlyNoTeam: !filters.onlyNoTeam })} className={`h-[40px] whitespace-nowrap rounded-xl border px-3 text-[13px] font-medium transition-colors active:scale-[0.98] cursor-pointer ${filters.onlyNoTeam ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-300' : 'bg-surface border-border text-muted hover:bg-surface-2'}`}>
          Tik be komandos
        </button>
        <button onClick={() => setF({ onlyProblems: !filters.onlyProblems })} className={`h-[40px] whitespace-nowrap rounded-xl border px-3 text-[13px] font-medium transition-colors active:scale-[0.98] cursor-pointer ${filters.onlyProblems ? 'bg-red-50 dark:bg-red-500/15 border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-300' : 'bg-surface border-border text-muted hover:bg-surface-2'}`}>
          Tik su problemomis
        </button>
      </div>

      {/* ── Table ── */}
      <div className="bg-surface border border-border rounded-2xl shadow-sm dark:shadow-none flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50 dark:bg-surface-2">
                <th className={th}>Kodas</th>
                <th className={th}>Pavadinimas</th>
                <th className={th}>Adresas</th>
                <th className={th}>Planuojama pradžia</th>
                <th className={th}>Statusas</th>
                <th className={th}>Komanda</th>
                <th className={th}>Sistema</th>
                <th className={th}>Eiga</th>
                <th className={th}>Laikas</th>
                <th className={th}>Įspėjimai</th>
                <th className={`${th} text-right`}>Veiksmai</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <AdminTableSkeletonRows columns={11} rows={6} />
              ) : noData ? (
                <tr><td colSpan={11}><AdminEmptyState title="Įrašų nerasta." message="Dar nėra sukurtų objektų." /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11}><AdminEmptyState title="Pagal pasirinktus filtrus rezultatų nėra." /></td></tr>
              ) : filtered.map((r) => {
                const chip = statusChip(r.status);
                const archived = r.status === 'archived';
                return (
                  <tr key={r.id} className={`border-b border-border dark:border-white/5 hover:bg-surface-2/50 dark:hover:bg-surface-2 transition-colors ${archived ? 'opacity-60' : ''}`}>
                    <td className="py-3 px-4">
                      <Link to={`/admin/sites/${r.id}`} className="bg-surface-2 dark:bg-primary/30 border border-border/50 dark:border-white/10 text-[12px] font-bold px-2.5 py-1 rounded-md text-primary dark:text-primary-ink hover:underline">{r.code}</Link>
                    </td>
                    <td className="py-3 px-4 font-semibold text-text dark:text-gray-100 max-w-[200px] truncate">{r.client_name}</td>
                    <td className="py-3 px-4 text-muted dark:text-subtle text-[13px] max-w-[200px]">
                      <span className="flex items-center gap-1.5 truncate"><MapPin size={14} className="text-subtle shrink-0" />{r.address || '-'}</span>
                    </td>
                    <td className="py-3 px-4 text-muted dark:text-subtle text-[13px] whitespace-nowrap">{r.scheduled_start ? format(new Date(r.scheduled_start), 'yyyy-MM-dd HH:mm') : '-'}</td>
                    <td className="py-3 px-4"><span className={`px-2.5 py-1 rounded-full text-[12px] font-bold whitespace-nowrap ${chip.cls}`}>{chip.label}</span></td>
                    <td className="py-3 px-4">
                      {r.teamName && !archived ? (
                        <span className="bg-[#f0fdf4] dark:bg-emerald-900/30 text-[#16a34a] dark:text-emerald-300 border border-[#16a34a]/20 dark:border-emerald-500/20 px-2.5 py-1 rounded-[6px] text-[12px] font-bold whitespace-nowrap">{r.teamName}</span>
                      ) : (
                        <span className="text-subtle dark:text-muted text-[13px]">Nepriskirta</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[13px] text-muted dark:text-subtle whitespace-nowrap">{r.equipmentSummary}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 text-[12px] text-muted">
                        {r.progress ? (
                          <span className={`inline-flex items-center gap-1 ${r.progress.failed > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                            <ListChecks size={13} /> {r.progress.passed}/{r.progress.total}
                          </span>
                        ) : null}
                        {r.photoCount > 0 && <span className="inline-flex items-center gap-1"><ImageIcon size={13} /> {r.photoCount}</span>}
                        {!r.progress && r.photoCount === 0 && <span className="text-subtle">-</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[13px] whitespace-nowrap">
                      {r.time.activeMs != null ? (
                        <span className={`inline-flex items-center gap-1 ${r.time.suspicious ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}><Clock size={13} /> {fmtDuration(r.time.activeMs)}</span>
                      ) : r.time.totalHours != null ? (
                        <span className={`inline-flex items-center gap-1 ${r.time.suspicious ? 'text-red-600 dark:text-red-400' : 'text-muted'}`}>{r.time.totalHours} val.</span>
                      ) : <span className="text-subtle">-</span>}
                    </td>
                    <td className="py-3 px-4">
                      {r.warnings.length === 0 ? <span className="text-subtle">-</span> : (
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {r.warnings.map((w) => (
                            <span key={w} className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                              <AlertTriangle size={9} /> {WARNING_LABELS[w]}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <SiteActionsMenu
                        site={r}
                        onAssignTeam={() => setQuick({ site: r, mode: 'team' })}
                        onChangeStatus={() => setQuick({ site: r, mode: 'status' })}
                        onArchive={() => void handleArchive(r)}
                        onDelete={() => void handleDelete(r)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {quick && (
        <SiteQuickModal
          site={quick.site} mode={quick.mode} teams={teams}
          onClose={() => setQuick(null)} onSaved={() => setQuick(null)}
        />
      )}

      {showCreateModal && (
        <CreateSiteModal
          isCreating={isCreating}
          onClose={() => setShowCreateModal(false)}
          onCreate={createBlankSite}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, tone = 'default', active, onClick }: { label: string; value: number; tone?: 'default' | 'sky' | 'emerald' | 'amber' | 'red' | 'zinc'; active?: boolean; onClick: () => void }) {
  const toneCls: Record<string, string> = {
    default: 'text-text',
    sky: 'text-sky-600 dark:text-sky-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    zinc: 'text-zinc-500 dark:text-zinc-400',
  };
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border px-4 py-3 transition-all cursor-pointer ${active ? 'border-primary ring-1 ring-primary/30 bg-surface' : 'border-border bg-surface hover:bg-surface-2/50'}`}
    >
      <p className="text-[11px] font-semibold text-subtle uppercase tracking-wider truncate">{label}</p>
      <p className={`text-[24px] font-extrabold tabular-nums leading-tight ${toneCls[tone]}`}>{value}</p>
    </button>
  );
}
