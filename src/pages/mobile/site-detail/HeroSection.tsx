import { MapPin, Users } from 'lucide-react';

interface HeroSectionProps {
  clientName: string | null;
  address: string | null;
  status: string | null;
  teamName: string | null;
}

// On the green hero every status chip uses the same translucent treatment;
// only the dot color (and the live pulse) changes.
const STATUS: Record<string, { label: string; dot: string; live?: boolean }> = {
  pending:     { label: 'Laukia',      dot: 'bg-white/60' },
  in_progress: { label: 'Vykdomas',    dot: 'bg-white', live: true },
  paused:      { label: 'Sustabdytas', dot: 'bg-[var(--warning)]' },
  completed:   { label: 'Baigtas',     dot: 'bg-white' },
  archived:    { label: 'Archyvuotas', dot: 'bg-white/50' },
};

const chip = 'inline-flex items-center gap-1.5 bg-white/12 text-white/90 px-3 py-1.5 rounded-lg text-[13px] font-medium';

export default function HeroSection({ clientName, address, status, teamName }: HeroSectionProps) {
  const st = STATUS[status ?? ''];

  return (
    // Forest-green hero (continuous with the header above). Copper sun + solar
    // line-art motif sit faintly top-right.
    <div className="relative bg-accent text-white px-4 pt-2 pb-5 mt-[56px] overflow-hidden">
      {/* Decorative line-art: solar rows + copper sun */}
      <svg
        aria-hidden
        viewBox="0 0 220 120"
        fill="none"
        className="pointer-events-none absolute -right-2 -top-1 w-[200px] h-[110px] opacity-50"
      >
        <g stroke="#ffffff" strokeOpacity="0.22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 70 H90 L112 56 H210" />
          <path d="M30 92 H120 L142 78 H210" />
        </g>
        <g stroke="var(--primary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <circle cx="170" cy="30" r="11" />
          <path d="M170 9v6M170 45v6M149 30h6M185 30h6M155 15l4 4M181 41l4 4M185 15l-4 4M159 41l-4 4" />
        </g>
      </svg>

      {/* Large title + status */}
      <div className="relative flex justify-between items-center gap-4 mt-2">
        <h2 className="text-3xl font-extrabold text-white tracking-tight truncate min-w-0">
          {clientName || 'Nepateiktas pavadinimas'}
        </h2>
        {st && (
          <span className="flex items-center gap-1.5 font-semibold text-xs px-2.5 py-1 rounded-full bg-white/15 border border-white/25 text-white shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${st.dot} ${st.live ? 'animate-pulse' : ''}`} />
            {st.label}
          </span>
        )}
      </div>

      {/* Soft metadata tags */}
      <div className="relative flex flex-wrap items-center gap-2 mt-3 mb-1">
        <span className={`${chip} max-w-full`}>
          <MapPin size={14} className="text-white/80 shrink-0" />
          <span className="truncate">{address || 'Adresas nenurodytas'}</span>
        </span>
        {teamName && (
          <span className={chip}>
            <Users size={14} className="text-white/80 shrink-0" />
            {teamName}
          </span>
        )}
      </div>
    </div>
  );
}
