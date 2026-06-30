import { Loader2, Clock, Pause, Play, CheckCircle2 } from 'lucide-react';
import LiveTimer from '../../../components/mobile/LiveTimer';
import type { Database } from '../../../types/database.types';

type TimeEntry = Database['public']['Tables']['time_entries']['Row'];

interface SiteDetailActionBarProps {
  status: string | null;
  isCheckingIn: boolean;
  isActionPending: boolean;
  onCheckIn: () => void;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  entries: TimeEntry[];
  installerId: string | undefined;
}

const primaryBtn =
  'flex-1 h-[48px] rounded-btn bg-primary text-white font-semibold text-[15px] shadow-primary flex items-center justify-center gap-2 active:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed';
const secondaryBtn =
  'flex-1 h-[48px] rounded-btn bg-surface-2 text-text font-semibold text-[15px] flex items-center justify-center gap-2 active:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed';

export default function SiteDetailActionBar({
  status,
  isCheckingIn,
  isActionPending,
  onCheckIn,
  onPause,
  onResume,
  onComplete,
  entries,
  installerId,
}: SiteDetailActionBarProps) {
  // No actions for completed (or otherwise non-actionable) sites — hide entirely.
  if (status !== 'pending' && status !== 'in_progress' && status !== 'paused') {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[70] backdrop-blur-md bg-surface/90 border-t border-border px-4 pt-3 pb-6">
      {status === 'pending' && (
        <button
          onClick={onCheckIn}
          disabled={isCheckingIn}
          className="w-full h-[52px] rounded-btn bg-primary text-white font-semibold text-[15px] shadow-primary flex items-center justify-center gap-2 active:opacity-90 transition-opacity disabled:opacity-60"
        >
          {isCheckingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Play className="w-[18px] h-[18px]" /> Pradėti darbą</>}
        </button>
      )}

      {status === 'in_progress' && (
        <div className="flex flex-col gap-3">
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 bg-surface-2 text-text font-mono text-sm px-3 py-1 rounded-full">
              <Clock className="w-3.5 h-3.5 text-success" />
              <LiveTimer entries={entries} installerId={installerId} />
            </span>
          </div>
          <div className="flex gap-2.5">
            <button onClick={onPause} disabled={isActionPending} className={secondaryBtn}>
              <Pause className="w-[18px] h-[18px]" /> Pauzė
            </button>
            <button onClick={onComplete} disabled={isActionPending} className={primaryBtn}>
              <CheckCircle2 className="w-[18px] h-[18px]" /> Užbaigti
            </button>
          </div>
        </div>
      )}

      {status === 'paused' && (
        <div className="flex flex-col gap-3">
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 bg-warning-bg text-warning font-mono text-sm px-3 py-1 rounded-full">
              <Pause className="w-3.5 h-3.5" /> Pertrauka
              <LiveTimer entries={entries} installerId={installerId} />
            </span>
          </div>
          <div className="flex gap-2.5">
            <button onClick={onResume} disabled={isActionPending} className={primaryBtn}>
              <Play className="w-[18px] h-[18px]" /> Tęsti
            </button>
            <button onClick={onComplete} disabled={isActionPending} className={secondaryBtn}>
              <CheckCircle2 className="w-[18px] h-[18px]" /> Užbaigti
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
