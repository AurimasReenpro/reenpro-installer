import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { X, Loader2, Check, SlidersHorizontal } from 'lucide-react';
import {
  getPayrollSiteRuleState, getPayrollSiteEffectiveRateCard, setPayrollSiteRuleOverride,
  setPayrollSiteRateCardOverride, recalculatePayrollPeriod, payrollErrorMessage,
  type PayrollRateCard, type PayrollSiteRuleState, type RuleOverrideMode,
} from '../../../api/payroll';
import { fmtEur } from './format';
import {
  parseNum as num,
  effectivePreview,
  hasRuleEditChanged,
  initialRuleEdit,
  validateEdit,
  type RuleEdit as Edit,
} from './ruleOverride';

const MODES: { value: RuleOverrideMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'force_apply', label: 'Taikyti' },
  { value: 'force_skip', label: 'Praleisti' },
];

const MISSING_RULE_RPC_MESSAGE =
  'Payroll taisyklių RPC nerastas. Patikrinkite ar pritaikyta naujausia migracija.';

function ruleRpcErrorMessage(err: unknown): string {
  const e = (err ?? {}) as {
    code?: string;
    status?: number;
    message?: string;
    details?: string;
    hint?: string;
  };
  const text = `${e.message ?? ''} ${e.details ?? ''} ${e.hint ?? ''}`.toLowerCase();

  if (
    e.status === 404
    || e.code === 'PGRST202'
    || (
      (
        text.includes('get_payroll_site_rule_state')
        || text.includes('set_payroll_site_rule_override')
        || text.includes('get_payroll_site_effective_rate_card')
        || text.includes('set_payroll_site_rate_card_override')
      )
      && (
        text.includes('not found')
        || text.includes('could not find')
        || text.includes('schema cache')
        || text.includes('function')
      )
    )
  ) {
    return MISSING_RULE_RPC_MESSAGE;
  }

  return payrollErrorMessage(err);
}

export default function SiteRulesModal({
  periodId, siteId, siteCode, siteClient, year, month, rateCardId, rateCards, onClose, onSaved,
}: {
  periodId: string;
  siteId: string;
  siteCode: string;
  siteClient: string;
  year: number;
  month: number;
  rateCardId: string;
  rateCards: PayrollRateCard[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [rateCardChoice, setRateCardChoice] = useState<string | null | undefined>(undefined);

  const { data: effectiveRateCard, isLoading: effectiveRateCardLoading } = useQuery({
    queryKey: ['payroll-effective-rate-card', periodId, siteId],
    queryFn: () => getPayrollSiteEffectiveRateCard(periodId, siteId),
  });
  const savedOverrideRateCardId = effectiveRateCard?.source === 'site_override'
    ? effectiveRateCard.effective_rate_card_id
    : null;
  const selectedOverrideRateCardId = rateCardChoice === undefined ? savedOverrideRateCardId : rateCardChoice;
  const previewRateCardId = selectedOverrideRateCardId ?? rateCardId;
  const periodRateCard = rateCards.find((card) => card.id === rateCardId);
  const rateCardChanged = !!effectiveRateCard && selectedOverrideRateCardId !== savedOverrideRateCardId;

  const { data: rules = [], isLoading, isError, error } = useQuery({
    queryKey: ['payroll-rule-state', periodId, siteId, previewRateCardId],
    queryFn: () => getPayrollSiteRuleState(periodId, siteId, previewRateCardId),
    enabled: !!previewRateCardId,
  });

  const editFor = (r: PayrollSiteRuleState): Edit => edits[r.rate_rule_id] ?? initialRuleEdit(r);
  const setEdit = (id: string, patch: Partial<Edit>, base: Edit) =>
    setEdits((p) => ({ ...p, [id]: { ...base, ...patch } }));

  const changed = (r: PayrollSiteRuleState, e: Edit) => hasRuleEditChanged(r, e);

  const errors = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rules) {
      const e = editFor(r);
      if (changed(r, e)) {
        const err = validateEdit(r, e);
        if (err) m.set(r.rate_rule_id, err);
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, edits]);

  const changedRuleCount = rules.filter((r) => changed(r, editFor(r))).length;
  const changedCount = changedRuleCount + (rateCardChanged ? 1 : 0);
  const canSubmit = errors.size === 0;

  const save = useMutation({
    mutationFn: async () => {
      if (rateCardChanged) {
        await setPayrollSiteRateCardOverride({
          periodId,
          siteId,
          rateCardId: selectedOverrideRateCardId,
        });
      }
      for (const r of rules) {
        const e = editFor(r);
        if (!changed(r, e)) continue;
        await setPayrollSiteRuleOverride({
          periodId, siteId, rateRuleId: r.rate_rule_id,
          mode: e.mode,
          quantityOverride: e.mode === 'auto' ? null : num(e.quantity),
          amountOverride: e.mode === 'auto' ? null : num(e.amount),
          note: e.mode === 'auto' ? null : e.note.trim(),
        });
      }
      // Re-run the engine so snapshots + earnings reflect the new rule selection.
      await recalculatePayrollPeriod(year, month, rateCardId);
    },
    onSuccess: async () => {
      toast.success('Įkainiai pritaikyti ir periodas perskaičiuotas.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['payroll-period', year, month] }),
        queryClient.invalidateQueries({
          predicate: (q) => q.queryKey[0] === 'payroll-site-snapshots' || q.queryKey[0] === 'payroll-earnings',
        }),
        queryClient.invalidateQueries({ queryKey: ['payroll-rule-state', periodId, siteId] }),
        queryClient.invalidateQueries({ queryKey: ['payroll-effective-rate-card', periodId, siteId] }),
        queryClient.invalidateQueries({ queryKey: ['payroll-rate-cards'] }),
      ]);
      onSaved();
      onClose();
    },
    onError: (e: unknown) => toast.error(ruleRpcErrorMessage(e)),
  });

  const inputCls = 'h-[34px] w-24 px-2 bg-zinc-50 dark:bg-surface-2 border border-zinc-200 dark:border-white/10 rounded-lg text-[13px] tabular-nums text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !save.isPending) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
        className="bg-surface rounded-[20px] shadow-2xl w-full max-w-3xl border border-zinc-100 dark:border-white/10 flex flex-col max-h-[88vh]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-white/10 shrink-0">
          <div className="min-w-0">
            <h2 className="font-bold text-[16px] text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <SlidersHorizontal size={17} className="text-primary dark:text-primary-ink" /> Taisyklės objektui
            </h2>
            <p className="text-[12px] text-zinc-400 mt-0.5 truncate">{siteCode} · {siteClient}</p>
          </div>
          <button onClick={onClose} disabled={save.isPending} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50 shrink-0">
            <X size={18} className="text-zinc-400" />
          </button>
        </div>

        <div className="overflow-auto">
          <div className="px-6 py-4 border-b border-zinc-100 dark:border-white/10 bg-zinc-50/40 dark:bg-surface-2">
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Tarifo kortelė šiam objektui</label>
            <select
              value={selectedOverrideRateCardId ?? ''}
              onChange={(event) => {
                setRateCardChoice(event.target.value || null);
                setEdits({});
              }}
              disabled={save.isPending || effectiveRateCardLoading}
              className="w-full h-[38px] px-3 bg-surface border border-zinc-200 dark:border-white/10 rounded-lg text-[13px] text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              <option value="">Naudoti periodo kortelę: {periodRateCard?.name ?? 'nepasirinkta'}</option>
              {rateCards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
            </select>
          </div>
          {isLoading || effectiveRateCardLoading ? (
            <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-primary animate-spin inline-block" /></div>
          ) : isError ? (
            <div className="py-16 px-6 text-center text-[14px] text-red-600 dark:text-red-400">
              {ruleRpcErrorMessage(error)}
            </div>
          ) : rules.length === 0 ? (
            <div className="py-16 text-center text-[14px] text-zinc-400">Aktyvių taisyklių nėra.</div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-white/10 bg-zinc-50/60 dark:bg-surface-2">
                  <th className="py-2 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Taisyklė</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Numatyta</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Režimas</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Kiekis</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Suma</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pastaba</th>
                  <th className="py-2 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Efektyvi</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => {
                  const e = editFor(r);
                  const eff = effectivePreview(r, e);
                  const err = errors.get(r.rate_rule_id);
                  const perUnit = r.unit === 'per_unit';
                  return (
                    <tr key={r.rate_rule_id} className="border-b border-zinc-50 dark:border-white/5 align-top">
                      <td className="py-3 px-4">
                        <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">{r.label}</p>
                        <p className="text-[11px] text-zinc-400">{fmtEur(r.amount)}{perUnit ? ' / vnt.' : ''}</p>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${r.default_applicable ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20' : 'bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400 border-zinc-200 dark:border-white/10'}`}>
                          {r.default_applicable ? 'Taip' : 'Ne'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="inline-flex bg-zinc-100 dark:bg-surface-2 rounded-lg p-0.5">
                          {MODES.map((m) => (
                            <button key={m.value} onClick={() => setEdit(r.rate_rule_id, { mode: m.value }, e)}
                              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${e.mode === m.value ? 'bg-white dark:bg-[#3f3f46] shadow-sm text-primary dark:text-primary-ink' : 'text-zinc-500 dark:text-zinc-400'}`}>
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {perUnit ? (
                          <input type="text" inputMode="decimal" value={e.quantity}
                            onChange={(ev) => setEdit(r.rate_rule_id, { quantity: ev.target.value }, e)}
                            placeholder={r.detected_quantity != null ? String(r.detected_quantity) : '0'}
                            className={inputCls} />
                        ) : <span className="text-zinc-300 dark:text-zinc-600 text-[12px]">—</span>}
                      </td>
                      <td className="py-3 px-3">
                        <input type="text" inputMode="decimal" value={e.amount}
                          onChange={(ev) => setEdit(r.rate_rule_id, { amount: ev.target.value }, e)}
                          placeholder={String(r.amount)} className={inputCls} />
                      </td>
                      <td className="py-3 px-3">
                        <input type="text" value={e.note}
                          onChange={(ev) => setEdit(r.rate_rule_id, { note: ev.target.value }, e)}
                          placeholder={e.mode === 'auto' ? '—' : 'priežastis…'}
                          disabled={e.mode === 'auto'}
                          className="h-[34px] w-40 px-2 bg-zinc-50 dark:bg-surface-2 border border-zinc-200 dark:border-white/10 rounded-lg text-[12px] text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50" />
                        {err && <p className="text-[10px] text-red-500 mt-1">{err}</p>}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        <span className={`text-[13px] font-bold ${eff.applied ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 line-through'}`}>{fmtEur(eff.amount)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-zinc-100 dark:border-white/10 shrink-0">
          <span className="text-[12px] text-zinc-400">{changedCount} pakeit{changedCount === 1 ? 'imas' : 'imai'}</span>
          <div className="flex gap-3">
            <button onClick={onClose} disabled={save.isPending} className="h-[42px] px-4 rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 font-medium text-[14px] hover:bg-zinc-50 dark:hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50">
              Atšaukti
            </button>
            <button onClick={() => save.mutate()} disabled={save.isPending || !canSubmit || changedCount === 0}
              className="h-[42px] px-4 rounded-xl bg-primary text-white font-medium text-[14px] hover:bg-primary transition-all disabled:opacity-50 disabled:cursor-default cursor-pointer flex items-center justify-center gap-2">
              {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Išsaugoti ir perskaičiuoti
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
