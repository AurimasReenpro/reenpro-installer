import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, Users, Undo2, AlertTriangle, Lock, Info } from 'lucide-react';
import {
  reverseManualPayrollEntry, payrollErrorMessage,
  type EarningsEntry, type PeriodStatus, type PayrollSiteSnapshot,
} from '../../../api/payroll';
import type { Team } from '../../../api/installers';
import { fmtCents, toCents, fmtDate, ENTRY_TYPE_LABELS } from './format';
import { computeInstallerBaskets } from './basket';
import ReasonModal from './ReasonModal';

const th = 'py-2.5 px-4 text-[10px] font-bold text-subtle uppercase tracking-wider whitespace-nowrap';

export default function MontuotojaiTab({
  earnings, snapshots, teams, status, hasPeriod, teamFilter, installerFilter, onChanged,
}: {
  earnings: EarningsEntry[];
  snapshots: PayrollSiteSnapshot[];
  teams: Team[];
  status: PeriodStatus;
  hasPeriod: boolean;
  teamFilter: string;
  installerFilter: string;
  onChanged: () => void;
}) {
  const isLocked = status === 'locked';
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [stornoFor, setStornoFor] = useState<EarningsEntry | null>(null);

  const teamName = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const codeBySnapshot = useMemo(
    () => new Map(snapshots.map((s) => [s.id, s.site?.code ?? null])),
    [snapshots],
  );

  // Filtered earnings drive the visible baskets; unfiltered count drives state.
  const filtered = useMemo(() => earnings.filter((e) => {
    if (installerFilter && e.installer_id !== installerFilter) return false;
    if (teamFilter && (e.installer?.team_id ?? '') !== teamFilter) return false;
    return true;
  }), [earnings, teamFilter, installerFilter]);

  const baskets = useMemo(() => computeInstallerBaskets(filtered, teamName), [filtered, teamName]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug('[payroll] Montuotojai baskets', {
        earningsCount: earnings.length,
        filteredEarningsCount: filtered.length,
        basketCount: baskets.length,
      });
    }
  }, [earnings.length, filtered.length, baskets.length]);

  // Average over visible baskets (cents) for the ">150% → Patikrinti" flag.
  const avgTotal = baskets.length ? baskets.reduce((s, b) => s + b.total, 0) / baskets.length : 0;

  // Mismatch: snapshots are included w/ participants but the ledger is empty.
  const includedWithParticipants = useMemo(
    () => snapshots.filter((s) => s.included && !s.is_manually_excluded && s.participant_ids.length > 0).length,
    [snapshots],
  );
  const mismatch = earnings.length === 0 && includedWithParticipants > 0;

  const toggle = (id: string) => setExpanded((p) => {
    const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  const storno = useMutation({
    mutationFn: ({ e, reason }: { e: EarningsEntry; reason: string }) => reverseManualPayrollEntry(e.id, reason),
    onSuccess: () => { toast.success('Sukurtas atvirkštinis (storno) įrašas.'); setStornoFor(null); onChanged(); },
    onError: (e: unknown) => toast.error(payrollErrorMessage(e)),
  });

  // ── Empty / mismatch states (never a generic empty in the mismatch case) ──
  if (baskets.length === 0) {
    if (!hasPeriod) {
      return <EmptyCard icon={<Users />} title="Pasirinkite tarifų kortelę ir perskaičiuokite periodą." />;
    }
    if (mismatch) {
      return (
        <div className="rounded-card bg-danger/10 border border-danger px-5 py-6 flex items-start gap-3">
          <AlertTriangle size={20} className="text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-[14px] font-semibold text-danger">Objektai paskaičiuoti, bet montuotojų įrašų nerasta.</p>
            <p className="text-[13px] text-danger/80 mt-0.5">Patikrinkite perskaičiavimo rezultatą arba earnings_entries lentelę.</p>
          </div>
        </div>
      );
    }
    if (earnings.length === 0) {
      return <EmptyCard icon={<Users />} title="Montuotojų įrašų dar nėra." subtitle="Paleiskite perskaičiavimą." />;
    }
    return <EmptyCard icon={<Users />} title="Nėra montuotojų pagal pasirinktą filtrą." />;
  }

  return (
    <div className="space-y-3">
      {/* Status banner: preliminary vs final */}
      {isLocked ? (
        <Banner tone="zinc" icon={<Lock size={16} />} text="Galutinės užrakinto periodo sumos." />
      ) : (
        <Banner tone="amber" icon={<Info size={16} />} text="Preliminarios sumos. Jos gali keistis po perskaičiavimo ar korekcijų." />
      )}

      <div className="bg-surface border border-border dark:border-white/10 rounded-card shadow-sm dark:shadow-none overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[920px]">
          <thead>
            <tr className="border-b border-border dark:border-white/10 bg-surface-2/60 dark:bg-surface-2">
              <th className={th}>Montuotojas</th>
              <th className={th}>Komanda</th>
              <th className={`${th} text-right`}>Objektų sk.</th>
              <th className={`${th} text-right`}>Už objektus</th>
              <th className={`${th} text-right`}>Bonusai</th>
              <th className={`${th} text-right`}>Atskaitymai</th>
              <th className={`${th} text-right`}>Korekcijos</th>
              <th className={`${th} text-right`}>Iš viso</th>
            </tr>
          </thead>
          <tbody>
            {baskets.map((b) => {
              const isOpen = expanded.has(b.installerId);
              const hasManual = b.entries.some((e) => e.source === 'manual');
              const negative = b.total < 0;
              const zero = b.total === 0;
              const onlyCorrections = b.siteCount === 0 && hasManual;
              const aboveAvg = avgTotal > 0 && baskets.length > 1 && b.total > avgTotal * 1.5;
              return (
                <Fragment key={b.installerId}>
                  <tr onClick={() => toggle(b.installerId)} className={`border-b border-border dark:border-white/5 hover:bg-surface-2/60 dark:hover:bg-surface-2 transition-colors cursor-pointer ${zero ? 'opacity-50' : ''}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ChevronDown size={14} className={`text-subtle transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                        <span className="text-[14px] font-semibold text-text">{b.installerName}</span>
                        {negative && <Flag tone="red">Neigiama suma</Flag>}
                        {onlyCorrections && <Flag tone="amber">Tik korekcijos</Flag>}
                        {aboveAvg && <Flag tone="amber">Patikrinti</Flag>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[13px] text-subtle">{b.teamName ?? '—'}</td>
                    <td className="py-3 px-4 text-right text-[13px] text-subtle tabular-nums">{b.siteCount}</td>
                    <td className="py-3 px-4 text-right text-[13px] text-text tabular-nums">{fmtCents(b.siteShareTotal)}</td>
                    <td className="py-3 px-4 text-right text-[13px] text-success tabular-nums">{b.bonusTotal ? fmtCents(b.bonusTotal) : '—'}</td>
                    <td className="py-3 px-4 text-right text-[13px] text-danger tabular-nums">{b.deductionTotal ? fmtCents(b.deductionTotal) : '—'}</td>
                    <td className="py-3 px-4 text-right text-[13px] text-muted tabular-nums">{b.adjustmentTotal ? fmtCents(b.adjustmentTotal) : '—'}</td>
                    <td className={`py-3 px-4 text-right text-[14px] font-bold tabular-nums ${negative ? 'text-danger' : 'text-text'}`}>{fmtCents(b.total)}</td>
                  </tr>
                  {isOpen && b.entries.map((e) => {
                    const isManual = e.source === 'manual';
                    const code = e.site_snapshot_id ? codeBySnapshot.get(e.site_snapshot_id) : null;
                    return (
                      <tr key={e.id} className="border-b border-border dark:border-white/5 bg-surface-2/50 dark:bg-[#1f1f23]">
                        <td className="py-2 px-4 pl-10 text-[12px] text-subtle tabular-nums">{fmtDate(e.created_at)}</td>
                        <td className="py-2 px-4 text-[12px]"><span className="font-semibold text-muted">{ENTRY_TYPE_LABELS[e.entry_type]}</span></td>
                        <td className="py-2 px-4 text-[12px]" colSpan={4}>
                          <div className="flex items-center gap-2 min-w-0">
                            {code && <span className="text-[11px] font-bold text-primary dark:text-primary-ink bg-primary-fixed dark:bg-primary/30 px-1.5 py-0.5 rounded shrink-0">{code}</span>}
                            <span className="text-muted truncate">{e.description ?? '—'}</span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${e.source === 'auto' ? 'bg-surface-2 dark:bg-white/5 text-subtle' : 'bg-primary-fixed dark:bg-primary/20 text-primary dark:text-primary-ink'}`}>{e.source === 'auto' ? 'auto' : 'rankinis'}</span>
                          </div>
                        </td>
                        <td className="py-2 px-4 text-right text-[13px] font-semibold tabular-nums">
                          <span className={e.amount < 0 ? 'text-danger' : 'text-text'}>{fmtCents(toCents(e.amount))}</span>
                        </td>
                        <td className="py-2 px-4 text-right">
                          {isManual && !isLocked && (
                            <button onClick={() => setStornoFor(e)} title="Storno"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger hover:bg-danger/10 dark:hover:bg-danger/20 px-2 py-0.5 rounded-md transition-colors cursor-pointer">
                              <Undo2 size={12} /> Storno
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

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

function Banner({ tone, icon, text }: { tone: 'amber' | 'zinc'; icon: React.ReactNode; text: string }) {
  const cls = tone === 'amber'
    ? 'bg-warning-bg border-warning text-warning'
    : 'bg-surface-2/70 dark:bg-white/5 border-border dark:border-white/10 text-muted';
  return (
    <div className={`rounded-card border px-4 py-2.5 flex items-center gap-2.5 text-[13px] font-medium ${cls}`}>
      <span className="shrink-0">{icon}</span> {text}
    </div>
  );
}

function Flag({ tone, children }: { tone: 'red' | 'amber'; children: React.ReactNode }) {
  const cls = tone === 'red'
    ? 'bg-danger/10 text-danger border-danger'
    : 'bg-warning-bg text-warning border-warning';
  return <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${cls}`}>{children}</span>;
}

function EmptyCard({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="bg-surface border border-border dark:border-white/10 rounded-card py-16 text-center">
      <span className="text-subtle mb-2 inline-flex">{icon}</span>
      <p className="text-[14px] text-subtle font-medium">{title}</p>
      {subtitle && <p className="text-[13px] text-subtle mt-1">{subtitle}</p>}
    </div>
  );
}
