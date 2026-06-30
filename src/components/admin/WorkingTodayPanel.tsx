import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Map } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface WorkingEntry {
  id?: string;              // site id (for navigation)
  installerName: string;
  avatarUrl: string | null;
  siteName: string;
  siteCode: string;
  startTime: string;        // ISO
  isOnline: boolean;
  lastPhotoAt: string | null; // ISO
  checklistDone: number;
  checklistTotal: number;
}

interface WorkingTodayPanelProps {
  entries: WorkingEntry[];
  onSelect?: (entry: WorkingEntry) => void;
  onOpenMap?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** "2h 14min 36s" / "14min 36s" / "36s" */
function formatElapsed(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}h ${m}min ${s}s`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

function minutesSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

// ── Micro progress ring (28px) ──────────────────────────────────────────────────
function ProgressRing({ done, total }: { done: number; total: number }) {
  const size = 28;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  const complete = total > 0 && done >= total;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="currentColor" strokeWidth={stroke}
          className="text-border"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          className={complete ? 'text-success' : 'text-primary-ink'}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────
function WorkingRow({
  entry,
  now,
  onSelect,
}: {
  entry: WorkingEntry;
  now: number;
  onSelect?: (e: WorkingEntry) => void;
}) {
  const elapsed = formatElapsed(now - new Date(entry.startTime).getTime());
  const offlineMin = minutesSince(entry.lastPhotoAt, now);
  const complete = entry.checklistTotal > 0 && entry.checklistDone >= entry.checklistTotal;

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      onClick={() => onSelect?.(entry)}
      className="group relative flex w-full items-center gap-4 px-5 py-3.5 text-left
                 border-b border-border last:border-0
                 transition-colors hover:bg-surface-2
                 focus:outline-none focus-visible:bg-surface-2"
    >
      {/* Avatar */}
      {entry.avatarUrl ? (
        <img
          src={entry.avatarUrl}
          alt={entry.installerName}
          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10"
        />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-muted ring-1 ring-black/5 dark:ring-white/5">
          {initials(entry.installerName)}
        </div>
      )}

      {/* Identity */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-text">{entry.installerName}</p>
        <p className="truncate text-[13px] text-muted">
          <span className="font-medium text-muted">{entry.siteCode}</span>
          <span className="mx-1.5 text-subtle">·</span>
          {entry.siteName}
        </p>
      </div>

      {/* Live status + elapsed timer */}
      <div className="flex shrink-0 items-center gap-2">
        {entry.isOnline ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
        ) : (
          // Offline: muted dot + hover tooltip "offline N min"
          <span className="group/dot relative flex h-2 w-2">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-subtle" />
            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md
                             border border-border bg-text px-2 py-1
                             text-[11px] text-bg opacity-0 shadow-lg
                             transition-opacity duration-150 group-hover/dot:opacity-100">
              {offlineMin != null ? `offline ${offlineMin} min` : 'offline'}
            </span>
          </span>
        )}
        <span
          className={`w-[112px] text-right font-mono text-[13px] tabular-nums ${
            entry.isOnline ? 'text-text' : 'text-subtle'
          }`}
        >
          {elapsed}
        </span>
      </div>

      {/* Checklist progress */}
      <div className="flex shrink-0 items-center gap-2">
        <ProgressRing done={entry.checklistDone} total={entry.checklistTotal} />
        <span
          className={`w-10 text-right text-[12px] tabular-nums ${
            complete ? 'font-medium text-success' : 'text-muted'
          }`}
        >
          {entry.checklistDone}/{entry.checklistTotal}
        </span>
      </div>

      {/* Hover chevron */}
      <ChevronRight
        size={16}
        className="shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100"
      />
    </motion.button>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
export default function WorkingTodayPanel({ entries, onSelect, onOpenMap }: WorkingTodayPanelProps) {
  // Single 1s tick drives every row's live timer (one interval, all in sync).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="w-full overflow-hidden rounded-[20px] border border-border bg-surface shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[15px] font-semibold tracking-tight text-text">Šiandien dirba</h2>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-medium tabular-nums text-muted">
            {entries.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenMap}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted
                     transition-colors hover:bg-surface-2 hover:text-text focus:outline-none"
        >
          <Map size={15} />
          Žemėlapis
        </button>
      </div>

      <div className="h-px bg-border" />

      {/* Rows / empty state */}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 px-5 py-16 text-center">
          <p className="text-[14px] text-subtle">Šiuo metu niekas nedirba</p>
        </div>
      ) : (
        <AnimatePresence initial={false} mode="popLayout">
          {entries.map((e) => (
            <WorkingRow key={`${e.siteCode}-${e.installerName}`} entry={e} now={now} onSelect={onSelect} />
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}
