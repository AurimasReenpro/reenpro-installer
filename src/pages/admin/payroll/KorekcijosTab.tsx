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

  const addBtnCls = 'inline-flex items-center gap-1.5 h-[38px] px-4 rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 text-[13px] font-medium bg-surface hover:bg-zinc-50 dark:hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default';

  return (
    <div className="space-y-4">
      {!isLocked && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setAddType('bonus')} disabled={isLocked} className={addBtnCls}>
            <Plus size={14} className="text-emerald-600" /> Pridėti bonusą
          </button>
          <button onClick={() => setAddType('deduction')} disabled={isLocked} className={addBtnCls}>
            <Minus size={14} className="text-red-600" /> Pridėti atskaitymą
          </button>
          <button onClick={() => setAddType('adjustment')} disabled={isLocked} className={addBtnCls}>
            <Pencil size={14} className="text-zinc-500" /> Pridėti korekciją
          </button>
        </div>
      )}

      <div className="bg-surface border border-zinc-100 dark:border-white/10 rounded-2xl overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-white/10 bg-zinc-50/60 dark:bg-surface-2">
              <th className="py-2.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Data</th>
              <th className="py-2.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Montuotojas</th>
              <th className="py-2.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Tipas</th>
              <th className="py-2.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Objektas</th>
              <th className="py-2.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Aprašymas</th>
              <th className="py-2.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Suma</th>
              <th className="py-2.5 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Veiksmai</th>
            </tr>
          </thead>
          <tbody>
            {manual.length === 0 ? (
              <tr><td colSpan={7} className="py-16 text-center">
                <Coins size={34} className="text-zinc-300 dark:text-zinc-600 mb-2 inline-block" />
                <p className="text-[14px] text-zinc-500 dark:text-zinc-400 font-medium">Rankinių įrašų nėra.</p>
              </td></tr>
            ) : manual.map((e) => (
              <tr key={e.id} className="border-b border-zinc-50 dark:border-white/5 hover:bg-zinc-50/60 dark:hover:bg-surface-2 transition-colors">
                <td className="py-2.5 px-4 text-[12px] text-zinc-400 tabular-nums">{fmtDate(e.created_at)}</td>
                <td className="py-2.5 px-4 text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">{nameById.get(e.installer_id) ?? '—'}</td>
                <td className="py-2.5 px-4 text-[12px] text-zinc-600 dark:text-zinc-300">{ENTRY_TYPE_LABELS[e.entry_type]}</td>
                <td className="py-2.5 px-4 text-[12px]">
                  {e.site_snapshot_id && codeBySnapshot.get(e.site_snapshot_id)
                    ? <span className="font-bold text-primary dark:text-primary-ink">{codeBySnapshot.get(e.site_snapshot_id)}</span>
                    : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                </td>
                <td className="py-2.5 px-4 text-[13px] text-zinc-600 dark:text-zinc-300 max-w-[280px] truncate">{e.description ?? '—'}</td>
                <td className="py-2.5 px-4 text-right text-[13px] font-semibold tabular-nums">
                  <span className={e.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-800 dark:text-zinc-200'}>{fmtCents(toCents(e.amount))}</span>
                </td>
                <td className="py-2.5 px-4 text-right">
                  {!isLocked && (
                    <button onClick={() => setStornoFor(e)} title="Storno"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-0.5 rounded-md transition-colors cursor-pointer">
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
