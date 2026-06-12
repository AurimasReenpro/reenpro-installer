import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { getTeams } from '../../api/installers';
import { ROOF_TYPES, ROOF_ANGLES } from '../../lib/siteOptions';
import {
  BarChart3, Loader2, Gauge, Clock, CheckCircle2, CalendarRange, Users, Home, Triangle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ReportSite {
  id: string;
  code: string | null;
  client_name: string | null;
  kwp: number | null;
  roof_type: string | null;
  roof_angle: string | null;
  status: string | null;
  actual_end: string | null;
  scheduled_start: string | null;
  team_id: string | null;
  team: { name: string } | null;
  time_entries: { start_time: string; end_time: string | null }[] | null;
}

const BRAND = '#5E5CE6';
const currentMonth = () => format(new Date(), 'yyyy-MM');

/** Decimal hours between two ISO timestamps (0 if open/invalid). */
function hoursBetween(start: string, end: string | null): number {
  if (!end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms > 0 ? ms / 3_600_000 : 0;
}

// Apple-style select used across the filter bar.
const selectCls =
  'h-[40px] pl-9 pr-8 bg-gray-50 dark:bg-[#27272a] border border-transparent dark:border-white/10 rounded-xl text-[14px] text-gray-900 dark:text-white appearance-none focus:outline-none focus:bg-white dark:focus:bg-[#27272a] focus:ring-2 focus:ring-purple-500 transition-all cursor-pointer';

// Dark-mode-aware tooltip (auto-adapts via Tailwind).
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  const first = payload?.[0];
  if (!active || !first) return null;
  return (
    <div className="rounded-xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#27272a] px-3 py-2 shadow-lg">
      <p className="text-[12px] font-bold text-gray-900 dark:text-gray-100">{label}</p>
      <p className="text-[12px] font-semibold" style={{ color: BRAND }}>
        {first.value} h/kWp
      </p>
    </div>
  );
}

// ── KPI widget ────────────────────────────────────────────────────────────────
function Kpi({ icon: Icon, tint, label, value, sub }: {
  icon: React.ElementType;
  tint: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white dark:bg-[#18181b] border border-gray-100 dark:border-white/10 rounded-2xl p-5 shadow-sm dark:shadow-none flex flex-col justify-between">
      <div className="flex items-start justify-between">
        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">{label}</p>
        <div className={`p-2 rounded-xl shrink-0 ${tint}`}><Icon size={18} /></div>
      </div>
      <div className="mt-4">
        <h3 className="text-4xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">{value}</h3>
        {sub && <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Reports() {
  const [month, setMonth] = useState<string>(currentMonth);
  const [teamId, setTeamId] = useState<string>('');
  const [roofType, setRoofType] = useState<string>('');
  const [roofAngle, setRoofAngle] = useState<string>('');

  const { data: teams } = useQuery({ queryKey: ['admin_teams'], queryFn: getTeams });

  // All completed sites + their time logs; month/team/roof filtering happens client-side.
  const { data: rows, isLoading } = useQuery({
    queryKey: ['reports_completed_sites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select(
          'id, code, client_name, kwp, roof_type, roof_angle, status, actual_end, scheduled_start, team_id, team:teams(name), time_entries(start_time, end_time)',
        )
        .eq('status', 'completed')
        .order('actual_end', { ascending: false });
      if (error) throw error;
      const raw: unknown = data ?? [];
      return raw as ReportSite[];
    },
  });

  // Filtered set with computed actual hours per site.
  const sites = useMemo(() => {
    return (rows ?? [])
      .map((s) => ({
        ...s,
        hours: (s.time_entries ?? []).reduce((a, t) => a + hoursBetween(t.start_time, t.end_time), 0),
      }))
      .filter((s) => {
        const d = s.actual_end ?? s.scheduled_start;
        const monthOk = d ? format(new Date(d), 'yyyy-MM') === month : false;
        const teamOk = !teamId || s.team_id === teamId;
        const rtOk = !roofType || s.roof_type === roofType;
        const raOk = !roofAngle || s.roof_angle === roofAngle;
        return monthOk && teamOk && rtOk && raOk;
      });
  }, [rows, month, teamId, roofType, roofAngle]);

  // KPIs
  const totalHours = sites.reduce((a, s) => a + s.hours, 0);
  const totalKwp = sites.reduce((a, s) => a + (s.kwp ?? 0), 0);
  const avgHperKwp = totalKwp > 0 ? totalHours / totalKwp : 0;

  // Chart: average h/kWp per team
  const chartData = useMemo(() => {
    const byTeam = new Map<string, { hours: number; kwp: number }>();
    for (const s of sites) {
      const name = s.team?.name ?? 'Nepriskirta';
      const cur = byTeam.get(name) ?? { hours: 0, kwp: 0 };
      cur.hours += s.hours;
      cur.kwp += s.kwp ?? 0;
      byTeam.set(name, cur);
    }
    return Array.from(byTeam.entries())
      .map(([team, v]) => ({ team, hperkwp: v.kwp > 0 ? Number((v.hours / v.kwp).toFixed(2)) : 0 }))
      .sort((a, b) => a.hperkwp - b.hperkwp);
  }, [sites]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-[10px] bg-[#fbf0ff] dark:bg-purple-500/10 flex items-center justify-center border border-primary/10 dark:border-purple-500/20">
          <BarChart3 size={20} className="text-primary dark:text-purple-300" />
        </div>
        <div>
          <h3 className="font-extrabold tracking-tight text-[18px] text-gray-900 dark:text-gray-100">Ataskaitos</h3>
          <p className="text-[13px] text-gray-500 dark:text-gray-400">Našumo analizė: valandos vienam kWp pagal komandą, stogą ir įrangą</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-[#18181b] border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none p-3 flex flex-wrap items-center gap-3">
        <div className="relative">
          <CalendarRange size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => setMonth(e.target.value || currentMonth())}
            className="h-[40px] pl-9 pr-3 bg-gray-50 dark:bg-[#27272a] border border-transparent dark:border-white/10 rounded-xl text-[14px] text-gray-900 dark:text-white focus:outline-none focus:bg-white dark:focus:bg-[#27272a] focus:ring-2 focus:ring-purple-500 transition-all"
          />
        </div>

        <div className="relative">
          <Users size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={selectCls}>
            <option value="">Visos komandos</option>
            {teams?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="relative">
          <Home size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select value={roofType} onChange={(e) => setRoofType(e.target.value)} className={selectCls}>
            <option value="">Visi stogo tipai</option>
            {ROOF_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className="relative">
          <Triangle size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select value={roofAngle} onChange={(e) => setRoofAngle(e.target.value)} className={selectCls}>
            <option value="">Visi nuolydžiai</option>
            {ROOF_ANGLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Kpi
          icon={Gauge}
          tint="bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400"
          label="Vidutinis h / kWp"
          value={avgHperKwp.toFixed(2)}
          sub={`${totalHours.toFixed(1)} val. / ${totalKwp.toFixed(1)} kWp`}
        />
        <Kpi
          icon={Clock}
          tint="bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
          label="Iš viso valandų"
          value={totalHours.toFixed(1)}
          sub="Faktinės darbo valandos"
        />
        <Kpi
          icon={CheckCircle2}
          tint="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          label="Užbaigti objektai"
          value={String(sites.length)}
          sub="Pagal pasirinktus filtrus"
        />
      </div>

      {/* Visuals + table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chart */}
        <div className="bg-white dark:bg-[#18181b] border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none p-5">
          <h4 className="text-[15px] font-extrabold tracking-tight text-gray-900 dark:text-gray-100 mb-4">
            Vidutinis h/kWp pagal komandą
          </h4>
          {isLoading ? (
            <div className="flex items-center justify-center h-[280px]"><Loader2 className="text-primary animate-spin" /></div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-[280px] text-[13px] text-gray-400 dark:text-gray-500">Nėra duomenų</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,120,0.15)" vertical={false} />
                <XAxis dataKey="team" tick={{ fill: '#9ca3af', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(94,92,230,0.08)' }} content={<ChartTooltip />} />
                <Bar dataKey="hperkwp" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {chartData.map((d) => <Cell key={d.team} fill={BRAND} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-[#18181b] border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-[#27272a] border-b border-gray-100 dark:border-white/5">
                  <th className="py-3 px-4 text-[11px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider">Objektas</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider">Komanda</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider text-right">kWp</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider">Stogas</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider text-right">Val.</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider text-right">h/kWp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                {isLoading ? (
                  <tr><td colSpan={6} className="py-12 text-center text-gray-400 dark:text-gray-500"><Loader2 className="inline animate-spin text-primary" /></td></tr>
                ) : sites.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-[14px] text-gray-400 dark:text-gray-500">Pasirinktais filtrais objektų nerasta.</td></tr>
                ) : (
                  sites.map((s) => {
                    const hpk = s.kwp && s.kwp > 0 ? s.hours / s.kwp : 0;
                    return (
                      <tr key={s.id} className="hover:bg-gray-50/50 dark:hover:bg-[#27272a] transition-colors">
                        <td className="py-3 px-4">
                          <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[160px]">{s.client_name || '—'}</p>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500">#{s.code ?? '—'}</p>
                        </td>
                        <td className="py-3 px-4 text-[13px] text-gray-600 dark:text-gray-300">{s.team?.name ?? '—'}</td>
                        <td className="py-3 px-4 text-[13px] text-gray-700 dark:text-gray-200 text-right whitespace-nowrap">{s.kwp ?? '—'}</td>
                        <td className="py-3 px-4 text-[12px] text-gray-500 dark:text-gray-400">{s.roof_type || '—'}</td>
                        <td className="py-3 px-4 text-[13px] text-gray-700 dark:text-gray-200 text-right whitespace-nowrap">{s.hours.toFixed(1)}</td>
                        <td className="py-3 px-4 text-[13px] font-bold text-right whitespace-nowrap" style={{ color: BRAND }}>{hpk.toFixed(2)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
