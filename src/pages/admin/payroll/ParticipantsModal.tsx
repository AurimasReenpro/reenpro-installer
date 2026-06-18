import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { X, Loader2, Check, Users } from 'lucide-react';
import { setPayrollSiteParticipants, recalculatePayrollPeriod, payrollErrorMessage } from '../../../api/payroll';
import type { PayrollInstaller, PayrollSiteSnapshot } from '../../../api/payroll';

/** Manual participant override: pick ≥1 installer + a reason. */
export default function ParticipantsModal({
  periodId,
  year,
  month,
  rateCardId,
  snapshot,
  installers,
  onClose,
  onSaved,
}: {
  periodId: string;
  year: number;
  month: number;
  rateCardId: string | null;
  snapshot: PayrollSiteSnapshot;
  installers: PayrollInstaller[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = useMemo(
    () => new Set(snapshot.participant_override_ids ?? snapshot.participant_ids ?? []),
    [snapshot],
  );
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [reason, setReason] = useState('');

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const canSubmit = selected.size >= 1 && reason.trim().length >= 3;

  const save = useMutation({
    mutationFn: async () => {
      if (!snapshot.site_id) throw new Error('Objektas neturi ID.');
      await setPayrollSiteParticipants(periodId, snapshot.site_id, [...selected], reason.trim());
      // Regenerate site_share earnings for the new participant set.
      if (rateCardId) await recalculatePayrollPeriod(year, month, rateCardId);
    },
    onSuccess: () => {
      toast.success('Dalyviai atnaujinti ir perskaičiuota.');
      onSaved();
      onClose();
    },
    onError: (e: unknown) => toast.error(payrollErrorMessage(e)),
  });

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !save.isPending) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
        className="bg-white dark:bg-[#18181b] rounded-[20px] shadow-2xl w-full max-w-md border border-zinc-100 dark:border-white/10 flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-white/10 shrink-0">
          <div className="min-w-0">
            <h2 className="font-bold text-[16px] text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Users size={17} className="text-purple-600 dark:text-purple-400" /> Keisti dalyvius
            </h2>
            <p className="text-[12px] text-zinc-400 mt-0.5 truncate">
              {snapshot.site?.code} · {snapshot.site?.client_name}
            </p>
          </div>
          <button onClick={onClose} disabled={save.isPending} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-[#27272a] transition-colors cursor-pointer disabled:opacity-50 shrink-0">
            <X size={18} className="text-zinc-400" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              Montuotojai ({selected.size} pasirinkta)
            </label>
            <div className="rounded-xl border border-zinc-200 dark:border-white/10 divide-y divide-zinc-100 dark:divide-white/5 max-h-56 overflow-y-auto">
              {installers.length === 0 ? (
                <p className="text-[13px] text-zinc-400 px-3 py-3">Montuotojų nėra.</p>
              ) : installers.map((u) => {
                const on = selected.has(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggle(u.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-[#27272a] transition-colors cursor-pointer"
                  >
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-purple-600 border-purple-600' : 'border-zinc-300 dark:border-white/20'}`}>
                      {on && <Check size={13} className="text-white" />}
                    </span>
                    <span className="text-[14px] text-zinc-800 dark:text-zinc-200 truncate">
                      {u.full_name ?? 'Be vardo'}
                      {u.role === 'admin' && <span className="ml-1.5 text-[10px] text-zinc-400">(admin)</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Priežastis (privaloma)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Kodėl keičiami dalyviai…"
              className="w-full p-3 bg-zinc-50 dark:bg-[#27272a] border border-transparent dark:border-white/10 rounded-xl text-[14px] text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all resize-y"
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-zinc-100 dark:border-white/10 shrink-0">
          <button onClick={onClose} disabled={save.isPending} className="flex-1 h-[42px] rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 font-medium text-[14px] hover:bg-zinc-50 dark:hover:bg-[#27272a] transition-colors cursor-pointer disabled:opacity-50">
            Atšaukti
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !canSubmit}
            className="flex-1 h-[42px] rounded-xl bg-purple-600 text-white font-medium text-[14px] hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-default cursor-pointer flex items-center justify-center gap-2"
          >
            {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Išsaugoti
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
