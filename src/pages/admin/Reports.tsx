import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import * as XLSX from 'xlsx';
import { BarChart3, Download, Loader2, Users, CalendarRange, Clock } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface TimeReportRow {
  id: string;
  start_time: string;
  end_time: string | null;
  installer: { full_name: string | null } | null;
  site: { code: string | null; client_name: string | null; address: string | null } | null;
}

interface InstallerOption {
  id: string;
  full_name: string | null;
}

const currentMonth = () => format(new Date(), 'yyyy-MM');

/** Decimal hours between two ISO timestamps (0 if either is missing). */
function hoursBetween(start: string, end: string | null): number {
  if (!end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms > 0 ? ms / 3_600_000 : 0;
}

function siteLabel(site: TimeReportRow['site']): string {
  if (!site) return '—';
  const name = site.client_name ?? '';
  if (site.code) return name ? `${site.code} – ${name}` : site.code;
  return name || site.address || '—';
}

export default function Reports() {
  // Payroll is monthly → a single month picker. Defaults to the current month.
  const [month, setMonth] = useState<string>(currentMonth);
  const [installerId, setInstallerId] = useState<string>('');

  // Derive the full-month [start, end] date window from the selected month.
  const { startDate, endDate } = useMemo(() => {
    const base = new Date(`${month}-01T00:00:00`);
    return {
      startDate: format(startOfMonth(base), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(base), 'yyyy-MM-dd'),
    };
  }, [month]);

  // Installer dropdown options
  const { data: installers } = useQuery<InstallerOption[]>({
    queryKey: ['admin_installers_min'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .eq('role', 'installer')
        .order('full_name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  // Time entries (only COMPLETED logs — end_time not null — contribute to payroll)
  const { data: rows, isLoading } = useQuery<TimeReportRow[]>({
    queryKey: ['admin_time_report', startDate, endDate, installerId],
    queryFn: async () => {
      let q = supabase
        .from('time_entries')
        .select('id, start_time, end_time, installer:user_profiles(full_name), site:sites(code, client_name, address)')
        .gte('start_time', `${startDate}T00:00:00`)
        .lte('start_time', `${endDate}T23:59:59`)
        .not('end_time', 'is', null)
        .order('start_time', { ascending: false });
      if (installerId) q = q.eq('installer_id', installerId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalHours = useMemo(
    () => (rows ?? []).reduce((sum, r) => sum + hoursBetween(r.start_time, r.end_time), 0),
    [rows],
  );

  const hasRows = (rows?.length ?? 0) > 0;

  const handleExport = () => {
    if (!rows || rows.length === 0) return;
    const sheetRows = rows.map((r) => ({
      Data: format(new Date(r.start_time), 'yyyy-MM-dd'),
      Montuotojas: r.installer?.full_name ?? '—',
      Objektas: siteLabel(r.site),
      'Trukmė (val.)': Number(hoursBetween(r.start_time, r.end_time).toFixed(2)),
    }));
    // Append a total row
    sheetRows.push({
      Data: '',
      Montuotojas: '',
      Objektas: 'IŠ VISO',
      'Trukmė (val.)': Number(totalHours.toFixed(2)),
    });

    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 34 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ataskaita');
    XLSX.writeFile(wb, `ataskaita_${month}.xlsx`);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-[#fbf0ff] flex items-center justify-center border border-primary/10">
            <BarChart3 size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-[18px] text-[#1d033a]">Ataskaitos</h3>
            <p className="text-[13px] text-[#7c7484]">Montuotojų darbo laiko ataskaita (atlyginimams)</p>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={!hasRows}
          className="flex items-center gap-2 h-[40px] px-5 rounded-[10px] bg-primary text-white font-semibold text-[14px] hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
        >
          <Download size={16} />
          Eksportuoti į Excel
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-[#7c7484] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <CalendarRange size={13} /> Mėnuo
            </label>
            <input
              type="month"
              value={month}
              max={currentMonth()}
              onChange={(e) => setMonth(e.target.value || currentMonth())}
              className="w-full h-[40px] px-3 bg-[#f6f5fa] border border-[#cdc3d4]/50 rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[#7c7484] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Users size={13} /> Montuotojas
            </label>
            <select
              value={installerId}
              onChange={(e) => setInstallerId(e.target.value)}
              className="w-full h-[40px] px-3 bg-[#f6f5fa] border border-[#cdc3d4]/50 rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="">Visi montuotojai</option>
              {installers?.map((i) => (
                <option key={i.id} value={i.id}>{i.full_name ?? 'Be vardo'}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <div className="w-full h-[40px] px-4 rounded-[8px] bg-[#fbf0ff] border border-primary/15 flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#7c7484] uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={13} /> Iš viso
              </span>
              <span className="text-[16px] font-bold text-primary">{totalHours.toFixed(2)} val.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[120px_1fr_1fr_120px] gap-3 px-5 py-3 bg-[#f6f5fa]/70 border-b border-[#cdc3d4]/20">
          <span className="text-[11px] font-bold text-[#7c7484] uppercase tracking-wider">Data</span>
          <span className="text-[11px] font-bold text-[#7c7484] uppercase tracking-wider">Montuotojas</span>
          <span className="text-[11px] font-bold text-[#7c7484] uppercase tracking-wider">Objektas</span>
          <span className="text-[11px] font-bold text-[#7c7484] uppercase tracking-wider text-right">Trukmė</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={26} className="text-primary animate-spin" />
          </div>
        ) : !hasRows ? (
          <div className="text-center py-14 text-[#7c7484]">
            <BarChart3 size={30} className="mx-auto mb-2 text-[#cdc3d4]" />
            <p className="text-[14px]">Pasirinktu laikotarpiu įrašų nėra.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#cdc3d4]/15">
            {rows!.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[120px_1fr_1fr_120px] gap-3 px-5 py-3 items-center hover:bg-[#fbf9ff] transition-colors"
              >
                <span className="text-[13px] text-[#7c7484] whitespace-nowrap">
                  {format(new Date(r.start_time), 'yyyy-MM-dd')}
                </span>
                <span className="text-[14px] font-semibold text-[#1d033a] truncate">
                  {r.installer?.full_name ?? '—'}
                </span>
                <span className="text-[13px] text-[#1d033a] truncate">{siteLabel(r.site)}</span>
                <span className="text-[14px] font-bold text-[#1d033a] text-right whitespace-nowrap">
                  {hoursBetween(r.start_time, r.end_time).toFixed(2)} val.
                </span>
              </div>
            ))}
            {/* Total footer */}
            <div className="grid grid-cols-[120px_1fr_1fr_120px] gap-3 px-5 py-3 items-center bg-[#fbf0ff]/60">
              <span />
              <span />
              <span className="text-[13px] font-bold text-[#1d033a] text-right uppercase tracking-wider">Iš viso valandų:</span>
              <span className="text-[15px] font-bold text-primary text-right whitespace-nowrap">{totalHours.toFixed(2)} val.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
