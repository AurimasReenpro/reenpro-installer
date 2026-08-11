import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, parseISO,
} from 'date-fns';
import { Zap, MapPin, CalendarDays, Loader2, TrendingUp, X, Sun, Battery, AlertTriangle } from 'lucide-react';

interface CompletedSite {
  id: string;
  code: string | null;
  client_name: string | null;
  address: string | null;
  kwp: number | null;
  kwh: number | null;
  actual_end: string | null;
}

const currentMonth = () => format(new Date(), 'yyyy-MM');
const WEEKDAYS = ['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk'];

/** Compact number: integers stay whole, otherwise one decimal. */
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function Stats() {
  const { profile } = useAuthStore();
  const [month, setMonth] = useState<string>(currentMonth);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const monthStart = useMemo(() => startOfMonth(new Date(`${month}-01T00:00:00`)), [month]);
  const monthEnd = useMemo(() => endOfMonth(monthStart), [monthStart]);

  // Installer's team comes straight from the auth profile — no extra round-trip.
  const teamId = profile?.team_id ?? null;

  // Completed sites for THIS team in the selected month.
  // Lean column list only (NO `select *` / equipment_details / JSON / images),
  // filtered + ordered server-side so we never pull heavy or excess rows.
  const { data: sites, isLoading, isError, error } = useQuery<CompletedSite[]>({
    queryKey: ['team_completed_sites', teamId, month],
    queryFn: async () => {
      if (!teamId) return [];
      try {
        const { data, error } = await supabase
          .from('sites')
          .select('id, code, client_name, address, kwp, kwh, actual_end')
          .eq('team_id', teamId)
          // Archived completed sites keep actual_end, so they remain part of history.
          .in('status', ['completed', 'archived'])
          .gte('actual_end', `${month}-01T00:00:00`)
          .lte('actual_end', `${format(monthEnd, 'yyyy-MM-dd')}T23:59:59`)
          .order('actual_end', { ascending: false });
        if (error) throw error;
        return data ?? [];
      } catch (err) {
        console.error('Stats Fetch Error:', err);
        throw err;
      }
    },
    enabled: !!teamId,
    // Fail fast: a schema/RLS error shouldn't hang the screen for ~30s retrying.
    retry: 1,
  });

  const completed = useMemo(() => sites ?? [], [sites]);

  // Month totals (solar kW + battery kWh).
  const totals = useMemo(() => {
    let kw = 0, kwh = 0;
    for (const s of completed) { kw += s.kwp ?? 0; kwh += s.kwh ?? 0; }
    return { kw, kwh };
  }, [completed]);

  // date (yyyy-MM-dd) → { kw, kwh } that day
  const dailyMap = useMemo(() => {
    const map = new Map<string, { kw: number; kwh: number }>();
    for (const s of completed) {
      if (!s.actual_end) continue;
      const key = format(parseISO(s.actual_end), 'yyyy-MM-dd');
      const cur = map.get(key) ?? { kw: 0, kwh: 0 };
      cur.kw += s.kwp ?? 0;
      cur.kwh += s.kwh ?? 0;
      map.set(key, cur);
    }
    return map;
  }, [completed]);

  // Full calendar grid (Monday-first), padded to whole weeks.
  const calendarDays = useMemo(() => {
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [monthStart, monthEnd]);

  // List filtered by the tapped day (if any).
  const listSites = useMemo(() => {
    if (!selectedDate) return completed;
    return completed.filter((s) => s.actual_end && isSameDay(parseISO(s.actual_end), selectedDate));
  }, [completed, selectedDate]);

  const handleMonthChange = (value: string) => {
    setMonth(value || currentMonth());
    setSelectedDate(null); // clear day filter when month changes
  };

  const toggleDay = (day: Date) => {
    setSelectedDate((prev) => (prev && isSameDay(prev, day) ? null : day));
  };

  return (
    <div className="px-4 pb-[120px] pt-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-text">Statistika</h2>
        <input
          type="month"
          value={month}
          max={currentMonth()}
          onChange={(e) => handleMonthChange(e.target.value)}
          className="h-[40px] px-3 bg-surface border border-border rounded-card text-[14px] text-text font-medium focus:outline-none focus:border-primary shadow-card"
        />
      </div>

      {/* Motivating summary card */}
      <div className="rounded-[20px] p-5 bg-accent text-white shadow-card relative overflow-hidden">
        <div className="absolute -right-4 -top-4 opacity-15">
          <TrendingUp className="w-28 h-28" />
        </div>
        <div className="relative">
          <p className="text-[13px] font-semibold text-white/85 mb-2">Šio mėnesio komandos rezultatas</p>
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex items-end gap-2">
              <Sun className="w-7 h-7 mb-1.5 text-white/90" />
              <span className="text-[40px] leading-none font-extrabold tracking-tight">{num(totals.kw)}</span>
              <span className="text-[18px] font-bold mb-1">kW</span>
            </div>
            {totals.kwh > 0 && (
              <div className="flex items-end gap-2">
                <Battery className="w-7 h-7 mb-1.5 text-white/90" />
                <span className="text-[40px] leading-none font-extrabold tracking-tight">{num(totals.kwh)}</span>
                <span className="text-[18px] font-bold mb-1">kWh</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-3 text-white/90 text-[12px] font-medium">
            <Zap className="w-3.5 h-3.5" />
            {completed.length} užbaigt{completed.length === 1 ? 'as objektas' : 'i objektai'} · {format(monthStart, 'yyyy-MM')}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 text-primary animate-spin" />
        </div>
      ) : isError ? (
        <div className="bg-surface rounded-[20px] border border-danger/40 shadow-card p-6 flex flex-col items-center gap-2 text-center">
          <AlertTriangle className="w-7 h-7 text-danger" />
          <p className="text-[14px] font-semibold text-text">Nepavyko įkelti statistikos</p>
          <p className="text-[12px] text-muted">
            {error instanceof Error ? error.message : 'Patikrinkite interneto ryšį ir bandykite dar kartą.'}
          </p>
        </div>
      ) : (
        <>
          {/* Calendar */}
          <div className="bg-surface rounded-[20px] border border-border shadow-card p-3">
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-[11px] font-bold text-muted py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const dk = dailyMap.get(key);
                const inMonth = isSameMonth(day, monthStart);
                const hasWork = !!dk && (dk.kw > 0 || dk.kwh > 0);
                const isSel = !!selectedDate && isSameDay(day, selectedDate);
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => inMonth && toggleDay(day)}
                    disabled={!inMonth}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center p-0.5 border transition-all ${
                      isSel
                        ? 'bg-primary/10 border-primary ring-2 ring-primary/40'
                        : hasWork
                          ? 'bg-success-bg border-success/40'
                          : 'bg-surface-2 border-transparent'
                    } ${inMonth ? 'cursor-pointer active:scale-95' : 'opacity-35 cursor-default'}`}
                  >
                    <span
                      className={`text-[12px] leading-none ${
                        isToday(day) ? 'font-extrabold text-primary' : 'font-semibold text-text'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {dk && dk.kw > 0 && (
                      <span className="mt-0.5 text-[8px] font-bold text-success leading-tight whitespace-nowrap">
                        +{num(dk.kw)}kW
                      </span>
                    )}
                    {dk && dk.kwh > 0 && (
                      <span className="text-[8px] font-bold text-primary-ink leading-tight whitespace-nowrap">
                        +{num(dk.kwh)}kWh
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Completed sites list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-text font-bold text-[15px] flex items-center gap-2">
                <CalendarDays size={16} className="text-primary-ink" />
                {selectedDate ? format(selectedDate, 'MM-dd') + ' d. objektai' : 'Užbaigti objektai'}
              </h3>
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="flex items-center gap-1 h-[30px] px-2.5 rounded-lg bg-surface-2 text-muted text-[12px] font-semibold active:scale-95 transition-all"
                >
                  <X size={13} /> Rodyti visą mėnesį
                </button>
              )}
            </div>

            {listSites.length === 0 ? (
              <div className="text-center text-muted py-8 bg-surface rounded-[20px] shadow-card border border-border text-[14px]">
                {selectedDate ? 'Šią dieną užbaigtų objektų nėra.' : 'Šį mėnesį užbaigtų objektų nėra.'}
              </div>
            ) : (
              <div className="space-y-2">
                {listSites.map((s) => (
                  <div
                    key={s.id}
                    className="bg-surface rounded-[20px] border border-border shadow-card px-4 py-3 flex items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-text truncate">
                        {s.client_name || s.code || 'Objektas'}
                      </p>
                      {s.address && (
                        <p className="text-[12px] text-muted truncate flex items-center gap-1">
                          <MapPin size={11} className="shrink-0" /> {s.address}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {(s.kwp ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-success-bg text-success border border-success/30 whitespace-nowrap">
                            <Sun className="w-3 h-3" /> {num(s.kwp ?? 0)} kW
                          </span>
                        )}
                        {(s.kwh ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed border border-primary/30 whitespace-nowrap">
                            <Battery className="w-3 h-3" /> {num(s.kwh ?? 0)} kWh
                          </span>
                        )}
                      </div>
                    </div>
                    {s.actual_end && (
                      <span className="text-[12px] text-muted font-medium whitespace-nowrap shrink-0">
                        {format(parseISO(s.actual_end), 'MM-dd')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
