import { useNavigate } from 'react-router-dom';
import { MapPin, CalendarClock, Zap, Battery, PlayCircle } from 'lucide-react';
import { format, isToday, isTomorrow } from 'date-fns';
import { lt } from 'date-fns/locale/lt';
import { isSiteDraft } from '../../lib/siteDraft';
import type { InstallerSite } from '../../api/sites';

interface SiteCardProps {
  site: InstallerSite;
  onStartWork?: () => void;
}

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  in_progress: { label: 'Vykdomas',    cls: 'bg-emerald-50 text-emerald-700' },
  paused:      { label: 'Sustabdytas', cls: 'bg-amber-50 text-amber-700' },
  completed:   { label: 'Baigta',      cls: 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-zinc-400' },
};

/** "Šiandien, 10:00" / "Rytoj, 10:00" / "Birželio 2 d., 10:00" (first letter capitalised). */
function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return `Šiandien, ${format(d, 'HH:mm')}`;
  if (isTomorrow(d)) return `Rytoj, ${format(d, 'HH:mm')}`;
  const s = format(d, "MMMM d 'd.,' HH:mm", { locale: lt });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function SiteCard({ site, onStartWork }: SiteCardProps) {
  const navigate = useNavigate();

  const isDraft = isSiteDraft(site);
  const isUpcoming = site.status !== 'in_progress' && site.status !== 'paused' && site.status !== 'completed';
  const isOverdue = isUpcoming && site.scheduled_start && new Date(site.scheduled_start) < new Date();

  const action =
    site.status === 'pending'     ? { label: 'Pradėti darbą', primary: true }  :
    site.status === 'in_progress' ? { label: 'Tęsti darbą',   primary: true }  :
    site.status === 'paused'      ? { label: 'Tęsti darbą',   primary: true }  :
    site.status === 'completed'   ? { label: 'Peržiūrėti',    primary: false } :
                                    { label: 'Atidaryti',     primary: true };

  const statusChip = STATUS_CHIP[site.status ?? ''];
  const hasBattery = site.kwh != null;

  const handleClick = () => {
    if (site.status === 'pending' && onStartWork) onStartWork();
    else void navigate(`/m/sites/${site.id}`);
  };

  return (
    <div className="bg-white dark:bg-[#18181b] rounded-2xl mx-4 mb-3 p-4 shadow-sm border border-gray-100 dark:border-white/10">
      {/* Micro-header: object id + status / overdue */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
          Objektas #{site.code}
        </span>
        {isDraft ? (
          <span className="bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
            Juodraštis
          </span>
        ) : isOverdue ? (
          <span className="bg-red-50 text-red-600 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            Vėluoja
          </span>
        ) : statusChip ? (
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${statusChip.cls}`}>
            {statusChip.label}
          </span>
        ) : null}
      </div>

      {/* Title */}
      <h3 className="text-lg font-bold text-gray-900 dark:text-zinc-100 mt-1 truncate">{site.client_name}</h3>

      {/* Address */}
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-zinc-400 text-sm mt-0.5">
        <MapPin size={14} className="text-gray-400 dark:text-zinc-500 shrink-0" />
        <span className="truncate">{site.address}</span>
      </div>

      {/* Planuojama — schedule reminder (upcoming jobs) */}
      {isUpcoming && site.scheduled_start && (
        <div className="flex items-center gap-2 mt-2 mb-1">
          <CalendarClock size={14} className="text-indigo-500 shrink-0" />
          <span className="text-[11px] text-gray-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">Planuojama:</span>
          <span className="text-sm font-bold text-indigo-700">{dateLabel(site.scheduled_start)}</span>
        </div>
      )}

      {/* Pradėta — actual start (active jobs) */}
      {(site.status === 'in_progress' || site.status === 'paused') && site.actual_start && (
        <div className="flex items-center gap-2 mt-2 mb-1">
          <PlayCircle size={14} className="text-emerald-500 shrink-0" />
          <span className="text-[11px] text-gray-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">Pradėta:</span>
          <span className="text-sm font-bold text-emerald-700">{dateLabel(site.actual_start)}</span>
        </div>
      )}

      {/* Capacity summary block */}
      <div className={`grid ${hasBattery ? 'grid-cols-2 divide-x divide-gray-100 dark:divide-white/10' : 'grid-cols-1'} border border-gray-100 dark:border-white/10 rounded-xl bg-gray-50/50 dark:bg-white/5 mt-3 mb-4 py-2`}>
        <div className="flex flex-col items-center">
          <Zap size={14} className="text-gray-400 dark:text-zinc-500 mb-1" />
          <span className="text-sm font-bold text-gray-900 dark:text-zinc-100">{site.kwp ?? '—'} kWp</span>
          <span className="text-[10px] text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Sistemos galia</span>
        </div>
        {hasBattery && (
          <div className="flex flex-col items-center">
            <Battery size={14} className="text-gray-400 dark:text-zinc-500 mb-1" />
            <span className="text-sm font-bold text-gray-900 dark:text-zinc-100">{site.kwh} kWh</span>
            <span className="text-[10px] text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Baterija</span>
          </div>
        )}
      </div>

      {/* Action */}
      <button
        onClick={handleClick}
        className={`w-full py-2.5 rounded-xl font-semibold text-[15px] active:opacity-90 transition-opacity ${
          action.primary ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-zinc-300'
        }`}
      >
        {action.label}
      </button>
    </div>
  );
}
