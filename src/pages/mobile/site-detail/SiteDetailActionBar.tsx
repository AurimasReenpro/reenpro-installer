import { useState } from 'react';
import { Loader2, Clock, Pause, Play, CheckCircle2, AlertTriangle } from 'lucide-react';
import LiveTimer from '../../../components/mobile/LiveTimer';
import { isLikelyForgottenTimeEntry } from '../../../lib/timeEntryReview';
import type { Database } from '../../../types/database.types';
import type { WorkPhase } from '../../../lib/workPhases';
import type { SiteType } from '../../../lib/siteTypes';

type TimeEntry = Database['public']['Tables']['time_entries']['Row'];

interface SiteDetailActionBarProps {
  status: string | null;
  siteType: SiteType | null;
  workPhases: WorkPhase[];
  isCheckingIn: boolean;
  isActionPending: boolean;
  onCheckIn: (workPhaseId?: string | null) => void;
  onPause: () => void;
  onResume: (workPhaseId?: string | null) => void;
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
  siteType,
  workPhases,
  isCheckingIn,
  isActionPending,
  onCheckIn,
  onPause,
  onResume,
  onComplete,
  entries,
  installerId,
}: SiteDetailActionBarProps) {
  const [selectedPhaseId, setSelectedPhaseId] = useState('');
  const requiresPhase = siteType === 'b2b' && (status === 'pending' || status === 'paused');
  const phaseMissing = requiresPhase && workPhases.length === 0;
  const phaseRequiredDisabled = requiresPhase && (!selectedPhaseId || phaseMissing);

  // Forgotten-stop guard: the installer's own open entry running > 12h.
  // Mount-time timestamp is enough — the threshold is hour-scale.
  const [nowMs] = useState(() => Date.now());
  const staleOpen = entries.some(
    (e) => e.installer_id === installerId && !e.end_time && isLikelyForgottenTimeEntry(e, nowMs),
  );

  // No actions for completed (or otherwise non-actionable) sites — hide entirely.
  if (status !== 'pending' && status !== 'in_progress' && status !== 'paused') {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[70] backdrop-blur-md bg-surface/90 border-t border-border px-4 pt-3 pb-6">
      {staleOpen && status === 'in_progress' && (
        <div className="mb-3 flex items-start gap-2 rounded-btn border border-warning/30 bg-warning-bg px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-[13px] font-medium text-warning">
            Patikrinkite, ar darbas nebuvo pamirštas sustabdyti.
          </p>
        </div>
      )}
      {requiresPhase && (
        <div className="mb-3">
          <label className="mb-1.5 block text-[12px] font-semibold text-muted">
            Kokį darbą atliekate?
          </label>
          {phaseMissing ? (
            <div className="rounded-btn border border-warning/30 bg-warning-bg px-3 py-2 text-[13px] font-medium text-warning">
              Šiam objektui darbų etapai nesukurti.
            </div>
          ) : (
            <select
              value={selectedPhaseId}
              onChange={(event) => setSelectedPhaseId(event.target.value)}
              className="h-[44px] w-full rounded-btn border border-border bg-surface-2 px-3 text-[14px] font-medium text-text focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Pasirinkite darbą</option>
              {workPhases.map((phase) => (
                <option key={phase.id} value={phase.id}>{phase.label}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {status === 'pending' && (
        <button
          onClick={() => onCheckIn(selectedPhaseId || null)}
          disabled={isCheckingIn || phaseRequiredDisabled}
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
            <button onClick={() => onResume(selectedPhaseId || null)} disabled={isActionPending || phaseRequiredDisabled} className={primaryBtn}>
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
