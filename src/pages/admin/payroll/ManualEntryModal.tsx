import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { X, Loader2, Check, Coins } from 'lucide-react';
import { addManualPayrollEntry, payrollErrorMessage } from '../../../api/payroll';
import type { ManualEntryType, PayrollInstaller, PayrollSiteSnapshot } from '../../../api/payroll';

const TYPE_OPTIONS: { value: ManualEntryType; label: string }[] = [
  { value: 'bonus', label: 'Bonusas' },
  { value: 'deduction', label: 'Atskaitymas' },
  { value: 'adjustment', label: 'Korekcija' },
];
const MIN_DESCRIPTION = 5;

/**
 * Parse a money string to integer cents WITHOUT float math — split on the
 * decimal point and do integer arithmetic. Returns null for invalid input.
 * Adjustments may be negative; bonus/deduction magnitudes are positive.
 */
function parseMoneyToCents(raw: string, allowNegative: boolean): number | null {
  const s = raw.trim().replace(',', '.');
  const re = allowNegative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/;
  if (!re.test(s)) return null;
  const neg = s.startsWith('-');
  const [intPart, fracRaw = ''] = s.replace('-', '').split('.');
  const frac = (fracRaw + '00').slice(0, 2);
  const cents = Number(intPart) * 100 + Number(frac);
  return neg ? -cents : cents;
}

export default function ManualEntryModal({
  periodId,
  installers,
  snapshots,
  defaultInstallerId = '',
  defaultSnapshotId = null,
  defaultType = 'bonus',
  onClose,
  onSaved,
}: {
  periodId: string;
  installers: PayrollInstaller[];
  snapshots: PayrollSiteSnapshot[];
  defaultInstallerId?: string;
  defaultSnapshotId?: string | null;
  defaultType?: ManualEntryType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [installerId, setInstallerId] = useState(defaultInstallerId);
  const [type, setType] = useState<ManualEntryType>(defaultType);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [snapshotId, setSnapshotId] = useState<string | null>(defaultSnapshotId);

  const allowNegative = type === 'adjustment';
  const cents = parseMoneyToCents(amount, allowNegative);
  const descTrimmed = description.trim();
  const descValid = descTrimmed.length >= MIN_DESCRIPTION;
  // bonus/deduction: positive magnitude; adjustment: any non-zero
  const amountValid = cents != null && cents !== 0 && (allowNegative || cents > 0);
  const canSubmit = !!installerId && amountValid && descValid;

  const save = useMutation({
    mutationFn: async () => {
      if (!installerId) throw new Error('Pasirinkite montuotoją.');
      if (cents == null || cents === 0 || (!allowNegative && cents <= 0)) {
        throw new Error('Įveskite teisingą sumą.');
      }
      if (!descValid) throw new Error(`Aprašymas privalomas (bent ${MIN_DESCRIPTION} simboliai).`);
      // Send the magnitude in euros (cents/100 is exact for ≤2dp); the backend
      // stores deductions negative regardless of the sign we send.
      await addManualPayrollEntry({
        periodId,
        installerId,
        siteSnapshotId: snapshotId,
        type,
        amount: cents / 100,
        description: descTrimmed,
      });
    },
    onSuccess: () => {
      toast.success('Įrašas pridėtas.');
      onSaved();
      onClose();
    },
    onError: (e: unknown) => {
      if (e instanceof Error && /^(Pasirinkite|Įveskite|Aprašymas)/.test(e.message)) toast.error(e.message);
      else toast.error(payrollErrorMessage(e));
    },
  });

  const inputCls =
    'w-full h-[42px] px-3 bg-zinc-50 dark:bg-[#27272a] border border-transparent dark:border-white/10 rounded-xl text-[14px] text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !save.isPending) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
        className="bg-white dark:bg-[#18181b] rounded-[20px] shadow-2xl w-full max-w-md border border-zinc-100 dark:border-white/10 flex flex-col max-h-[88vh]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-white/10 shrink-0">
          <h2 className="font-bold text-[16px] text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Coins size={17} className="text-purple-600 dark:text-purple-400" /> Naujas įrašas
          </h2>
          <button onClick={onClose} disabled={save.isPending} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-[#27272a] transition-colors cursor-pointer disabled:opacity-50">
            <X size={18} className="text-zinc-400" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Installer */}
          <div>
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Montuotojas</label>
            <select value={installerId} onChange={(e) => setInstallerId(e.target.value)} className={`${inputCls} cursor-pointer`}>
              <option value="">— Pasirinkti —</option>
              {installers.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name ?? 'Be vardo'}{u.role === 'admin' ? ' (admin)' : ''}</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Tipas</label>
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-[#27272a] rounded-xl p-1">
              {TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value} type="button" onClick={() => setType(o.value)}
                  className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition-all cursor-pointer ${
                    type === o.value ? 'bg-white dark:bg-[#3f3f46] shadow-sm text-purple-600 dark:text-purple-300' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                  }`}
                >{o.label}</button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Suma (EUR)</label>
            <div className="relative">
              <input
                type="text" inputMode="decimal" value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder={allowNegative ? '-0.00' : '0.00'}
                className={`${inputCls} pr-9 tabular-nums`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 pointer-events-none">€</span>
            </div>
            {type === 'deduction' ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">Įveskite teigiamą sumą — bus išsaugota kaip neigiama.</p>
            ) : type === 'adjustment' ? (
              <p className="text-[11px] text-zinc-400 mt-1">Korekcija gali būti teigiama arba neigiama.</p>
            ) : (
              <p className="text-[11px] text-zinc-400 mt-1">Įveskite teigiamą sumą.</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Aprašymas (privaloma)</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              placeholder="Pvz.: priedas už viršvalandžius."
              className="w-full p-3 bg-zinc-50 dark:bg-[#27272a] border border-transparent dark:border-white/10 rounded-xl text-[14px] text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all resize-y"
            />
            <p className={`text-[11px] mt-1 ${descValid || descTrimmed.length === 0 ? 'text-zinc-400' : 'text-red-500'}`}>
              {descTrimmed.length}/{MIN_DESCRIPTION} simbolių minimum
            </p>
          </div>

          {/* Optional site snapshot */}
          <div>
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Susieti su objektu (nebūtina)</label>
            <select
              value={snapshotId ?? ''} onChange={(e) => setSnapshotId(e.target.value || null)}
              className={`${inputCls} cursor-pointer`}
            >
              <option value="">— Nesusieta —</option>
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>{s.site?.code ?? '—'} · {s.site?.client_name ?? ''}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-zinc-100 dark:border-white/10 shrink-0">
          <button onClick={onClose} disabled={save.isPending} className="flex-1 h-[42px] rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 font-medium text-[14px] hover:bg-zinc-50 dark:hover:bg-[#27272a] transition-colors cursor-pointer disabled:opacity-50">
            Atšaukti
          </button>
          <button
            onClick={() => save.mutate()} disabled={save.isPending || !canSubmit}
            className="flex-1 h-[42px] rounded-xl bg-purple-600 text-white font-medium text-[14px] hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-default cursor-pointer flex items-center justify-center gap-2"
          >
            {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Pridėti
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
