import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Coins, ChevronLeft, ChevronRight, RefreshCw, Lock, Loader2, Download,
  Building2, Users, Tag, Wallet,
} from 'lucide-react';
import { useConfirm } from '../../hooks/useConfirm';
import { getTeams } from '../../api/installers';
import {
  getPayrollRateCards, getPayrollPeriod, getPayrollSiteSnapshots, getPayrollEarnings,
  getPayrollInstallers, getLockedRateCardIds,
  recalculatePayrollPeriod, lockPayrollPeriod, payrollErrorMessage,
  type PeriodStatus,
} from '../../api/payroll';
import { STATUS_CHIP, monthName } from './payroll/format';
import ObjektaiTab from './payroll/ObjektaiTab';
import MontuotojaiTab from './payroll/MontuotojaiTab';
import IkainiaiTab from './payroll/IkainiaiTab';
import KorekcijosTab from './payroll/KorekcijosTab';

type Tab = 'objektai' | 'montuotojai' | 'ikainiai' | 'korekcijos';
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'objektai', label: 'Objektai', icon: Building2 },
  { id: 'montuotojai', label: 'Montuotojai', icon: Users },
  { id: 'ikainiai', label: 'Įkainiai', icon: Tag },
  { id: 'korekcijos', label: 'Korekcijos', icon: Wallet },
];

export default function Payroll() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rateCardIdState, setRateCardId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('objektai');
  const [teamFilter, setTeamFilter] = useState('');
  const [installerFilter, setInstallerFilter] = useState('');

  // ── Queries ──
  const { data: rateCards = [] } = useQuery({ queryKey: ['payroll-rate-cards'], queryFn: getPayrollRateCards });
  const { data: lockedCardIds = [] } = useQuery({ queryKey: ['payroll-locked-cards'], queryFn: getLockedRateCardIds });
  const { data: installers = [] } = useQuery({ queryKey: ['payroll-installers'], queryFn: getPayrollInstallers });
  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: getTeams });

  const { data: period } = useQuery({
    queryKey: ['payroll-period', year, month],
    queryFn: () => getPayrollPeriod(year, month),
  });
  const periodId = period?.id ?? null;
  const status: PeriodStatus = period?.status ?? 'open';
  const isLocked = status === 'locked';

  const { data: snapshots = [], isLoading: snapLoading } = useQuery({
    queryKey: ['payroll-site-snapshots', periodId],
    queryFn: () => getPayrollSiteSnapshots(periodId as string),
    enabled: !!periodId,
  });
  const { data: earnings = [], isLoading: earnLoading } = useQuery({
    queryKey: ['payroll-earnings', periodId],
    queryFn: () => getPayrollEarnings(periodId as string),
    enabled: !!periodId,
  });

  // Effective rate card: explicit user choice, else the period's card, else the
  // first active card. Derived (no effect) so there's no setState-in-effect.
  const rateCardId = useMemo(() => {
    if (rateCardIdState && rateCards.some((c) => c.id === rateCardIdState)) return rateCardIdState;
    return period?.rate_card_id ?? rateCards.find((c) => c.is_active)?.id ?? rateCards[0]?.id ?? null;
  }, [rateCardIdState, rateCards, period]);

  const lockedSet = useMemo(() => new Set(lockedCardIds), [lockedCardIds]);
  const isTabLoading = !!periodId && (
    (tab === 'objektai' && snapLoading)
    || (tab === 'montuotojai' && (snapLoading || earnLoading))
    || (tab === 'korekcijos' && (snapLoading || earnLoading))
  );

  const invalidatePayroll = () => {
    void queryClient.invalidateQueries({ queryKey: ['payroll-period', year, month] });
    // periodId-independent: on the FIRST recalc the period didn't exist yet, so
    // `periodId` is still null in this closure. Match by key prefix so the
    // snapshots/earnings queries refetch as soon as the new period resolves —
    // this is what keeps the Montuotojai basket in sync with Objektai.
    void queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'payroll-site-snapshots' || q.queryKey[0] === 'payroll-earnings',
    });
    void queryClient.invalidateQueries({ queryKey: ['payroll-locked-cards'] });
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  // ── Recalculate ──
  const recalc = useMutation({
    mutationFn: () => {
      if (!rateCardId) throw new Error('Pirma pasirinkite tarifų kortelę (Įkainiai).');
      return recalculatePayrollPeriod(year, month, rateCardId);
    },
    onSuccess: (s) => {
      const msg = `Perskaičiuota: ${s.processed_sites} objekt., ${s.auto_earnings_created} montuotojų įrašų, praleista ${s.skipped_sites}.`;
      if (s.snapshots_created_or_updated > 0 && s.auto_earnings_created === 0) {
        toast.warning(msg, { description: 'Sukurta objektų, bet montuotojų įrašų nesukurta — patikrinkite dalyvius ir įkainius.' });
      } else if (s.warnings.length > 0) {
        toast.warning(msg, { description: `${s.warnings.length} įspėjim(ai): ${s.warnings.slice(0, 3).join(' · ')}${s.warnings.length > 3 ? '…' : ''}` });
      } else {
        toast.success(msg);
      }
      invalidatePayroll();
    },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message.startsWith('Pirma')) toast.error(e.message);
      else toast.error(payrollErrorMessage(e));
    },
  });

  // ── Lock ──
  const lock = useMutation({
    mutationFn: () => {
      if (!periodId) throw new Error('Pirma perskaičiuokite periodą.');
      return lockPayrollPeriod(periodId);
    },
    onSuccess: () => { toast.success('Periodas užrakintas.'); invalidatePayroll(); void queryClient.invalidateQueries({ queryKey: ['payroll-rate-cards'] }); },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message.startsWith('Pirma')) toast.error(e.message);
      else toast.error(payrollErrorMessage(e));
    },
  });

  const handleLock = async () => {
    const ok = await confirm({
      title: 'Užrakinti periodą?',
      message: `Ar tikrai užrakinti ${monthName(year, month)}? Užrakinto periodo įrašų keisti nebebus galima.`,
      confirmText: 'Užrakinti', cancelText: 'Atšaukti', variant: 'primary',
    });
    if (ok) lock.mutate();
  };

  const selectCls = 'h-[40px] px-3 rounded-xl bg-surface border border-zinc-200 dark:border-white/10 text-[14px] text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer';

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Coins className="w-6 h-6 text-primary dark:text-primary-ink" /> Atlyginimai
          </h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-0.5">Atlygis pagal tarifų korteles, padalintas montuotojams.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${STATUS_CHIP[status].cls}`}>
            {isLocked && <Lock size={11} />} {STATUS_CHIP[status].label}
          </span>
          <div className="flex items-center gap-1 bg-surface border border-zinc-200 dark:border-white/10 rounded-xl p-1">
            <button onClick={() => shiftMonth(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-surface-2 transition-colors cursor-pointer" title="Ankstesnis mėnuo">
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[150px] text-center text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 capitalize tabular-nums">{monthName(year, month)}</span>
            <button onClick={() => shiftMonth(1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-surface-2 transition-colors cursor-pointer" title="Kitas mėnuo">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={rateCardId ?? ''} onChange={(e) => setRateCardId(e.target.value || null)} className={selectCls} title="Tarifų kortelė">
            {rateCards.length === 0 && <option value="">— Nėra kortelių —</option>}
            {rateCards.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active ? '' : ' (neaktyvi)'}</option>)}
          </select>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className={selectCls} title="Komanda">
            <option value="">Visos komandos</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={installerFilter} onChange={(e) => setInstallerFilter(e.target.value)} className={selectCls} title="Montuotojas">
            <option value="">Visi montuotojai</option>
            {installers.map((u) => <option key={u.id} value={u.id}>{u.full_name ?? 'Be vardo'}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => recalc.mutate()} disabled={recalc.isPending || isLocked || rateCards.length === 0}
            title={isLocked ? 'Periodas užrakintas' : rateCards.length === 0 ? 'Pirma sukurkite tarifų kortelę' : undefined}
            className="flex items-center gap-2 h-[40px] px-4 rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 font-medium text-[14px] bg-surface hover:bg-zinc-50 dark:hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {recalc.isPending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Perskaičiuoti
          </button>
          {!isLocked && (
            <button
              onClick={() => void handleLock()} disabled={lock.isPending || !periodId || snapshots.length === 0}
              title={!periodId || snapshots.length === 0 ? 'Pirma perskaičiuokite periodą' : undefined}
              className="flex items-center gap-2 h-[40px] px-4 rounded-xl bg-primary text-white font-medium text-[14px] hover:bg-primary transition-all cursor-pointer disabled:opacity-50 disabled:cursor-default"
            >
              {lock.isPending ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />} Užrakinti periodą
            </button>
          )}
          <button disabled title="Bus įgyvendinta vėliau"
            className="hidden sm:flex items-center gap-2 h-[40px] px-4 rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-400 font-medium text-[14px] bg-surface cursor-not-allowed opacity-50">
            <Download size={15} /> Eksportuoti XLSX
          </button>
        </div>
      </div>

      {/* ── Locked banner ── */}
      {isLocked && (
        <div className="rounded-2xl bg-zinc-100/70 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-3 flex items-start gap-3">
          <Lock size={18} className="text-zinc-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-200">Periodas užrakintas.</p>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Korekcijos turi būti daromos kitame atvirame periode.</p>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-white/10">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-[14px] font-medium transition-colors cursor-pointer ${active ? 'text-primary dark:text-primary-ink' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'}`}>
              <Icon size={16} /> {t.label}
              {active && <motion.div layoutId="payroll-tab" className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary dark:bg-primary" />}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          {isTabLoading ? (
            <div className="py-16 text-center"><Loader2 className="w-7 h-7 text-primary animate-spin inline-block" /></div>
          ) : !periodId && tab !== 'ikainiai' && tab !== 'montuotojai' ? (
            <div className="bg-surface border border-zinc-100 dark:border-white/10 rounded-2xl py-16 text-center">
              <Coins size={36} className="text-zinc-300 dark:text-zinc-600 mb-2 inline-block" />
              <p className="text-[14px] text-zinc-500 dark:text-zinc-400 font-medium">Šis mėnuo dar neperskaičiuotas.</p>
              <p className="text-[13px] text-zinc-400 mt-1">Pasirinkite tarifų kortelę ir paspauskite „Perskaičiuoti“.</p>
            </div>
          ) : tab === 'objektai' ? (
            <ObjektaiTab periodId={periodId!} year={year} month={month} rateCardId={rateCardId} rateCards={rateCards} snapshots={snapshots} installers={installers} isLocked={isLocked} teamFilter={teamFilter} installerFilter={installerFilter} onChanged={invalidatePayroll} />
          ) : tab === 'montuotojai' ? (
            <MontuotojaiTab earnings={earnings} snapshots={snapshots} teams={teams} status={status} hasPeriod={!!periodId} teamFilter={teamFilter} installerFilter={installerFilter} onChanged={invalidatePayroll} />
          ) : tab === 'ikainiai' ? (
            <IkainiaiTab rateCards={rateCards} selectedCardId={rateCardId} onSelectCard={setRateCardId} lockedCardIds={lockedSet} onCardsChanged={() => void queryClient.invalidateQueries({ queryKey: ['payroll-rate-cards'] })} />
          ) : (
            <KorekcijosTab periodId={periodId!} earnings={earnings} installers={installers} snapshots={snapshots} isLocked={isLocked} onChanged={invalidatePayroll} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
