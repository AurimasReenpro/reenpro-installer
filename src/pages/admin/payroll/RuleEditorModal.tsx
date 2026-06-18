import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { X, Loader2, Check } from 'lucide-react';
import {
  createPayrollRateRule, payrollErrorMessage, type RuleType, type RuleUnit,
} from '../../../api/payroll';
import { RULE_LABELS, AUTO_RULE_TYPES } from './format';

const RULE_TYPES: RuleType[] = [
  'base_site_fee', 'bess_fixed', 'optimizer_per_unit', 'efficiency_bonus',
  'quality_bonus', 'inverter_extra', 'kwp_band', 'manual_template',
];
const DEFAULT_UNIT: Record<RuleType, RuleUnit> = {
  base_site_fee: 'fixed', bess_fixed: 'fixed', optimizer_per_unit: 'per_unit',
  efficiency_bonus: 'fixed', quality_bonus: 'fixed', inverter_extra: 'fixed',
  kwp_band: 'fixed', manual_template: 'fixed',
};

/** Add a new rule to a rate card. */
export default function RuleEditorModal({
  rateCardId, onClose, onSaved,
}: {
  rateCardId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ruleType, setRuleType] = useState<RuleType>('base_site_fee');
  const [amount, setAmount] = useState('');
  const [code, setCode] = useState('');
  const [targetHoursPerKwp, setTargetHoursPerKwp] = useState('');

  const amountNum = Number(amount.replace(',', '.'));
  const amountValid = /^\d+(\.\d{1,2})?$/.test(amount.trim().replace(',', '.')) && amountNum >= 0;
  const isEfficiency = ruleType === 'efficiency_bonus';

  const save = useMutation({
    mutationFn: () => {
      const params: Record<string, unknown> = {};
      if (isEfficiency && targetHoursPerKwp.trim()) {
        params.target_hours_per_kwp = Number(targetHoursPerKwp.replace(',', '.'));
      }
      return createPayrollRateRule({
        rateCardId,
        code: code.trim() || ruleType.toUpperCase(),
        label: RULE_LABELS[ruleType],
        ruleType,
        amount: Math.round(amountNum * 100) / 100,
        unit: DEFAULT_UNIT[ruleType],
        params,
      });
    },
    onSuccess: () => { toast.success('Taisyklė pridėta.'); onSaved(); onClose(); },
    onError: (e: unknown) => toast.error(payrollErrorMessage(e)),
  });

  const inputCls = 'w-full h-[42px] px-3 bg-zinc-50 dark:bg-[#27272a] border border-transparent dark:border-white/10 rounded-xl text-[14px] text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !save.isPending) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
        className="bg-white dark:bg-[#18181b] rounded-[20px] shadow-2xl w-full max-w-md border border-zinc-100 dark:border-white/10"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-white/10">
          <h2 className="font-bold text-[16px] text-zinc-900 dark:text-zinc-100">Nauja taisyklė</h2>
          <button onClick={onClose} disabled={save.isPending} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-[#27272a] transition-colors cursor-pointer disabled:opacity-50">
            <X size={18} className="text-zinc-400" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Tipas</label>
            <select value={ruleType} onChange={(e) => setRuleType(e.target.value as RuleType)} className={`${inputCls} cursor-pointer`}>
              {RULE_TYPES.map((t) => (
                <option key={t} value={t}>{RULE_LABELS[t]}{AUTO_RULE_TYPES.has(t) ? '' : ' (saugoma)'}</option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-400 mt-1">
              {AUTO_RULE_TYPES.has(ruleType) ? 'Automatinė taisyklė — taikoma perskaičiuojant.' : 'Saugoma rankiniam/būsimam naudojimui — neautomatinė.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Suma (EUR)</label>
              <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={`${inputCls} tabular-nums`} />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Kodas (nebūt.)</label>
              <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BASE" className={inputCls} />
            </div>
          </div>
          {isEfficiency && (
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Tikslas (h / kWp)</label>
              <input type="text" inputMode="decimal" value={targetHoursPerKwp} onChange={(e) => setTargetHoursPerKwp(e.target.value)} placeholder="1.2" className={`${inputCls} tabular-nums`} />
              <p className="text-[11px] text-zinc-400 mt-1">Bonusas taikomas, kai faktinės valandos ≤ kWp × ši reikšmė.</p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} disabled={save.isPending} className="flex-1 h-[42px] rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 font-medium text-[14px] hover:bg-zinc-50 dark:hover:bg-[#27272a] transition-colors cursor-pointer disabled:opacity-50">Atšaukti</button>
            <button onClick={() => save.mutate()} disabled={save.isPending || !amountValid}
              className="flex-1 h-[42px] rounded-xl bg-purple-600 text-white font-medium text-[14px] hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-default cursor-pointer flex items-center justify-center gap-2">
              {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Pridėti
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
