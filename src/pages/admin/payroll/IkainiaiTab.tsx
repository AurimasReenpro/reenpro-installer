import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Copy, Loader2, Lock, Check, Power, Tag } from 'lucide-react';
import {
  getPayrollRateCardRules, createPayrollRateCard, duplicatePayrollRateCard,
  updatePayrollRateRule, payrollErrorMessage,
  type PayrollRateCard, type PayrollRateRule,
} from '../../../api/payroll';
import { RULE_LABELS, AUTO_RULE_TYPES, RULE_UNIT_LABELS, fmtEur } from './format';
import NameModal from './NameModal';
import RuleEditorModal from './RuleEditorModal';

export default function IkainiaiTab({
  rateCards, selectedCardId, onSelectCard, lockedCardIds, onCardsChanged,
}: {
  rateCards: PayrollRateCard[];
  selectedCardId: string | null;
  onSelectCard: (id: string) => void;
  lockedCardIds: Set<string>;
  onCardsChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [dupFor, setDupFor] = useState<PayrollRateCard | null>(null);
  const [addRule, setAddRule] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const card = rateCards.find((c) => c.id === selectedCardId) ?? null;
  const locked = card ? lockedCardIds.has(card.id) : false;

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['payroll-rate-rules', selectedCardId],
    queryFn: () => getPayrollRateCardRules(selectedCardId as string),
    enabled: !!selectedCardId,
  });

  const invalidateRules = () => void queryClient.invalidateQueries({ queryKey: ['payroll-rate-rules', selectedCardId] });

  const createCard = useMutation({
    mutationFn: (name: string) => createPayrollRateCard({ name }),
    onSuccess: (c) => { toast.success('Tarifų kortelė sukurta.'); setShowNew(false); onCardsChanged(); onSelectCard(c.id); },
    onError: (e: unknown) => toast.error(payrollErrorMessage(e)),
  });

  const dupCard = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => duplicatePayrollRateCard(id, name),
    onSuccess: (c) => { toast.success('Kortelė nukopijuota.'); setDupFor(null); onCardsChanged(); onSelectCard(c.id); },
    onError: (e: unknown) => toast.error(payrollErrorMessage(e)),
  });

  const editAmount = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => updatePayrollRateRule(id, { amount }),
    onSuccess: () => { toast.success('Įkainis atnaujintas.'); invalidateRules(); },
    onError: (e: unknown) => toast.error(payrollErrorMessage(e)),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => updatePayrollRateRule(id, { is_active }),
    onSuccess: () => invalidateRules(),
    onError: (e: unknown) => toast.error(payrollErrorMessage(e)),
  });

  const saveAmount = (r: PayrollRateRule) => {
    const raw = (edits[r.id] ?? '').replace(',', '.').trim();
    setEdits((p) => { const n = { ...p }; delete n[r.id]; return n; });
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return;
    const amount = Math.round(Number(raw) * 100) / 100;
    if (amount !== r.amount) editAmount.mutate({ id: r.id, amount });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
      {/* Cards list */}
      <div className="bg-white dark:bg-[#18181b] border border-zinc-100 dark:border-white/10 rounded-2xl p-3 h-fit">
        <div className="flex items-center justify-between px-2 py-1 mb-1">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Tarifų kortelės</span>
          <button onClick={() => setShowNew(true)} title="Nauja kortelė" className="w-7 h-7 flex items-center justify-center rounded-lg text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors cursor-pointer">
            <Plus size={16} />
          </button>
        </div>
        <div className="space-y-1">
          {rateCards.length === 0 && <p className="text-[13px] text-zinc-400 px-2 py-2">Kortelių nėra.</p>}
          {rateCards.map((c) => {
            const isSel = c.id === selectedCardId;
            return (
              <button key={c.id} onClick={() => onSelectCard(c.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors cursor-pointer flex items-center gap-2 ${isSel ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-500/30' : 'hover:bg-zinc-50 dark:hover:bg-[#27272a] border border-transparent'}`}>
                <Tag size={14} className={isSel ? 'text-purple-600 dark:text-purple-300' : 'text-zinc-400'} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 truncate">{c.name}</span>
                </span>
                {!c.is_active && <span className="text-[10px] text-zinc-400">neaktyvi</span>}
                {lockedCardIds.has(c.id) && <Lock size={12} className="text-zinc-400" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rules */}
      <div className="bg-white dark:bg-[#18181b] border border-zinc-100 dark:border-white/10 rounded-2xl overflow-hidden">
        {!card ? (
          <div className="py-16 text-center text-[14px] text-zinc-400">Pasirinkite tarifų kortelę.</div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-100 dark:border-white/10 flex-wrap">
              <div>
                <h3 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">{card.name}</h3>
                <p className="text-[12px] text-zinc-400">{rules.length} taisykl{rules.length === 1 ? 'ė' : 'ės'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setDupFor(card)} className="inline-flex items-center gap-1.5 h-[36px] px-3 rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 text-[13px] font-medium hover:bg-zinc-50 dark:hover:bg-[#27272a] transition-colors cursor-pointer">
                  <Copy size={14} /> {locked ? 'Dubliuoti ir redaguoti' : 'Dubliuoti'}
                </button>
                {!locked && (
                  <button onClick={() => setAddRule(true)} className="inline-flex items-center gap-1.5 h-[36px] px-3 rounded-xl bg-purple-600 text-white text-[13px] font-medium hover:bg-purple-700 transition-colors cursor-pointer">
                    <Plus size={14} /> Taisyklė
                  </button>
                )}
              </div>
            </div>

            {locked && (
              <div className="mx-5 mt-4 rounded-xl bg-zinc-100/70 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-3 flex items-start gap-2.5">
                <Lock size={16} className="text-zinc-500 shrink-0 mt-0.5" />
                <p className="text-[12px] text-zinc-600 dark:text-zinc-300">Ši kortelė naudojama užrakintame periode — redaguoti negalima. Naudokite „Dubliuoti ir redaguoti“.</p>
              </div>
            )}

            {isLoading ? (
              <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-primary animate-spin inline-block" /></div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-white/10 bg-zinc-50/60 dark:bg-[#27272a]">
                    <th className="py-2.5 px-5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Taisyklė</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Taikymas</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Suma</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Vnt.</th>
                    <th className="py-2.5 px-5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Būsena</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.length === 0 ? (
                    <tr><td colSpan={5} className="py-10 text-center text-[13px] text-zinc-400">Taisyklių nėra.</td></tr>
                  ) : rules.map((r) => {
                    const auto = AUTO_RULE_TYPES.has(r.rule_type);
                    const editing = edits[r.id] !== undefined;
                    return (
                      <tr key={r.id} className={`border-b border-zinc-50 dark:border-white/5 ${r.is_active ? '' : 'opacity-50'}`}>
                        <td className="py-3 px-5">
                          <span className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">{RULE_LABELS[r.rule_type]}</span>
                          {r.label !== RULE_LABELS[r.rule_type] && <span className="block text-[11px] text-zinc-400">{r.label}</span>}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${auto ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20' : 'bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400 border-zinc-200 dark:border-white/10'}`}>
                            {auto ? 'Automatinis' : 'Saugoma'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          {locked ? (
                            <span className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">{fmtEur(r.amount)}</span>
                          ) : editing ? (
                            <input
                              type="text" inputMode="decimal" autoFocus
                              value={edits[r.id]}
                              onChange={(e) => setEdits((p) => ({ ...p, [r.id]: e.target.value }))}
                              onBlur={() => saveAmount(r)}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveAmount(r); if (e.key === 'Escape') setEdits((p) => { const n = { ...p }; delete n[r.id]; return n; }); }}
                              className="w-24 h-[32px] px-2 text-right bg-zinc-50 dark:bg-[#27272a] border border-purple-400 rounded-lg text-[13px] tabular-nums text-zinc-900 dark:text-white focus:outline-none"
                            />
                          ) : (
                            <button onClick={() => setEdits((p) => ({ ...p, [r.id]: String(r.amount) }))} className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 hover:text-purple-600 dark:hover:text-purple-300 cursor-pointer">
                              {fmtEur(r.amount)}
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[12px] text-zinc-400">{r.unit ? (RULE_UNIT_LABELS[r.unit] ?? r.unit) : '—'}</td>
                        <td className="py-3 px-5 text-right">
                          <button
                            onClick={() => toggleActive.mutate({ id: r.id, is_active: !r.is_active })}
                            disabled={locked || toggleActive.isPending}
                            title={r.is_active ? 'Išjungti' : 'Įjungti'}
                            className={`inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default ${r.is_active ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20' : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10'}`}
                          >
                            {r.is_active ? <Check size={13} /> : <Power size={13} />}
                            {r.is_active ? 'Aktyvi' : 'Neaktyvi'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {showNew && (
        <NameModal title="Nauja tarifų kortelė" confirmLabel="Sukurti" pending={createCard.isPending}
          onConfirm={(name) => createCard.mutate(name)} onClose={() => setShowNew(false)} />
      )}
      {dupFor && (
        <NameModal title="Dubliuoti kortelę" label="Naujos kortelės pavadinimas" defaultValue={`${dupFor.name} (kopija)`}
          confirmLabel="Dubliuoti" pending={dupCard.isPending}
          onConfirm={(name) => dupCard.mutate({ id: dupFor.id, name })} onClose={() => setDupFor(null)} />
      )}
      {addRule && card && (
        <RuleEditorModal rateCardId={card.id} onClose={() => setAddRule(false)} onSaved={invalidateRules} />
      )}
    </div>
  );
}
