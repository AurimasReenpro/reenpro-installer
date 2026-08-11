import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Copy, Loader2, Lock, Check, Power, Tag, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { useConfirm } from '../../../hooks/useConfirm';
import {
  getPayrollRateCardRules, createPayrollRateCard, duplicatePayrollRateCard,
  updatePayrollRateCard, updatePayrollRateRule, deletePayrollRateRule,
  deactivatePayrollRateRule, getPayrollRateRuleUsage, payrollErrorMessage,
  type PayrollRateCard, type PayrollRateRule,
} from '../../../api/payroll';
import { AUTO_RULE_TYPES, RULE_UNIT_LABELS, fmtEur } from './format';
import NameModal from './NameModal';
import RuleEditorModal from './RuleEditorModal';
import { filterRateRules, getRuleRemovalAction, validateRateCardName } from './rateCardManagement';
import { validateRuleLabel } from './siteRateCard';

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
  const confirm = useConfirm();
  const [showNew, setShowNew] = useState(false);
  const [dupFor, setDupFor] = useState<PayrollRateCard | null>(null);
  const [editCard, setEditCard] = useState<PayrollRateCard | null>(null);
  const [addRule, setAddRule] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [labelEdits, setLabelEdits] = useState<Record<string, string>>({});
  const [showInactive, setShowInactive] = useState(false);

  const card = rateCards.find((c) => c.id === selectedCardId) ?? null;
  const locked = card ? lockedCardIds.has(card.id) : false;

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['payroll-rate-rules', selectedCardId],
    queryFn: () => getPayrollRateCardRules(selectedCardId as string),
    enabled: !!selectedCardId,
  });
  const visibleRules = filterRateRules(rules, showInactive);
  const activeRuleCount = rules.filter((rule) => rule.is_active).length;

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

  const renameCard = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updatePayrollRateCard(id, { name }),
    onMutate: async ({ id, name }) => {
      await queryClient.cancelQueries({ queryKey: ['payroll-rate-cards'] });
      const previous = queryClient.getQueryData<PayrollRateCard[]>(['payroll-rate-cards']);
      queryClient.setQueryData<PayrollRateCard[]>(['payroll-rate-cards'], (cards) =>
        cards?.map((item) => item.id === id ? { ...item, name } : item),
      );
      return { previous };
    },
    onSuccess: () => { toast.success('Kortelės pavadinimas atnaujintas.'); setEditCard(null); onCardsChanged(); },
    onError: (e: unknown, _input, context) => {
      queryClient.setQueryData(['payroll-rate-cards'], context?.previous);
      toast.error(payrollErrorMessage(e));
    },
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

  const removeRule = useMutation({
    mutationFn: async (rule: PayrollRateRule) => {
      const usage = await getPayrollRateRuleUsage(rule.id, rule.rate_card_id);
      const action = getRuleRemovalAction({ cardLocked: locked, ...usage });
      if (action === 'blocked') throw new Error('Kortelė naudojama užrakintame periode.');
      if (action === 'delete') await deletePayrollRateRule(rule.id);
      else await deactivatePayrollRateRule(rule.id);
      return action;
    },
    onSuccess: (action) => {
      toast.success(action === 'delete' ? 'Taisyklė ištrinta.' : 'Taisyklė išjungta, nes ji jau naudota skaičiavimuose.');
      invalidateRules();
      onCardsChanged();
    },
    onError: (e: unknown) => toast.error(payrollErrorMessage(e)),
  });

  const saveAmount = (r: PayrollRateRule) => {
    const raw = (edits[r.id] ?? '').replace(',', '.').trim();
    setEdits((p) => { const n = { ...p }; delete n[r.id]; return n; });
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return;
    const amount = Math.round(Number(raw) * 100) / 100;
    if (amount !== r.amount) editAmount.mutate({ id: r.id, amount });
  };

  const saveLabel = (r: PayrollRateRule) => {
    const label = (labelEdits[r.id] ?? '').trim();
    setLabelEdits((previous) => { const next = { ...previous }; delete next[r.id]; return next; });
    const error = validateRuleLabel(label);
    if (error) { toast.error(error); return; }
    if (label !== r.label) updatePayrollRateRule(r.id, { label }).then(invalidateRules).catch((e: unknown) => toast.error(payrollErrorMessage(e)));
  };

  const handleRemoveRule = async (rule: PayrollRateRule) => {
    if (locked) return;
    if (rule.is_active && activeRuleCount === 1) {
      toast.error('Tai paskutinė aktyvi taisyklė šioje kortelėje. Palikite bent vieną aktyvią taisyklę arba dubliuokite kortelę.');
      return;
    }
    const ok = await confirm({
      title: 'Ištrinti taisyklę?',
      message: 'Jei taisyklė jau naudota skaičiavimuose, ji bus išjungta, o ne pašalinta.',
      confirmText: 'Ištrinti',
      cancelText: 'Atšaukti',
      variant: 'danger',
    });
    if (ok) removeRule.mutate(rule);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
      {/* Cards list */}
      <div className="bg-surface border border-border dark:border-white/10 rounded-card p-3 h-fit">
        <div className="flex items-center justify-between px-2 py-1 mb-1">
          <span className="text-[11px] font-bold text-subtle uppercase tracking-wider">Tarifų kortelės</span>
          <button onClick={() => setShowNew(true)} title="Nauja kortelė" className="w-7 h-7 flex items-center justify-center rounded-lg text-primary dark:text-primary-ink hover:bg-primary-fixed dark:hover:bg-primary/20 transition-colors cursor-pointer">
            <Plus size={16} />
          </button>
        </div>
        <div className="space-y-1">
          {rateCards.length === 0 && <p className="text-[13px] text-subtle px-2 py-2">Kortelių nėra.</p>}
          {rateCards.map((c) => {
            const isSel = c.id === selectedCardId;
            return (
              <button key={c.id} onClick={() => onSelectCard(c.id)}
                className={`w-full text-left px-3 py-2.5 rounded-card transition-colors cursor-pointer flex items-center gap-2 ${isSel ? 'bg-primary-fixed dark:bg-primary/20 border border-primary dark:border-primary/30' : 'hover:bg-surface-2 dark:hover:bg-surface-2 border border-transparent'}`}>
                <Tag size={14} className={isSel ? 'text-primary dark:text-primary-ink' : 'text-subtle'} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-text truncate">{c.name}</span>
                </span>
                {!c.is_active && <span className="text-[10px] text-subtle">neaktyvi</span>}
                {lockedCardIds.has(c.id) && <Lock size={12} className="text-subtle" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rules */}
      <div className="bg-surface border border-border dark:border-white/10 rounded-card overflow-hidden">
        {!card ? (
          <div className="py-16 text-center text-[14px] text-subtle">Pasirinkite tarifų kortelę.</div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border dark:border-white/10 flex-wrap">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-[15px] font-bold text-text">{card.name}</h3>
                  {!locked && (
                    <button onClick={() => setEditCard(card)} title="Pervadinti kortelę" className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-subtle hover:text-primary hover:bg-primary-fixed dark:hover:bg-primary/20 transition-colors cursor-pointer">
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
                <p className="text-[12px] text-subtle">{activeRuleCount} aktyvi{activeRuleCount === 1 ? '' : 'os'} taisykl{activeRuleCount === 1 ? 'ė' : 'ės'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowInactive((value) => !value)} title={showInactive ? 'Slėpti išjungtas taisykles' : 'Rodyti išjungtas taisykles'} className="w-9 h-[36px] inline-flex items-center justify-center rounded-card border border-border dark:border-white/10 text-subtle hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors cursor-pointer">
                  {showInactive ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button onClick={() => setDupFor(card)} className="inline-flex items-center gap-1.5 h-[36px] px-3 rounded-card border border-border dark:border-white/10 text-text text-[13px] font-medium hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors cursor-pointer">
                  <Copy size={14} /> {locked ? 'Dubliuoti ir redaguoti' : 'Dubliuoti'}
                </button>
                {!locked && (
                  <button onClick={() => setAddRule(true)} className="inline-flex items-center gap-1.5 h-[36px] px-3 rounded-card bg-primary text-white text-[13px] font-medium hover:bg-primary transition-colors cursor-pointer">
                    <Plus size={14} /> Taisyklė
                  </button>
                )}
              </div>
            </div>

            {locked && (
              <div className="mx-5 mt-4 rounded-card bg-surface-2/70 dark:bg-white/5 border border-border dark:border-white/10 px-4 py-3 flex items-start gap-2.5">
                <Lock size={16} className="text-subtle shrink-0 mt-0.5" />
                <p className="text-[12px] text-muted">Kortelė naudota užrakintame periode. Tiesioginis redagavimas negalimas — dubliuokite kortelę.</p>
              </div>
            )}

            {isLoading ? (
              <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-primary animate-spin inline-block" /></div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border dark:border-white/10 bg-surface-2/60 dark:bg-surface-2">
                    <th className="py-2.5 px-5 text-[10px] font-bold text-subtle uppercase tracking-wider">Taisyklė</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-subtle uppercase tracking-wider">Taikymas</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-subtle uppercase tracking-wider text-right">Suma</th>
                    <th className="py-2.5 px-4 text-[10px] font-bold text-subtle uppercase tracking-wider">Vnt.</th>
                    <th className="py-2.5 px-5 text-[10px] font-bold text-subtle uppercase tracking-wider text-right">Būsena</th>
                    <th className="py-2.5 px-4"><span className="sr-only">Veiksmai</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRules.length === 0 ? (
                    <tr><td colSpan={6} className="py-10 text-center text-[13px] text-subtle">{rules.length === 0 ? 'Taisyklių nėra.' : 'Išjungtos taisyklės paslėptos.'}</td></tr>
                  ) : visibleRules.map((r) => {
                    const auto = AUTO_RULE_TYPES.has(r.rule_type);
                    const editing = edits[r.id] !== undefined;
                    return (
                      <tr key={r.id} className={`border-b border-border dark:border-white/5 ${r.is_active ? '' : 'opacity-50'}`}>
                        <td className="py-3 px-5">
                          {labelEdits[r.id] !== undefined && !locked ? (
                            <input type="text" autoFocus value={labelEdits[r.id]}
                              onChange={(e) => setLabelEdits((previous) => ({ ...previous, [r.id]: e.target.value }))}
                              onBlur={() => saveLabel(r)}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveLabel(r); if (e.key === 'Escape') setLabelEdits((previous) => { const next = { ...previous }; delete next[r.id]; return next; }); }}
                              className="w-full max-w-56 h-[32px] px-2 bg-surface-2 dark:bg-surface-2 border border-primary rounded-lg text-[13px] text-text dark:text-white focus:outline-none" />
                          ) : (
                            <button disabled={locked} onClick={() => setLabelEdits((previous) => ({ ...previous, [r.id]: r.label }))} className="text-left text-[13px] font-semibold text-text hover:text-primary disabled:hover:text-text dark:disabled:hover:text-subtle cursor-pointer disabled:cursor-default">
                              {r.label}
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${auto ? 'bg-success-bg text-success border-success' : 'bg-surface-2 text-subtle dark:bg-white/10 border-border dark:border-white/10'}`}>
                            {auto ? 'Automatinis' : 'Saugoma'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          {locked ? (
                            <span className="text-[13px] font-semibold text-text">{fmtEur(r.amount)}</span>
                          ) : editing ? (
                            <input
                              type="text" inputMode="decimal" autoFocus
                              value={edits[r.id]}
                              onChange={(e) => setEdits((p) => ({ ...p, [r.id]: e.target.value }))}
                              onBlur={() => saveAmount(r)}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveAmount(r); if (e.key === 'Escape') setEdits((p) => { const n = { ...p }; delete n[r.id]; return n; }); }}
                              className="w-24 h-[32px] px-2 text-right bg-surface-2 dark:bg-surface-2 border border-primary rounded-lg text-[13px] tabular-nums text-text dark:text-white focus:outline-none"
                            />
                          ) : (
                            <button onClick={() => setEdits((p) => ({ ...p, [r.id]: String(r.amount) }))} className="text-[13px] font-semibold text-text hover:text-primary dark:hover:text-primary-ink cursor-pointer">
                              {fmtEur(r.amount)}
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[12px] text-subtle">{r.unit ? (RULE_UNIT_LABELS[r.unit] ?? r.unit) : '—'}</td>
                        <td className="py-3 px-5 text-right">
                          <button
                            onClick={() => toggleActive.mutate({ id: r.id, is_active: !r.is_active })}
                            disabled={locked || toggleActive.isPending}
                            title={r.is_active ? 'Išjungti' : 'Įjungti'}
                            className={`inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default ${r.is_active ? 'text-success hover:bg-success-bg dark:hover:bg-success/20' : 'text-subtle hover:bg-surface-2 dark:hover:bg-white/10'}`}
                          >
                            {r.is_active ? <Check size={13} /> : <Power size={13} />}
                            {r.is_active ? 'Aktyvi' : 'Išjungta'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => void handleRemoveRule(r)}
                            disabled={locked || removeRule.isPending}
                            title={locked ? 'Užrakintos kortelės taisyklės negalima šalinti' : 'Pašalinti taisyklę'}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-subtle hover:text-danger hover:bg-danger/10 dark:hover:text-danger dark:hover:bg-danger/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
                          >
                            {removeRule.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
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
          validate={validateRateCardName} onConfirm={(name) => createCard.mutate(name)} onClose={() => setShowNew(false)} />
      )}
      {dupFor && (
        <NameModal title="Dubliuoti kortelę" label="Naujos kortelės pavadinimas" defaultValue={`${dupFor.name} (kopija)`}
          confirmLabel="Dubliuoti" pending={dupCard.isPending}
          validate={validateRateCardName} onConfirm={(name) => dupCard.mutate({ id: dupFor.id, name })} onClose={() => setDupFor(null)} />
      )}
      {editCard && (
        <NameModal title="Pervadinti tarifų kortelę" label="Kortelės pavadinimas" defaultValue={editCard.name}
          confirmLabel="Išsaugoti" pending={renameCard.isPending} validate={validateRateCardName}
          onConfirm={(name) => renameCard.mutate({ id: editCard.id, name })} onClose={() => setEditCard(null)} />
      )}
      {addRule && card && (
        <RuleEditorModal rateCardId={card.id} onClose={() => setAddRule(false)} onSaved={invalidateRules} />
      )}
    </div>
  );
}
