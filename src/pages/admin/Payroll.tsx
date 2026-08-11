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
import { AdminEmptyState, AdminPanelSkeleton } from '../../components/admin/AdminStates';
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
    // snapshots/earnings queries refetch as soon as the new period resolves.
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
        toast.warning(msg, { description: 'Sukurta objektų, bet montuotojų įrašų nesukurta. Patikrinkite dalyvius ir įkainius.' });
      } else if (s.warnings.length > 0) {
        toast.warning(msg, { description: `${s.warnings.length} įspėjim(ai): ${s.warnings.slice(0, 3).join(', ')}${s.warnings.length > 3 ? '...' : ''}` });
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

  const selectCls = 'h-[40px] rounded-card border border-border bg-surface px-3 text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer';

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-text">
            <Coins className="w-6 h-6 text-primary dark:text-primary-ink" /> Atlyginimai
          </h1>
          <p className="mt-0.5 text-[14px] text-muted">Atlygis pagal tarifų korteles, padalintas montuotojams.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${STATUS_CHIP[status].cls}`}>
            {isLocked && <Lock size={11} />} {STATUS_CHIP[status].label}
          </span>
          <div className="flex items-center gap-1 rounded-card border border-border bg-surface p-1">
            <button onClick={() => shiftMonth(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 active:scale-[0.98] cursor-pointer" title="Ankstesnis mėnuo">
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[150px] text-center text-[14px] font-semibold capitalize tabular-nums text-text">{monthName(year, month)}</span>
            <button onClick={() => shiftMonth(1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 active:scale-[0.98] cursor-pointer" title="Kitas mėnuo">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={rateCardId ?? ''} onChange={(e) => setRateCardId(e.target.value || null)} className={selectCls} title="Tarifų kortelė">
            {rateCards.length === 0 && <option value="">Nėra kortelių</option>}
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
            className="flex h-[40px] items-center gap-2 whitespace-nowrap rounded-card border border-border bg-surface px-4 text-[14px] font-medium text-text transition-colors hover:bg-surface-2 active:scale-[0.98] cursor-pointer disabled:cursor-default disabled:opacity-50"
          >
            {recalc.isPending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Perskaičiuoti
          </button>
          {!isLocked && (
            <button
              onClick={() => void handleLock()} disabled={lock.isPending || !periodId || snapshots.length === 0}
              title={!periodId || snapshots.length === 0 ? 'Pirma perskaičiuokite periodą' : undefined}
              className="flex h-[40px] items-center gap-2 whitespace-nowrap rounded-card bg-primary px-4 text-[14px] font-medium text-white transition-all hover:opacity-90 active:scale-[0.98] cursor-pointer disabled:cursor-default disabled:opacity-50"
            >
              {lock.isPending ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />} Užrakinti periodą
            </button>
          )}
          <button disabled title="Bus įgyvendinta vėliau"
            className="hidden h-[40px] items-center gap-2 whitespace-nowrap rounded-card border border-border bg-surface px-4 text-[14px] font-medium text-subtle opacity-50 cursor-not-allowed sm:flex">
            <Download size={15} /> Eksportuoti XLSX
          </button>
        </div>
      </div>

      {/* ── Locked banner ── */}
      {isLocked && (
        <div className="flex items-start gap-3 rounded-card border border-border bg-surface-2/70 px-4 py-3">
          <Lock size={18} className="mt-0.5 shrink-0 text-muted" />
          <div>
            <p className="text-[13px] font-semibold text-text">Periodas užrakintas.</p>
            <p className="text-[12px] text-muted">Korekcijos turi būti daromos kitame atvirame periode.</p>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 border-b border-border dark:border-white/10">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-[14px] font-medium transition-colors cursor-pointer ${active ? 'text-primary dark:text-primary-ink' : 'text-subtle hover:text-text dark:hover:text-subtle'}`}>
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
            <AdminPanelSkeleton className="h-72" />
          ) : !periodId && tab !== 'ikainiai' && tab !== 'montuotojai' ? (
            <AdminEmptyState
              icon={<Coins size={22} />}
              title="Įrašų nerasta."
              message="Šis mėnuo dar neperskaičiuotas. Pasirinkite tarifų kortelę ir paspauskite „Perskaičiuoti“."
              className="rounded-card border border-border bg-surface"
            />
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
