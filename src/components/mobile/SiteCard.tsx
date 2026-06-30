import { useNavigate } from 'react-router-dom';
import { MapPin, CalendarClock, Zap, Battery, PlayCircle } from 'lucide-react';
import { format, isToday, isTomorrow } from 'date-fns';
import { lt } from 'date-fns/locale/lt';
import { isSiteDraft } from '../../lib/siteDraft';
import { isUpcomingInstallerSiteStatus } from '../../lib/siteStatus';
import type { InstallerSite } from '../../api/sites';
import StatusBadge, { type StatusTone } from '../ui/StatusBadge';

interface SiteCardProps {
  site: InstallerSite;
  onStartWork?: () => void;
}

const STATUS_CHIP: Record<string, { label: string; tone: StatusTone; dot?: boolean }> = {
  in_progress: { label: 'Vykdomas',    tone: 'active', dot: true },
  paused:      { label: 'Sustabdytas', tone: 'paused' },
  completed:   { label: 'Baigta',      tone: 'done' },
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
  const isUpcoming = isUpcomingInstallerSiteStatus(site.status);
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
    <div className="bg-surface rounded-[20px] mx-4 mb-3 p-4 shadow-card border border-border">
      {/* Micro-header: object id + status / overdue */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-subtle uppercase tracking-wider">
          Objektas #{site.code}
        </span>
        {isDraft ? (
          <StatusBadge tone="draft" label="Juodraštis" />
        ) : isOverdue ? (
          <StatusBadge tone="overdue" label="Vėluoja" />
        ) : statusChip ? (
          <StatusBadge tone={statusChip.tone} label={statusChip.label} dot={statusChip.dot} />
        ) : null}
      </div>

      {/* Title */}
      <h3 className="text-lg font-bold text-text mt-1 truncate">{site.client_name}</h3>

      {/* Address */}
      <div className="flex items-center gap-1.5 text-muted text-sm mt-0.5">
        <MapPin size={14} className="text-subtle shrink-0" />
        <span className="truncate">{site.address}</span>
      </div>

      {/* Planuojama — schedule reminder (upcoming jobs) */}
      {isUpcoming && site.scheduled_start && (
        <div className="flex items-center gap-2 mt-2 mb-1">
          <CalendarClock size={14} className="text-primary-ink shrink-0" />
          <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Planuojama:</span>
          <span className="text-sm font-bold text-primary-ink">{dateLabel(site.scheduled_start)}</span>
        </div>
      )}

      {/* Pradėta — actual start (active jobs) */}
      {(site.status === 'in_progress' || site.status === 'paused') && site.actual_start && (
        <div className="flex items-center gap-2 mt-2 mb-1">
          <PlayCircle size={14} className="text-success shrink-0" />
          <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Pradėta:</span>
          <span className="text-sm font-bold text-success">{dateLabel(site.actual_start)}</span>
        </div>
      )}

      {/* Capacity summary block */}
      <div className={`grid ${hasBattery ? 'grid-cols-2 divide-x divide-border' : 'grid-cols-1'} border border-border rounded-xl bg-surface-2 mt-3 mb-4 py-2`}>
        <div className="flex flex-col items-center">
          <Zap size={14} className="text-subtle mb-1" />
          <span className="text-sm font-bold text-text">{site.kwp ?? '—'} kWp</span>
          <span className="text-[10px] text-muted uppercase tracking-wide">Sistemos galia</span>
        </div>
        {hasBattery && (
          <div className="flex flex-col items-center">
            <Battery size={14} className="text-subtle mb-1" />
            <span className="text-sm font-bold text-text">{site.kwh} kWh</span>
            <span className="text-[10px] text-muted uppercase tracking-wide">Baterija</span>
          </div>
        )}
      </div>

      {/* Action */}
      <button
        onClick={handleClick}
        className={`w-full py-2.5 rounded-btn font-semibold text-[15px] active:opacity-90 transition-opacity ${
          action.primary ? 'bg-primary text-white shadow-primary' : 'bg-surface-2 text-text'
        }`}
      >
        {action.label}
      </button>
    </div>
  );
}
