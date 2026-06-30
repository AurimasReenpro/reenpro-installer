/**
 * Copper Mist status chip. One place for every site/work status pill so colors
 * stay consistent across mobile + admin. Colors come from tokens only.
 */
export type StatusTone =
  | 'active'      // Aktyvus / Vykdomas — forest green
  | 'overdue'     // Vėluoja — copper
  | 'ordered'     // Užsakytas — sand
  | 'planned'     // Planuojamas — neutral
  | 'done'        // Užbaigtas / Baigta — neutral-muted
  | 'paused'      // Sustabdytas — warning
  | 'draft';      // Juodraštis — warning

const TONE: Record<StatusTone, string> = {
  active:  'bg-success-bg text-success',
  overdue: 'bg-primary-fixed text-on-primary-fixed',
  ordered: 'bg-surface-2 text-muted',
  planned: 'bg-surface-2 text-subtle',
  done:    'bg-surface-2 text-muted',
  paused:  'bg-warning-bg text-warning',
  draft:   'bg-warning-bg text-warning',
};

interface StatusBadgeProps {
  tone: StatusTone;
  label: string;
  /** Show the leading dot (used on "active"/online states). */
  dot?: boolean;
  className?: string;
}

export default function StatusBadge({ tone, label, dot, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${TONE[tone]} ${className}`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}
