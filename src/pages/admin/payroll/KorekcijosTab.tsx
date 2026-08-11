import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Minus, Pencil, Undo2, Coins } from 'lucide-react';
import {
  reverseManualPayrollEntry, payrollErrorMessage,
  type EarningsEntry, type ManualEntryType, type PayrollInstaller, type PayrollSiteSnapshot,
} from '../../../api/payroll';
import { fmtCents, toCents, fmtDate, ENTRY_TYPE_LABELS } from './format';
import ManualEntryModal from './ManualEntryModal';
import ReasonModal from './ReasonModal';

export default function KorekcijosTab({
  periodId, earnings, installers, snapshots, isLocked, onChanged,
}: {
  periodId: string;
  earnings: EarningsEntry[];
  installers: PayrollInstaller[];
  snapshots: PayrollSiteSnapshot[];
  isLocked: boolean;
  onChanged: () => void;
}) {
  const [addType, setAddType] = useState<ManualEntryType | null>(null);
  const [stornoFor, setStornoFor] = useState<EarningsEntry | null>(null);

  const nameById = useMemo(() => new Map(installers.map((u) => [u.id, u.full_name ?? 'Be vardo'])), [installers]);
  const codeBySnapshot = useMemo(() => new Map(snapshots.map((s) => [s.id, s.site?.code ?? null])), [snapshots]);
  const manual = useMemo(() => earnings.filter((e) => e.source === 'manual'), [earnings]);

  const storno = useMutation({
    mutationFn: ({ e, reason }: { e: EarningsEntry; reason: string }) => reverseManualPayrollEntry(e.id, reason),
    onSuccess: () => { toast.success('Sukurtas atvirkštinis (storno) įrašas.'); setStornoFor(null); onChanged(); },
    onError: (e: unknown) => toast.error(payrollErrorMessage(e)),
  });

  const addBtnCls = 'inline-flex items-center gap-1.5 h-[38px] px-4 rounded-card border border-border dark:border-white/10 text-text text-[13px] font-medium bg-surface hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default';

  return (
    <div className="space-y-4">
      {!isLocked && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setAddType('bonus')} disabled={isLocked} className={addBtnCls}>
            <Plus size={14} className="text-success" /> Pridėti bonusą
          </button>
          <button onClick={() => setAddType('deduction')} disabled={isLocked} className={addBtnCls}>
            <Minus size={14} className="text-danger" /> Pridėti atskaitymą
          </button>
          <button onClick={() => setAddType('adjustment')} disabled={isLocked} className={addBtnCls}>
            <Pencil size={14} className="text-subtle" /> Pridėti korekciją
          </button>
        </div>
      )}

      <div className="bg-surface border border-border dark:border-white/10 rounded-card overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead>
            <tr className="border-b border-border dark:border-white/10 bg-surface-2/60 dark:bg-surface-2">
              <th className="py-2.5 px-4 text-[10px] font-bold text-subtle uppercase tracking-wider">Data</th>
              <th className="py-2.5 px-4 text-[10px] font-bold text-subtle uppercase tracking-wider">Montuotojas</th>
              <th className="py-2.5 px-4 text-[10px] font-bold text-subtle uppercase tracking-wider">Tipas</th>
              <th className="py-2.5 px-4 text-[10px] font-bold text-subtle uppercase tracking-wider">Objektas</th>
              <th className="py-2.5 px-4 text-[10px] font-bold text-subtle uppercase tracking-wider">Aprašymas</th>
              <th className="py-2.5 px-4 text-[10px] font-bold text-subtle uppercase tracking-wider text-right">Suma</th>
              <th className="py-2.5 px-4 text-[10px] font-bold text-subtle uppercase tracking-wider text-right">Veiksmai</th>
            </tr>
          </thead>
          <tbody>
            {manual.length === 0 ? (
              <tr><td colSpan={7} className="py-16 text-center">
                <Coins size={34} className="text-subtle mb-2 inline-block" />
                <p className="text-[14px] text-subtle font-medium">Rankinių įrašų nėra.</p>
              </td></tr>
            ) : manual.map((e) => (
              <tr key={e.id} className="border-b border-border dark:border-white/5 hover:bg-surface-2/60 dark:hover:bg-surface-2 transition-colors">
                <td className="py-2.5 px-4 text-[12px] text-subtle tabular-nums">{fmtDate(e.created_at)}</td>
                <td className="py-2.5 px-4 text-[13px] font-semibold text-text">{nameById.get(e.installer_id) ?? '—'}</td>
                <td className="py-2.5 px-4 text-[12px] text-muted">{ENTRY_TYPE_LABELS[e.entry_type]}</td>
                <td className="py-2.5 px-4 text-[12px]">
                  {e.site_snapshot_id && codeBySnapshot.get(e.site_snapshot_id)
                    ? <span className="font-bold text-primary dark:text-primary-ink">{codeBySnapshot.get(e.site_snapshot_id)}</span>
                    : <span className="text-subtle">—</span>}
                </td>
                <td className="py-2.5 px-4 text-[13px] text-muted max-w-[280px] truncate">{e.description ?? '—'}</td>
                <td className="py-2.5 px-4 text-right text-[13px] font-semibold tabular-nums">
                  <span className={e.amount < 0 ? 'text-danger' : 'text-text'}>{fmtCents(toCents(e.amount))}</span>
                </td>
                <td className="py-2.5 px-4 text-right">
                  {!isLocked && (
                    <button onClick={() => setStornoFor(e)} title="Storno"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger hover:bg-danger/10 dark:hover:bg-danger/20 px-2 py-0.5 rounded-md transition-colors cursor-pointer">
                      <Undo2 size={12} /> Storno
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addType && (
        <ManualEntryModal
          periodId={periodId} installers={installers} snapshots={snapshots} defaultType={addType}
          onClose={() => setAddType(null)} onSaved={onChanged}
        />
      )}
      {stornoFor && (
        <ReasonModal
          title="Storno įrašą?"
          message={`Bus sukurtas atvirkštinis įrašas (${fmtCents(-toCents(stornoFor.amount))}). Originalas išliks.`}
          confirmLabel="Storno" variant="danger" pending={storno.isPending}
          onConfirm={(reason) => storno.mutate({ e: stornoFor, reason })}
          onClose={() => setStornoFor(null)}
        />
      )}
    </div>
  );
}
