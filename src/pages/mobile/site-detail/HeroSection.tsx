import { MapPin, Users } from 'lucide-react';

interface HeroSectionProps {
  clientName: string | null;
  address: string | null;
  status: string | null;
  teamName: string | null;
}

const STATUS: Record<string, { label: string; cls: string; live?: boolean }> = {
  pending:     { label: 'Laukia',      cls: 'bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-zinc-300 border-gray-200 dark:border-white/10' },
  in_progress: { label: 'Vykdomas',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-100', live: true },
  paused:      { label: 'Sustabdytas', cls: 'bg-amber-50 text-amber-700 border-amber-100' },
  completed:   { label: 'Baigtas',     cls: 'bg-blue-50 text-blue-700 border-blue-100' },
};

const chip = 'inline-flex items-center gap-1.5 bg-gray-100/80 dark:bg-white/10 text-gray-700 dark:text-zinc-300 px-3 py-1.5 rounded-lg text-[13px] font-medium';

export default function HeroSection({ clientName, address, status, teamName }: HeroSectionProps) {
  const st = STATUS[status ?? ''];

  return (
    // Shares the same white background as the top nav above it (no top border),
    // forming one continuous iOS "large title" header. Only the bottom is bordered.
    <div className="bg-white dark:bg-[#18181b] px-4 pb-3 mt-[56px] border-b border-gray-100 dark:border-white/10">
      {/* Large title + status */}
      <div className="flex justify-between items-center gap-4 mt-2">
        <h2 className="text-3xl font-extrabold text-gray-900 dark:text-zinc-100 tracking-tight truncate min-w-0">
          {clientName || 'Nepateiktas pavadinimas'}
        </h2>
        {st && (
          <span className={`flex items-center gap-1.5 font-semibold text-xs px-2.5 py-1 rounded-full border shrink-0 ${st.cls}`}>
            {st.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
            {st.label}
          </span>
        )}
      </div>

      {/* Soft, borderless metadata tags */}
      <div className="flex flex-wrap items-center gap-2 mt-3 mb-2">
        <span className={`${chip} max-w-full`}>
          <MapPin size={14} className="text-gray-500 dark:text-zinc-400 shrink-0" />
          <span className="truncate">{address || 'Adresas nenurodytas'}</span>
        </span>
        {teamName && (
          <span className={chip}>
            <Users size={14} className="text-gray-500 dark:text-zinc-400 shrink-0" />
            {teamName}
          </span>
        )}
      </div>
    </div>
  );
}
