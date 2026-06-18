import { Fragment, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, AlertTriangle, Users, Coins, EyeOff, Eye, Building2, SlidersHorizontal } from 'lucide-react';
import {
  setPayrollSiteIncluded, recalculatePayrollPeriod, payrollErrorMessage,
  type PayrollSiteSnapshot, type PayrollInstaller,
} from '../../../api/payroll';
import { fmtCents, fmtEur, fmtDate, parseBreakdown, PARTICIPANT_SOURCE, toCents } from './format';
import ReasonModal from './ReasonModal';
import ParticipantsModal from './ParticipantsModal';
import ManualEntryModal from './ManualEntryModal';
import SiteRulesModal from './SiteRulesModal';

const th = 'py-2.5 px-3 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider whitespace-nowrap';
const td = 'py-2.5 px-3 text-[13px] text-zinc-700 dark:text-zinc-300 whitespace-nowrap';
const tdNum = `${td} text-right tabular-nums`;

const CHIP_CLS: Record<string, string> = {
  AUTO: 'bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400 border-zinc-200 dark:border-white/10',
  RANKINIS: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300 border-purple-200 dark:border-purple-500/20',
  PRALEISTA: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
};

export default function ObjektaiTab({
  periodId, year, month, rateCardId, snapshots, installers, isLocked, teamFilter, installerFilter, onChanged,
}: {
  periodId: string;
  year: number;
  month: number;
  rateCardId: string | null;
  snapshots: PayrollSiteSnapshot[];
  installers: PayrollInstaller[];
  isLocked: boolean;
  teamFilter: string;      // '' = all
  installerFilter: string; // '' = all
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [includeTarget, setIncludeTarget] = useState<PayrollSiteSnapshot | null>(null);
  const [participantsFor, setParticipantsFor] = useState<PayrollSiteSnapshot | null>(null);
  const [manualFor, setManualFor] = useState<PayrollSiteSnapshot | null>(null);
  const [rulesFor, setRulesFor] = useState<PayrollSiteSnapshot | null>(null);

  const nameById = useMemo(() => new Map(installers.map((u) => [u.id, u.full_name ?? 'Be vardo'])), [installers]);

  const rows = useMemo(() => snapshots.filter((s) => {
    if (teamFilter && s.site?.team_id !== teamFilter) return false;
    if (installerFilter && !s.participant_ids.includes(installerFilter)) return false;
    return true;
  }), [snapshots, teamFilter, installerFilter]);

  const toggle = (id: string) => setExpanded((p) => {
    const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  const includeMut = useMutation({
    mutationFn: async ({ s, included, reason }: { s: PayrollSiteSnapshot; included: boolean; reason: string }) => {
      if (!s.site_id) throw new Error('Objektas neturi ID.');
      await setPayrollSiteIncluded(periodId, s.site_id, included, reason);
      // Regenerate the ledger so excluded sites lose their auto earnings and
      // re-included ones get them back — keeps Montuotojai consistent.
      if (rateCardId) await recalculatePayrollPeriod(year, month, rateCardId);
    },
    onSuccess: () => { toast.success('Atnaujinta ir perskaičiuota.'); setIncludeTarget(null); onChanged(); },
    onError: (e: unknown) => toast.error(payrollErrorMessage(e)),
  });

  return (
    <div className="bg-white dark:bg-[#18181b] border border-zinc-100 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[1100px]">
        <thead>
          <tr className="border-b border-zinc-100 dark:border-white/10 bg-zinc-50/60 dark:bg-[#27272a]">
            <th className={th}>Objektas</th>
            <th className={th}>Klientas / adresas</th>
            <th className={th}>Užbaigta</th>
            <th className={th}>Sistema / kWp</th>
            <th className={th}>Dalyviai</th>
            <th className={th}>Šaltinis</th>
            <th className={`${th} text-right`}>Bazė</th>
            <th className={`${th} text-right`}>Priedai</th>
            <th className={`${th} text-right`}>Bonusai</th>
            <th className={`${th} text-right`}>Atskaitymai</th>
            <th className={`${th} text-right`}>Bendra</th>
            <th className={`${th} text-right`}>Vienam</th>
            <th className={th}>Įspėjimai</th>
            <th className={`${th} text-right`}>Veiksmai</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={14} className="py-16 text-center">
              <Building2 size={34} className="text-zinc-300 dark:text-zinc-600 mb-2 inline-block" />
              <p className="text-[14px] text-zinc-500 dark:text-zinc-400 font-medium">Objektų nėra. Perskaičiuokite periodą.</p>
            </td></tr>
          ) : rows.map((s) => {
            const n = s.participant_ids.length;
            const perCents = n > 0 ? Math.round(toCents(s.total_pool) / n) : 0;
            const excluded = s.is_manually_excluded;
            const isOpen = expanded.has(s.id);
            const src = PARTICIPANT_SOURCE[s.participant_source];
            return (
              <Fragment key={s.id}>
                <tr className={`border-b border-zinc-50 dark:border-white/5 hover:bg-zinc-50/60 dark:hover:bg-[#27272a] transition-colors ${excluded ? 'opacity-50' : ''}`}>
                  <td className={td}>
                    <button onClick={() => toggle(s.id)} className="flex items-center gap-1.5 cursor-pointer">
                      <ChevronDown size={14} className={`text-zinc-400 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                      <span className="font-bold text-purple-600 dark:text-purple-300">{s.site?.code ?? '—'}</span>
                    </button>
                  </td>
                  <td className={td}>
                    <div className="max-w-[200px]">
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">{s.site?.client_name ?? '—'}</p>
                      <p className="text-[11px] text-zinc-400 truncate">{s.site?.address ?? ''}</p>
                    </div>
                  </td>
                  <td className={td}>{fmtDate(s.site?.actual_end)}</td>
                  <td className={td}>
                    <span className="text-zinc-500 dark:text-zinc-400">{s.site?.system_type ?? '—'}</span>
                    {s.site?.kwp != null && <span className="ml-1 font-semibold tabular-nums">{s.site.kwp} kWp</span>}
                  </td>
                  <td className={td}>
                    <span className="inline-flex items-center gap-1.5">
                      <Users size={13} className="text-zinc-400" />
                      <span className="font-semibold tabular-nums">{n}</span>
                      {excluded && <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-100 dark:bg-white/10 px-1.5 py-0.5 rounded">Neįtraukta</span>}
                    </span>
                  </td>
                  <td className={td}>
                    <span className={`inline-flex text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${src.cls}`}>{src.label}</span>
                  </td>
                  <td className={tdNum}>{fmtEur(s.base_amount)}</td>
                  <td className={tdNum}>{s.addon_amount ? fmtEur(s.addon_amount) : '—'}</td>
                  <td className={`${tdNum} text-emerald-600 dark:text-emerald-400`}>{s.bonus_amount ? fmtEur(s.bonus_amount) : '—'}</td>
                  <td className={`${tdNum} text-red-600 dark:text-red-400`}>{s.deduction_amount ? fmtEur(s.deduction_amount) : '—'}</td>
                  <td className={`${tdNum} font-bold text-zinc-900 dark:text-zinc-100`}>{fmtEur(s.total_pool)}</td>
                  <td className={`${tdNum} text-zinc-500`}>{n > 0 ? fmtCents(perCents) : '—'}</td>
                  <td className={td}>
                    {s.warnings.length === 0 ? <span className="text-zinc-300 dark:text-zinc-600">—</span> : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/20 px-2 py-0.5 rounded-full" title={s.warnings.join('\n')}>
                        <AlertTriangle size={11} /> {s.warnings.length}
                      </span>
                    )}
                  </td>
                  <td className={`${td} text-right`}>
                    {isLocked ? <span className="text-zinc-300 dark:text-zinc-600">—</span> : (
                      <div className="inline-flex items-center gap-1 justify-end">
                        <button onClick={() => setIncludeTarget(s)} title={excluded ? 'Įtraukti' : 'Neįtraukti'}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors cursor-pointer">
                          {excluded ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button onClick={() => setParticipantsFor(s)} title="Keisti dalyvius"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors cursor-pointer">
                          <Users size={14} />
                        </button>
                        <button onClick={() => setRulesFor(s)} disabled={!rateCardId} title="Taisyklės"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default">
                          <SlidersHorizontal size={14} />
                        </button>
                        <button onClick={() => setManualFor(s)} title="Pridėti bonusą / atskaitymą"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors cursor-pointer">
                          <Coins size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-zinc-50/50 dark:bg-[#1f1f23] border-b border-zinc-50 dark:border-white/5">
                    <td colSpan={14} className="px-12 py-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Skaičiavimas</p>
                          <BreakdownView breakdown={s.calculation_breakdown} totalPool={s.total_pool} />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Dalyviai</p>
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {n === 0 ? <span className="text-[12px] text-zinc-400 italic">Nėra</span> :
                              s.participant_ids.map((id) => (
                                <span key={id} className="text-[12px] bg-white dark:bg-[#27272a] border border-zinc-200 dark:border-white/10 px-2 py-0.5 rounded-md text-zinc-700 dark:text-zinc-300">
                                  {nameById.get(id) ?? id.slice(0, 8)}
                                </span>
                              ))}
                          </div>
                          {s.manual_note && <p className="text-[12px] text-zinc-500 dark:text-zinc-400"><span className="font-semibold">Pastaba:</span> {s.manual_note}</p>}
                          {s.warnings.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {s.warnings.map((w, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/20 px-2 py-0.5 rounded-full">
                                  <AlertTriangle size={10} /> {w}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Include / exclude */}
      {includeTarget && (
        <ReasonModal
          title={includeTarget.is_manually_excluded ? 'Įtraukti objektą' : 'Neįtraukti objekto'}
          message={`${includeTarget.site?.code} · ${includeTarget.site?.client_name ?? ''}`}
          confirmLabel={includeTarget.is_manually_excluded ? 'Įtraukti' : 'Neįtraukti'}
          variant={includeTarget.is_manually_excluded ? 'primary' : 'danger'}
          pending={includeMut.isPending}
          onConfirm={(reason) => includeMut.mutate({ s: includeTarget, included: includeTarget.is_manually_excluded, reason })}
          onClose={() => setIncludeTarget(null)}
        />
      )}
      {/* Participants override */}
      {participantsFor && (
        <ParticipantsModal
          periodId={periodId} year={year} month={month} rateCardId={rateCardId}
          snapshot={participantsFor} installers={installers}
          onClose={() => setParticipantsFor(null)} onSaved={onChanged}
        />
      )}
      {/* Add manual entry for this site */}
      {manualFor && (
        <ManualEntryModal
          periodId={periodId} installers={installers} snapshots={snapshots}
          defaultSnapshotId={manualFor.id}
          onClose={() => setManualFor(null)} onSaved={onChanged}
        />
      )}
      {/* Per-site rule overrides */}
      {rulesFor && rateCardId && rulesFor.site_id && (
        <SiteRulesModal
          periodId={periodId} siteId={rulesFor.site_id}
          siteCode={rulesFor.site?.code ?? ''} siteClient={rulesFor.site?.client_name ?? ''}
          year={year} month={month} rateCardId={rateCardId}
          onClose={() => setRulesFor(null)} onSaved={onChanged}
        />
      )}
    </div>
  );
}

/** Renders calculation_breakdown as rule lines with AUTO / RANKINIS / PRALEISTA chips. */
function BreakdownView({ breakdown, totalPool }: { breakdown: Record<string, unknown>; totalPool: number }) {
  const { rules, poolEur, legacy } = parseBreakdown(breakdown);
  if (rules.length === 0 && legacy.length > 0) {
    return (
      <div className="space-y-1">
        {legacy.map((l, i) => (
          <div key={i} className="flex items-center justify-between gap-4 text-[13px]">
            <span className="text-zinc-500 dark:text-zinc-400">{l.label}</span>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{l.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {rules.map((r) => (
        <div key={r.ruleId} className="flex items-center justify-between gap-3 text-[13px]">
          <span className="flex items-center gap-2 min-w-0">
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${CHIP_CLS[r.chip]}`}>{r.chip}</span>
            <span className={`truncate ${r.applied ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-400 line-through'}`}>{r.label}</span>
            {r.detail && <span className="text-[11px] text-zinc-400 shrink-0">{r.detail}</span>}
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {r.note && <span className="text-[11px] text-zinc-400 italic truncate max-w-[120px]" title={r.note}>{r.note}</span>}
            <span className={`font-semibold tabular-nums ${r.applied ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-400'}`}>{fmtEur(r.amountEur)}</span>
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 text-[13px] pt-1.5 mt-1.5 border-t border-zinc-200 dark:border-white/10">
        <span className="font-bold text-zinc-700 dark:text-zinc-200">Bendras fondas</span>
        <span className="font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{fmtEur(poolEur ?? totalPool)}</span>
      </div>
    </div>
  );
}
