import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Coins, Loader2, AlertTriangle } from 'lucide-react';
import { getSiteCompensation, upsertSiteCompensation } from '../../../api/payroll.legacy';

/**
 * LEGACY — fixed-fee "Objekto kaina" card (site_compensation model).
 * Superseded by the rate-card payroll engine; no longer mounted in the UI
 * (removed from InfoTab). Kept isolated, not deleted. Do not re-introduce —
 * per-site fixed fees are not part of the new model.
 */
export default function SiteFeeCard({ siteId, status }: { siteId: string; status: string | null }) {
  const queryClient = useQueryClient();

  const { data: comp, isLoading } = useQuery({
    queryKey: ['site_compensation', siteId],
    queryFn: () => getSiteCompensation(siteId),
  });

  const savedFee = comp?.fixed_fee != null ? String(comp.fixed_fee) : '';
  const savedNotes = comp?.notes ?? '';
  const sig = `${siteId}|${savedFee}|${savedNotes}`;

  const [fee, setFee] = useState('');
  const [notes, setNotes] = useState('');
  const [syncedSig, setSyncedSig] = useState<string | null>(null);

  // Hydrate the form from server data using the render-phase reset pattern
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  // `sig` only changes when the persisted values change, so this never clobbers
  // an in-progress edit — and it avoids a setState-in-effect cascade.
  if (!isLoading && syncedSig !== sig) {
    setSyncedSig(sig);
    setFee(savedFee);
    setNotes(savedNotes);
  }

  const dirty = fee !== savedFee || notes !== savedNotes;

  const save = useMutation({
    mutationFn: () => {
      const parsed = parseFloat(fee.replace(',', '.'));
      if (!isFinite(parsed) || parsed < 0) {
        throw new Error('Įveskite teisingą kainą (≥ 0).');
      }
      return upsertSiteCompensation({
        siteId,
        fixedFee: Math.round(parsed * 100) / 100,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success('Objekto kaina išsaugota!');
      void queryClient.invalidateQueries({ queryKey: ['site_compensation', siteId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Klaida'),
  });

  const missing = !isLoading && comp == null;
  const showWarning = missing && status === 'completed';

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-text text-[15px] flex items-center gap-2">
          <Coins className="w-4 h-4 text-primary dark:text-primary-ink" />
          Objekto kaina
        </h3>
        {showWarning && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/20 px-2 py-0.5 rounded-full">
            <AlertTriangle size={11} /> Kaina nenustatyta
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-[12px] text-subtle font-medium tracking-wide block mb-1">
              Fiksuota kaina (EUR)
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0.00"
                className="w-full h-[40px] pl-3 pr-9 bg-surface-2 border border-border rounded-xl text-[14px] text-text tabular-nums focus:outline-none focus:border-primary focus:bg-white dark:focus:bg-surface-2 transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-subtle font-medium pointer-events-none">
                €
              </span>
            </div>
          </div>

          <div>
            <label className="text-[12px] text-subtle font-medium tracking-wide block mb-1">
              Pastaba (nebūtina)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Pvz.: papildomos sąlygos"
              className="w-full h-[40px] px-3 bg-surface-2 border border-border rounded-xl text-[14px] text-text focus:outline-none focus:border-primary focus:bg-white dark:focus:bg-surface-2 transition-colors"
            />
          </div>

          <div className="flex items-center justify-between pt-0.5">
            <p className="text-[11px] text-subtle">
              {comp?.updated_at
                ? `Atnaujinta: ${new Date(comp.updated_at).toLocaleDateString('lt-LT')}`
                : 'Dar nenustatyta'}
            </p>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || !dirty}
              className="flex items-center gap-1.5 h-[36px] px-4 rounded-xl bg-primary text-white font-medium text-[13px] hover:bg-primary transition-all disabled:opacity-40 disabled:cursor-default cursor-pointer"
            >
              {save.isPending && <Loader2 size={14} className="animate-spin" />}
              Išsaugoti
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
