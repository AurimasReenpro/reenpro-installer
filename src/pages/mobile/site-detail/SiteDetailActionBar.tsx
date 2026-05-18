interface SiteDetailActionBarProps {
  status: string | null;
  isCheckingIn: boolean;
  isActionPending: boolean;
  onCheckIn: () => void;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
}

export default function SiteDetailActionBar({
  status,
  isCheckingIn,
  isActionPending,
  onCheckIn,
  onPause,
  onResume,
  onComplete
}: SiteDetailActionBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[70] drop-shadow-2xl">
      {status === 'pending' && (
        <button
          onClick={onCheckIn}
          disabled={isCheckingIn}
          className="h-[80px] w-full bg-success text-white flex flex-col items-center justify-center disabled:opacity-80 disabled:cursor-not-allowed transition-transform active:bg-[#0f9e6d]"
        >
          {isCheckingIn ? (
            <span className="material-symbols-outlined animate-spin mb-1 text-2xl">progress_activity</span>
          ) : (
            <>
              <span className="font-bold text-lg leading-tight">PRADĖTI DARBĄ</span>
            </>
          )}
        </button>
      )}

      {status === 'in_progress' && (
        <div className="flex flex-col">
          <div className="h-[80px] bg-white flex gap-3 px-4 py-4 border-t border-outline-variant pb-6">
            <button onClick={onPause} disabled={isActionPending} className="flex-1 rounded-xl text-on-surface font-semibold border-2 border-outline-variant flex items-center justify-center transition-transform active:bg-gray-50 h-[48px] disabled:opacity-50 disabled:cursor-not-allowed">
              PAUZĖ
            </button>
            <button onClick={onComplete} disabled={isActionPending} className="flex-1 rounded-xl bg-success text-white font-semibold flex items-center justify-center transition-transform active:bg-[#0f9e6d] h-[48px] disabled:opacity-50 disabled:cursor-not-allowed">
              UŽBAIGTI DARBĄ
            </button>
          </div>
        </div>
      )}

      {status === 'paused' && (
        <div className="flex flex-col">
          <div className="h-[40px] bg-[#F59E0B] flex items-center justify-center">
            <span className="text-white font-semibold text-sm">⏸️ Pertrauka</span>
          </div>
          <div className="h-[80px] bg-white flex gap-3 px-4 py-4 border-t border-outline-variant pb-6">
            <button onClick={onResume} disabled={isActionPending} className="flex-1 rounded-xl bg-success text-white font-semibold flex items-center justify-center transition-transform active:bg-[#0f9e6d] h-[48px] disabled:opacity-50 disabled:cursor-not-allowed">
              TĘSTI
            </button>
            <button onClick={onComplete} disabled={isActionPending} className="flex-1 rounded-xl text-on-surface font-semibold border-2 border-outline-variant flex items-center justify-center transition-transform active:bg-gray-50 h-[48px] disabled:opacity-50 disabled:cursor-not-allowed">
              UŽBAIGTI DARBĄ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
