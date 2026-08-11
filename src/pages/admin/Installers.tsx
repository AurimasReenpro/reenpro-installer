import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  Loader2,
  Mail,
  MoreVertical,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Database } from '../../types/database.types';
import { INSTALLER_WORK_ROLE_OPTIONS } from '../../lib/installerWorkRoles';
import AddInstallerModal from '../../components/admin/AddInstallerModal';
import EditInstallerModal from '../../components/admin/EditInstallerModal';
import {
  assignInstallerToTeam,
  archiveTeam,
  createTeam,
  deactivateInstaller,
  getAdminInstallers,
  getInstallerActivityTimeEntries,
  getInstallerTeamPlannedSites,
  getTeams,
  reactivateInstaller,
  reactivateTeam,
  removeInstallerFromTeam,
  updateInstallerStatus,
  type InstallerEmploymentStatus,
  type InstallerActivityTimeEntry,
  type InstallerPlannedSiteSummary,
  type Team,
} from '../../api/installers';
import {
  buildInstallerRows,
  buildTeamCards,
  computeInstallerKpis,
  endOfInstallerWeek,
  filterTeamCards,
  filterInstallerRows,
  formatWeeklyHours,
  getAddableTeamMemberRows,
  getOperationalTeamOptions,
  getUnassignedActiveRows,
  startOfInstallerWeek,
  type InstallerRow,
  type InstallerStatus,
  type TeamStatusFilter,
} from './installers/installerListModel';

type UserProfile = Database['public']['Tables']['user_profiles']['Row'];

type TabId = 'installers' | 'teams';

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'installers', label: 'Montuotojai', icon: <Users size={16} /> },
  { id: 'teams', label: 'Komandos', icon: <UsersRound size={16} /> },
];

const statusOptions: { value: 'all' | InstallerEmploymentStatus; label: string }[] = [
  { value: 'all', label: 'Visi statusai' },
  { value: 'active', label: 'Aktyvus' },
  { value: 'inactive', label: 'Neaktyvus' },
  { value: 'invited', label: 'Laukia pakvietimo' },
  { value: 'suspended', label: 'Sustabdytas' },
  { value: 'archived', label: 'Archyvuotas' },
];

const teamStatusOptions: { value: TeamStatusFilter; label: string }[] = [
  { value: 'active', label: 'Aktyvios' },
  { value: 'inactive', label: 'Neaktyvios' },
  { value: 'archived', label: 'Archyvuotos' },
  { value: 'all', label: 'Visos' },
];

function getInitials(name: string | null) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  try { return format(new Date(dateStr), 'yyyy-MM-dd'); } catch { return '—'; }
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '—';
  try { return format(new Date(dateStr), 'MM-dd HH:mm'); } catch { return '—'; }
}

function statusChipClass(status: InstallerEmploymentStatus) {
  if (status === 'inactive') return 'bg-surface-2 text-muted border-border dark:bg-white/10 dark:border-white/10';
  if (status === 'invited') return 'bg-warning-bg text-warning border-warning';
  if (status === 'suspended') return 'bg-danger/10 text-danger border-danger';
  if (status === 'archived') return 'bg-surface-2 text-subtle border-border dark:bg-white/5 dark:border-white/10';
  return 'bg-primary/10 text-primary border-primary/20 dark:bg-primary/20 dark:text-primary-ink';
}

function teamStatusChipClass(status: string) {
  if (status === 'archived') return 'bg-surface-2 text-subtle border-border dark:bg-white/5 dark:border-white/10';
  if (status === 'inactive') return 'bg-warning-bg text-warning border-warning';
  return 'bg-success-bg text-success border-success';
}

function roleLabel(role: string | null) {
  if (role === 'installer') return 'Montuotojo prieiga';
  if (role === 'admin') return 'Administratorius';
  return role || '—';
}

function warningLabel(warning: InstallerRow['warnings'][number]) {
  if (warning === 'no_team') return 'Be komandos';
  if (warning === 'missing_phone') return 'Trūksta telefono';
  if (warning === 'long_open_entry') return 'Atviras įrašas >12h';
  if (warning === 'stale_activity') return 'Sena veikla';
  return 'Neaktyvus';
}

function KpiCard({ title, value, hint, icon }: { title: string; value: string; hint?: string; icon: ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-surface shadow-sm dark:shadow-none px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-subtle truncate">{title}</p>
        <p className="text-[22px] font-extrabold text-text leading-tight mt-1">{value}</p>
        {hint ? <p className="text-[12px] text-subtle mt-0.5 truncate">{hint}</p> : null}
      </div>
      <div className="w-10 h-10 rounded-card bg-surface-2 text-primary flex items-center justify-center shrink-0">
        {icon}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-24 rounded-card bg-surface-2 animate-pulse" />
        ))}
      </div>
      <div className="h-80 rounded-card bg-surface-2 animate-pulse" />
    </div>
  );
}

function InstallerActionsMenu({
  onView,
  onEdit,
  onAssignTeam,
  onChangeStatus,
  onDeactivate,
  onReactivate,
  onArchive,
  status,
}: {
  onView: () => void;
  onEdit: () => void;
  onAssignTeam: () => void;
  onChangeStatus: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onArchive: () => void;
  status: InstallerEmploymentStatus;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const item = 'w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-text hover:bg-surface-2 dark:hover:bg-[#27272a] transition-colors cursor-pointer text-left';

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setOpen((value) => !value)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-subtle hover:bg-surface-2 dark:hover:bg-white/10 transition-colors cursor-pointer"
        title="Veiksmai"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute right-0 top-9 z-20 w-56 bg-surface dark:bg-[#18181b] rounded-card shadow-lg border border-border dark:border-white/10 py-1 overflow-hidden">
            <button onClick={() => { close(); onView(); }} className={item}>
              <Eye size={15} className="text-subtle" /> Žiūrėti profilį
            </button>
            <button onClick={() => { close(); onEdit(); }} className={item}>
              <Edit3 size={15} className="text-subtle" /> Redaguoti
            </button>
            <button onClick={() => { close(); onAssignTeam(); }} className={item}>
              <Users size={15} className="text-subtle" /> Priskirti komandai
            </button>
            <button onClick={() => { close(); onChangeStatus(); }} className={item}>
              <Activity size={15} className="text-subtle" /> Keisti statusą
            </button>
            <div className="my-1 border-t border-border dark:border-white/5" />
            {status === 'active' || status === 'invited' ? (
              <button onClick={() => { close(); onDeactivate(); }} className={item}>
                <ShieldAlert size={15} className="text-warning" /> Deaktyvuoti
              </button>
            ) : (
              <button onClick={() => { close(); onReactivate(); }} className={item}>
                <CheckCircle2 size={15} className="text-success" /> Aktyvuoti
              </button>
            )}
            {status !== 'archived' && (
              <button onClick={() => { close(); onArchive(); }} className={item}>
                <Archive size={15} className="text-warning" /> Archyvuoti
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TeamActionButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-semibold text-muted hover:bg-surface-2 transition-colors cursor-pointer"
    >
      {children}
    </button>
  );
}

export default function Installers() {
  const [activeTab, setActiveTab] = useState<TabId>('installers');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingInstaller, setEditingInstaller] = useState<UserProfile | null>(null);
  const [deactivatingInstaller, setDeactivatingInstaller] = useState<UserProfile | null>(null);
  const [reactivatingInstaller, setReactivatingInstaller] = useState<UserProfile | null>(null);
  const [deactivationReason, setDeactivationReason] = useState('');
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [assigningTeamId, setAssigningTeamId] = useState<string | null>(null);
  const [assigningInstallerId, setAssigningInstallerId] = useState<string | null>(null);
  const [removingInstaller, setRemovingInstaller] = useState<InstallerRow | null>(null);
  const [teamStatusFilter, setTeamStatusFilter] = useState<TeamStatusFilter>('active');
  const [archivingTeam, setArchivingTeam] = useState<Team | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [reactivatingTeam, setReactivatingTeam] = useState<Team | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InstallerEmploymentStatus>('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [workRoleFilter, setWorkRoleFilter] = useState('all');
  const [onlyWithoutTeam, setOnlyWithoutTeam] = useState(false);
  const [onlyWorkingNow, setOnlyWorkingNow] = useState(false);
  const [onlyAttention, setOnlyAttention] = useState(false);
  const queryClient = useQueryClient();
  const createTeamInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const activitySinceIso = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - 120);
    return since.toISOString();
  }, []);

  const weekStartIso = useMemo(() => startOfInstallerWeek(now).toISOString(), [now]);
  const weekEndIso = useMemo(() => endOfInstallerWeek(now).toISOString(), [now]);

  // Management list: ALL installers (incl. archived) so they can always be found
  // and reactivated. Operational selectors use getActiveInstallers() instead.
  const { data: installers = [], isLoading: installersLoading } = useQuery<UserProfile[]>({
    queryKey: ['admin_installers'],
    queryFn: getAdminInstallers,
    staleTime: 60_000,
  });

  const { data: teams = [], isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ['admin_teams'],
    queryFn: getTeams,
  });

  const { data: activityEntries = [], isLoading: activityLoading } = useQuery<InstallerActivityTimeEntry[]>({
    queryKey: ['admin_installer_activity', activitySinceIso],
    queryFn: () => getInstallerActivityTimeEntries(activitySinceIso),
    staleTime: 60_000,
  });

  const { data: plannedSites = [], isLoading: plannedLoading } = useQuery<InstallerPlannedSiteSummary[]>({
    queryKey: ['admin_installer_team_plan', weekStartIso, weekEndIso],
    queryFn: () => getInstallerTeamPlannedSites(weekStartIso, weekEndIso),
    staleTime: 60_000,
  });

  const createTeamMutation = useMutation({
    mutationFn: (name: string) => createTeam(name),
    onSuccess: () => {
      toast.success('Komanda sukurta!');
      void queryClient.invalidateQueries({ queryKey: ['admin_teams'] });
      setNewTeamName('');
      setIsCreateTeamOpen(false);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Nepavyko sukurti komandos';
      toast.error(message);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ installerId, status, reason }: { installerId: string; status: InstallerEmploymentStatus; reason?: string }) =>
      updateInstallerStatus(installerId, status, reason),
    onSuccess: () => {
      toast.success('Montuotojo statusas atnaujintas.');
      void queryClient.invalidateQueries({ queryKey: ['admin_installers'] });
      void queryClient.invalidateQueries({ queryKey: ['installers_list'] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Nepavyko atnaujinti montuotojo statuso.';
      toast.error(message);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: ({ installerId, reason }: { installerId: string; reason?: string }) => deactivateInstaller(installerId, reason),
    onSuccess: () => {
      toast.success('Montuotojas deaktyvuotas.');
      setDeactivatingInstaller(null);
      setDeactivationReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin_installers'] });
      void queryClient.invalidateQueries({ queryKey: ['installers_list'] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Nepavyko deaktyvuoti montuotojo.';
      toast.error(message);
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: reactivateInstaller,
    onSuccess: () => {
      toast.success('Montuotojas aktyvuotas.');
      void queryClient.invalidateQueries({ queryKey: ['admin_installers'] });
      void queryClient.invalidateQueries({ queryKey: ['installers_list'] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Nepavyko aktyvuoti montuotojo.';
      toast.error(message);
    },
  });

  const invalidateInstallerTeamQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin_installers'] });
    void queryClient.invalidateQueries({ queryKey: ['installers_list'] });
  };

  const assignTeamMutation = useMutation({
    mutationFn: ({ installerId, teamId }: { installerId: string; teamId: string }) =>
      assignInstallerToTeam(installerId, teamId),
    onSuccess: () => {
      toast.success('Montuotojas priskirtas komandai.');
      setAssigningTeamId(null);
      setAssigningInstallerId(null);
      invalidateInstallerTeamQueries();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Nepavyko priskirti montuotojo komandai.';
      toast.error(message);
    },
  });

  const removeTeamMutation = useMutation({
    mutationFn: removeInstallerFromTeam,
    onSuccess: () => {
      toast.success('Montuotojas pašalintas iš komandos.');
      setRemovingInstaller(null);
      invalidateInstallerTeamQueries();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Nepavyko pašalinti montuotojo iš komandos.';
      toast.error(message);
    },
  });

  const archiveTeamMutation = useMutation({
    mutationFn: ({ teamId, reason }: { teamId: string; reason?: string }) => archiveTeam(teamId, reason),
    onSuccess: () => {
      toast.success('Komanda archyvuota.');
      setArchivingTeam(null);
      setArchiveReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin_teams'] });
      void queryClient.invalidateQueries({ queryKey: ['teams'] });
      void queryClient.invalidateQueries({ queryKey: ['active_teams'] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Nepavyko archyvuoti komandos.';
      toast.error(message);
    },
  });

  const reactivateTeamMutation = useMutation({
    mutationFn: reactivateTeam,
    onSuccess: () => {
      toast.success('Komanda aktyvuota.');
      setReactivatingTeam(null);
      void queryClient.invalidateQueries({ queryKey: ['admin_teams'] });
      void queryClient.invalidateQueries({ queryKey: ['teams'] });
      void queryClient.invalidateQueries({ queryKey: ['active_teams'] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Nepavyko aktyvuoti komandos.';
      toast.error(message);
    },
  });

  const handleCreateTeam = () => {
    const name = newTeamName.trim();
    if (!name) { toast.error('Įveskite komandos pavadinimą'); return; }
    createTeamMutation.mutate(name);
  };

  const openDeactivateDialog = (installer: UserProfile) => {
    setDeactivationReason('');
    setDeactivatingInstaller(installer);
  };

  const submitDeactivation = () => {
    if (!deactivatingInstaller) return;
    deactivateMutation.mutate({
      installerId: deactivatingInstaller.id,
      reason: deactivationReason.trim() || undefined,
    });
  };

  const rows = useMemo(
    () => buildInstallerRows(installers, teams, activityEntries, now),
    [installers, teams, activityEntries, now],
  );
  const kpis = useMemo(() => computeInstallerKpis(rows), [rows]);
  const teamCards = useMemo(
    () => buildTeamCards(teams, rows, plannedSites, now),
    [teams, rows, plannedSites, now],
  );
  const filteredTeamCards = useMemo(
    () => filterTeamCards(teamCards, teamStatusFilter),
    [teamCards, teamStatusFilter],
  );
  const operationalTeams = useMemo(() => getOperationalTeamOptions(teams), [teams]);
  const unassignedRows = useMemo(() => getUnassignedActiveRows(rows), [rows]);
  const assignableRows = useMemo(() => getAddableTeamMemberRows(rows, assigningTeamId), [assigningTeamId, rows]);
  const selectedAssignInstaller = assigningInstallerId
    ? rows.find((row) => row.id === assigningInstallerId) ?? null
    : null;
  const selectedAssignTeam = assigningTeamId
    ? teams.find((team) => team.id === assigningTeamId) ?? null
    : null;
  const filteredRows = useMemo(() => filterInstallerRows(rows, {
    search,
    status: statusFilter,
    teamId: teamFilter,
    workRole: workRoleFilter,
    onlyWithoutTeam,
    onlyWorkingNow,
    onlyAttention,
    includeArchivedAttention: statusFilter === 'archived',
  }), [onlyAttention, onlyWithoutTeam, onlyWorkingNow, rows, search, statusFilter, teamFilter, workRoleFilter]);

  const isLoading = installersLoading || teamsLoading || activityLoading || plannedLoading;
  const isAssignDialogOpen = assigningTeamId !== null || assigningInstallerId !== null;
  const submitAssignMember = () => {
    if (!assigningInstallerId) {
      toast.error('Pasirinkite montuotoją.');
      return;
    }
    if (!assigningTeamId) {
      toast.error('Pasirinkite komandą.');
      return;
    }
    if (!operationalTeams.some((team) => team.id === assigningTeamId)) {
      toast.error('Pasirinkta komanda nėra aktyvi.');
      return;
    }
    assignTeamMutation.mutate({ installerId: assigningInstallerId, teamId: assigningTeamId });
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-text">Montuotojai</h2>
          <p className="text-[14px] text-muted">Montuotojų paskyros, komandos ir šiandienos darbo būsena</p>
        </div>

        {activeTab === 'installers' ? (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="rounded-card bg-primary hover:opacity-90 text-white font-medium px-4 py-2 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus size={18} />
            Pridėti montuotoją
          </button>
        ) : (
          <button
            onClick={() => { setIsCreateTeamOpen(true); setTimeout(() => createTeamInputRef.current?.focus(), 50); }}
            className="rounded-card bg-primary hover:opacity-90 text-white font-medium px-4 py-2 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus size={18} />
            Sukurti komandą
          </button>
        )}
      </div>

      <div className="relative flex gap-1 bg-surface-2 rounded-[10px] p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative z-10 flex items-center gap-2 px-4 py-2 rounded-[8px] text-[14px] font-semibold transition-colors cursor-pointer ${
              activeTab === tab.id ? 'text-primary dark:text-primary-ink' : 'text-muted'
            }`}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute inset-0 bg-white dark:bg-[#3f3f46] rounded-[8px] shadow-sm"
                style={{ zIndex: -1 }}
                transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}
              />
            )}
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'installers' && (
          <motion.div
            key="installers"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col gap-4 min-h-0"
          >
            {isLoading ? (
              <LoadingSkeleton />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
                  <KpiCard title="Aktyvūs montuotojai" value={`${kpis.activeInstallers}`} icon={<Users size={18} />} />
                  <KpiCard title="Dirba dabar" value={`${kpis.workingNow}`} icon={<Activity size={18} />} />
                  <KpiCard title="Be komandos" value={`${kpis.withoutTeam}`} icon={<UsersRound size={18} />} />
                  <KpiCard title="Neaktyvūs" value={`${kpis.inactive}`} hint="laukas nepasiekiamas" icon={<ShieldAlert size={18} />} />
                  <KpiCard title="Šios sav. valandos" value={formatWeeklyHours(kpis.weeklyMinutes)} icon={<Clock size={18} />} />
                  <KpiCard title="Reikia dėmesio" value={`${kpis.needsAttention}`} icon={<AlertTriangle size={18} />} />
                </div>

                <div className="rounded-card border border-border bg-surface shadow-sm dark:shadow-none overflow-hidden flex-1 min-h-0 flex flex-col">
                  <div className="p-4 border-b border-border space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_160px_180px_160px] gap-2">
                      <label className="relative block">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Ieškoti pagal vardą, kontaktus ar komandą..."
                          className="w-full h-10 pl-9 pr-3 rounded-card bg-surface-2 border border-transparent dark:border-white/10 text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </label>
                      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | InstallerStatus)} className="h-10 rounded-card bg-surface-2 border border-transparent dark:border-white/10 px-3 text-[14px] text-text">
                        {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="h-10 rounded-card bg-surface-2 border border-transparent dark:border-white/10 px-3 text-[14px] text-text">
                        <option value="all">Visos komandos</option>
                        <option value="none">Be komandos</option>
                        {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                      </select>
                      <select value={workRoleFilter} onChange={(event) => setWorkRoleFilter(event.target.value)} className="h-10 rounded-card bg-surface-2 border border-transparent dark:border-white/10 px-3 text-[14px] text-text">
                        <option value="all">Visos pareigos</option>
                        {INSTALLER_WORK_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex items-center gap-2 rounded-card bg-surface-2 px-3 py-2 text-[13px] font-semibold text-muted cursor-pointer">
                        <input type="checkbox" checked={onlyWithoutTeam} onChange={(event) => setOnlyWithoutTeam(event.target.checked)} />
                        Tik be komandos
                      </label>
                      <label className="inline-flex items-center gap-2 rounded-card bg-surface-2 px-3 py-2 text-[13px] font-semibold text-muted cursor-pointer">
                        <input type="checkbox" checked={onlyWorkingNow} onChange={(event) => setOnlyWorkingNow(event.target.checked)} />
                        Tik dirba dabar
                      </label>
                      <label className="inline-flex items-center gap-2 rounded-card bg-surface-2 px-3 py-2 text-[13px] font-semibold text-muted cursor-pointer">
                        <input type="checkbox" checked={onlyAttention} onChange={(event) => setOnlyAttention(event.target.checked)} />
                        Tik su problemomis
                      </label>
                    </div>
                  </div>

                  <div className="overflow-x-auto flex-1">
                    <table className="w-full min-w-[1200px] text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-surface-2/50 dark:bg-surface-2">
                          <th className="py-3 px-4 text-[11px] font-bold text-subtle uppercase tracking-wider">Vardas</th>
                          <th className="py-3 px-4 text-[11px] font-bold text-subtle uppercase tracking-wider">Statusas</th>
                          <th className="py-3 px-4 text-[11px] font-bold text-subtle uppercase tracking-wider">Komanda</th>
                          <th className="py-3 px-4 text-[11px] font-bold text-subtle uppercase tracking-wider">Šiandien</th>
                          <th className="py-3 px-4 text-[11px] font-bold text-subtle uppercase tracking-wider">Šios sav. val.</th>
                          <th className="py-3 px-4 text-[11px] font-bold text-subtle uppercase tracking-wider">Kontaktai</th>
                          <th className="py-3 px-4 text-[11px] font-bold text-subtle uppercase tracking-wider">Pareigos</th>
                          <th className="py-3 px-4 text-[11px] font-bold text-subtle uppercase tracking-wider">Prieiga</th>
                          <th className="py-3 px-4 text-[11px] font-bold text-subtle uppercase tracking-wider">Pask. aktyvumas</th>
                          <th className="py-3 px-4 text-[11px] font-bold text-subtle uppercase tracking-wider text-right">Veiksmai</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="py-12 text-center text-subtle text-[14px]">
                              Montuotojų nerasta.
                            </td>
                          </tr>
                        ) : filteredRows.map((row) => {
                          const installer = installers.find((item) => item.id === row.id) ?? null;
                          return (
                            <tr key={row.id} className="border-b border-border dark:border-white/5 hover:bg-surface-2/50 dark:hover:bg-surface-2 transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-[11px] font-bold shrink-0 shadow-sm">
                                    {getInitials(row.name)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-text truncate">{row.name}</p>
                                    <p className="text-[12px] text-subtle">Sukurta {formatDate(installer?.created_at ?? null)}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex flex-col gap-1">
                                  <span className={`w-fit rounded-full border px-2.5 py-1 text-[12px] font-bold ${statusChipClass(row.status)}`}>
                                    {row.statusLabel}
                                  </span>
                                  {row.warnings.length > 0 ? (
                                    <span className="text-[11px] text-warning truncate" title={row.warnings.map(warningLabel).join(', ')}>
                                      {row.warnings.length} perspėj.
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-[14px] text-muted">
                                {row.teamName ?? '—'}
                              </td>
                              <td className="py-3 px-4">
                                {row.isWorkingNow ? (
                                  <div className="min-w-0">
                                    <p className="text-[13px] font-semibold text-text truncate" title={row.activeSiteName ?? undefined}>{row.activeSiteName ?? '—'}</p>
                                    <p className="text-[12px] text-success font-semibold tabular-nums">
                                      {formatWeeklyHours(row.activeElapsedMinutes)} · nuo {formatDateTime(row.activeStartedAt)}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-[14px] text-text font-semibold tabular-nums">
                                {formatWeeklyHours(row.weeklyMinutes)}
                              </td>
                              <td className="py-3 px-4">
                                <div className="space-y-1 text-[13px] text-muted">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <Mail size={14} className="text-subtle shrink-0" />
                                    <span className="truncate" title={row.email ?? undefined}>{row.email ?? '—'}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <Phone size={14} className="text-subtle shrink-0" />
                                    <span className="truncate">{row.phone || '—'}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <span className="bg-surface-2 text-muted border border-border px-2.5 py-1 rounded-lg text-[12px] font-bold uppercase tracking-wide">
                                  {row.workRoleLabel}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="bg-surface-2 text-muted border border-border px-2.5 py-1 rounded-lg text-[12px] font-bold uppercase tracking-wide">
                                  {roleLabel(row.role)}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-[13px] text-muted tabular-nums">
                                {formatDateTime(row.lastActivityAt)}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {installer ? (
                                  <InstallerActionsMenu
                                    onView={() => setEditingInstaller(installer)}
                                    onEdit={() => setEditingInstaller(installer)}
                                    onAssignTeam={() => setEditingInstaller(installer)}
                                    onChangeStatus={() => toast('Naudokite Deaktyvuoti, Aktyvuoti arba Archyvuoti veiksmą.')}
                                    onDeactivate={() => openDeactivateDialog(installer)}
                                    onReactivate={() => setReactivatingInstaller(installer)}
                                    onArchive={() => statusMutation.mutate({ installerId: installer.id, status: 'archived' })}
                                    status={row.status}
                                  />
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}

        {activeTab === 'teams' && (
          <motion.div
            key="teams"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col gap-4"
          >
            <AnimatePresence>
              {isCreateTeamOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: -6 }}
                  transition={{ type: 'spring', bounce: 0.25, duration: 0.35 }}
                  className="bg-surface rounded-card border border-border shadow-sm dark:shadow-none p-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
                >
                  <input
                    ref={createTeamInputRef}
                    type="text"
                    value={newTeamName}
                    onChange={(event) => setNewTeamName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleCreateTeam();
                      if (event.key === 'Escape') { setIsCreateTeamOpen(false); setNewTeamName(''); }
                    }}
                    placeholder="Komandos pavadinimas..."
                    disabled={createTeamMutation.isPending}
                    className="flex-1 h-[40px] px-4 bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text dark:text-white focus:outline-none focus:bg-white dark:focus:bg-surface-2 focus:ring-2 focus:ring-primary transition-all disabled:opacity-60"
                  />
                  <button
                    onClick={handleCreateTeam}
                    disabled={createTeamMutation.isPending}
                    className="h-[40px] px-4 font-medium text-[14px] rounded-card bg-primary text-white hover:bg-primary transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
                  >
                    {createTeamMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : null}
                    Sukurti
                  </button>
                  <button
                    onClick={() => { setIsCreateTeamOpen(false); setNewTeamName(''); }}
                    disabled={createTeamMutation.isPending}
                    className="h-[40px] px-4 font-medium text-[14px] rounded-card border border-border text-muted dark:text-subtle hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    Atšaukti
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {isLoading ? (
              <LoadingSkeleton />
            ) : teams.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 rounded-card border border-border bg-surface">
                <div className="w-16 h-16 rounded-card bg-surface-2 flex items-center justify-center">
                  <UsersRound size={28} className="text-subtle dark:text-muted" />
                </div>
                <p className="text-text font-bold text-[16px]">Komandų dar nėra.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={teamStatusFilter}
                    onChange={(event) => setTeamStatusFilter(event.target.value as TeamStatusFilter)}
                    className="h-10 rounded-card bg-surface border border-border px-3 text-[14px] text-text"
                  >
                    {teamStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredTeamCards.map((team) => (
                    <motion.div
                      key={team.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.2 }}
                      className={`bg-surface rounded-card border border-border shadow-sm dark:shadow-none p-5 flex flex-col gap-4 ${team.isArchived ? 'opacity-65' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-card bg-primary flex items-center justify-center shadow-sm shrink-0">
                            <UsersRound size={16} className="text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[15px] font-bold text-text leading-tight truncate">{team.name}</p>
                            <p className="text-[12px] text-subtle dark:text-subtle">{team.memberCount} nariai</p>
                            {team.roleSummaryLabel ? (
                              <p className="text-[11px] text-subtle dark:text-subtle truncate" title={team.roleSummaryLabel}>
                                {team.roleSummaryLabel}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${teamStatusChipClass(team.status)}`}>
                            {team.statusLabel}
                          </span>
                          {team.warnings.includes('no_members') ? (
                            <span className="rounded-full border border-warning bg-warning-bg px-2.5 py-1 text-[11px] font-bold text-warning">
                              Be narių
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                          team.hasElectrician
                            ? 'border-success bg-success-bg text-success'
                            : 'border-warning bg-warning-bg text-warning'
                        }`}>
                          {team.hasElectrician ? 'Yra elektrikas' : 'Nėra elektriko'}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                          team.hasSiteManager
                            ? 'border-success bg-success-bg text-success'
                            : 'border-warning bg-warning-bg text-warning'
                        }`}>
                          {team.hasSiteManager ? 'Yra darbų vadovas' : 'Nėra darbų vadovo'}
                        </span>
                      </div>

                      {team.hasSiteManager ? (
                        <p className="text-[12px] text-muted truncate" title={team.siteManagerNames.join(', ')}>
                          Darbų vadovas: <span className="font-semibold text-text">{team.siteManagerNames.join(', ')}</span>
                        </p>
                      ) : null}

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-card bg-surface-2 px-3 py-2">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">Šiandien</p>
                          <p className="text-[18px] font-extrabold text-text">{team.todayAssignedSitesCount ?? '—'}</p>
                        </div>
                        <div className="rounded-card bg-surface-2 px-3 py-2">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">Šią savaitę</p>
                          <p className="text-[18px] font-extrabold text-text">{team.thisWeekPlannedSitesCount ?? '—'}</p>
                        </div>
                      </div>

                      <div className="h-px bg-border/60 dark:bg-white/5" />

                      {team.members.length === 0 ? (
                        <p className="text-[13px] text-subtle dark:text-subtle italic">Nėra priskirtų montuotojų</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {team.members.slice(0, 5).map((member) => (
                            <div key={member.id} className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-full bg-primary/10 dark:bg-primary/30 text-primary dark:text-primary-ink flex items-center justify-center text-[9px] font-bold shrink-0">
                                {getInitials(member.name)}
                              </div>
                              <span className="text-[13px] text-text font-medium truncate">
                                {member.name} · {member.workRoleLabel}
                              </span>
                              <div className="ml-auto flex shrink-0 items-center gap-1">
                                {member.isWorkingNow ? (
                                  <span className="rounded-full bg-success-bg px-2 py-0.5 text-[10px] font-bold text-success">
                                    Dirba
                                  </span>
                                ) : null}
                                {team.status === 'active' ? (
                                  <button
                                    type="button"
                                    onClick={() => setRemovingInstaller(member)}
                                    disabled={removeTeamMutation.isPending}
                                    className="rounded-lg border border-border px-2 py-0.5 text-[10px] font-bold text-muted transition-colors hover:bg-surface-2 disabled:opacity-60"
                                  >
                                    Pašalinti
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                          {team.members.length > 5 && (
                            <p className="text-[12px] text-subtle dark:text-subtle pl-8">+{team.members.length - 5} daugiau...</p>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        {team.status !== 'active' ? (
                          <TeamActionButton onClick={() => setReactivatingTeam(teams.find((item) => item.id === team.id) ?? null)}>Aktyvuoti</TeamActionButton>
                        ) : (
                          <>
                            <TeamActionButton onClick={() => toast('Komandos pavadinimo redagavimas bus prijungtas atskirai.')}>Redaguoti</TeamActionButton>
                            <TeamActionButton onClick={() => { setAssigningTeamId(team.id); setAssigningInstallerId(null); }}>Pridėti narį</TeamActionButton>
                            <TeamActionButton onClick={() => setArchivingTeam(teams.find((item) => item.id === team.id) ?? null)}>Archyvuoti</TeamActionButton>
                          </>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {filteredTeamCards.length === 0 ? (
                    <div className="rounded-card border border-border bg-surface p-8 text-center text-[14px] text-subtle lg:col-span-2 xl:col-span-3">
                      Komandų pagal pasirinktą statusą nėra.
                    </div>
                  ) : null}
                </div>

                <div className="rounded-card border border-border bg-surface shadow-sm dark:shadow-none p-5">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-[16px] font-extrabold text-text">Nepriskirti montuotojai</h3>
                      <p className="text-[13px] text-muted">Montuotojai, kurie neturi komandos</p>
                    </div>
                    <UserPlus size={18} className="text-subtle" />
                  </div>
                  {unassignedRows.length === 0 ? (
                    <p className="text-[14px] text-subtle">Nėra nepriskirtų montuotojų.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {unassignedRows.map((row) => (
                        <div
                          key={row.id}
                          className="rounded-card border border-border bg-surface-2 px-3 py-2"
                        >
                          <span className="block text-[13px] font-bold text-text">{row.name}</span>
                          <span className="block text-[12px] text-subtle">{row.workRoleLabel}</span>
                          <button
                            type="button"
                            onClick={() => { setAssigningInstallerId(row.id); setAssigningTeamId(null); }}
                            className="mt-2 rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold text-muted transition-colors hover:bg-white dark:hover:bg-white/10"
                          >
                            Priskirti komandai
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AddInstallerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
      <EditInstallerModal
        isOpen={!!editingInstaller}
        onClose={() => setEditingInstaller(null)}
        installer={editingInstaller}
      />

      <AnimatePresence>
        {isAssignDialogOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => {
              if (!assignTeamMutation.isPending) {
                setAssigningTeamId(null);
                setAssigningInstallerId(null);
              }
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-2xl"
            >
              <h3 className="text-[18px] font-extrabold text-text">
                {selectedAssignTeam ? `Pridėti narį į ${selectedAssignTeam.name}` : 'Priskirti komandai'}
              </h3>
              <p className="mt-2 text-[14px] text-muted">
                Pasirinkite aktyvų montuotoją ir komandą. Istoriniai įrašai nekeičiami.
              </p>
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide text-subtle">Montuotojas</span>
                  <select
                    value={assigningInstallerId ?? ''}
                    onChange={(event) => setAssigningInstallerId(event.target.value || null)}
                    disabled={assignTeamMutation.isPending}
                    className="h-11 w-full rounded-card border border-border bg-surface-2 px-3 text-[14px] text-text outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  >
                    <option value="">Pasirinkite montuotoją</option>
                    {assignableRows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} · {row.workRoleLabel}{row.teamName ? ` · dabar: ${row.teamName}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide text-subtle">Komanda</span>
                  <select
                    value={assigningTeamId ?? ''}
                    onChange={(event) => setAssigningTeamId(event.target.value || null)}
                    disabled={assignTeamMutation.isPending}
                    className="h-11 w-full rounded-card border border-border bg-surface-2 px-3 text-[14px] text-text outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  >
                    <option value="">Pasirinkite komandą</option>
                    {operationalTeams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </label>
                {assignableRows.length === 0 && !selectedAssignInstaller ? (
                  <p className="text-[13px] text-subtle">Nėra aktyvių montuotojų, kuriuos galima pridėti.</p>
                ) : null}
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setAssigningTeamId(null); setAssigningInstallerId(null); }}
                  disabled={assignTeamMutation.isPending}
                  className="h-11 flex-1 rounded-card border border-border text-[14px] font-semibold text-muted transition-colors hover:bg-surface-2 disabled:opacity-60"
                >
                  Atšaukti
                </button>
                <button
                  type="button"
                  onClick={submitAssignMember}
                  disabled={assignTeamMutation.isPending || !assigningInstallerId || !assigningTeamId}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-card bg-primary text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {assignTeamMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                  Priskirti
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {removingInstaller && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => { if (!removeTeamMutation.isPending) setRemovingInstaller(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-2xl"
            >
              <h3 className="text-[18px] font-extrabold text-text">Pašalinti iš komandos?</h3>
              <p className="mt-2 text-[14px] text-muted">
                {removingInstaller.name} nebebus priskirtas komandai. Darbo istorija ir objektų įrašai nebus keičiami.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setRemovingInstaller(null)}
                  disabled={removeTeamMutation.isPending}
                  className="h-11 flex-1 rounded-card border border-border text-[14px] font-semibold text-muted transition-colors hover:bg-surface-2 disabled:opacity-60"
                >
                  Atšaukti
                </button>
                <button
                  type="button"
                  onClick={() => removeTeamMutation.mutate(removingInstaller.id)}
                  disabled={removeTeamMutation.isPending}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-card bg-primary text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {removeTeamMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                  Pašalinti
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {archivingTeam && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => { if (!archiveTeamMutation.isPending) setArchivingTeam(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-2xl"
            >
              <h3 className="text-[18px] font-extrabold text-text">Archyvuoti komandą?</h3>
              <p className="mt-2 text-[14px] text-muted">
                Komanda nebebus rodoma aktyviame planavime, tačiau istorija išliks.
              </p>
              <label className="mt-5 block">
                <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide text-subtle">Priežastis</span>
                <textarea
                  value={archiveReason}
                  onChange={(event) => setArchiveReason(event.target.value)}
                  disabled={archiveTeamMutation.isPending}
                  rows={3}
                  className="w-full resize-none rounded-card border border-border bg-surface-2 px-3 py-2 text-[14px] text-text outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  placeholder="Neprivaloma"
                />
              </label>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setArchivingTeam(null)}
                  disabled={archiveTeamMutation.isPending}
                  className="h-11 flex-1 rounded-card border border-border text-[14px] font-semibold text-muted transition-colors hover:bg-surface-2 disabled:opacity-60"
                >
                  Atšaukti
                </button>
                <button
                  type="button"
                  onClick={() => archiveTeamMutation.mutate({ teamId: archivingTeam.id, reason: archiveReason.trim() || undefined })}
                  disabled={archiveTeamMutation.isPending}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-card bg-primary text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {archiveTeamMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                  Archyvuoti
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reactivatingTeam && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => { if (!reactivateTeamMutation.isPending) setReactivatingTeam(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-2xl"
            >
              <h3 className="text-[18px] font-extrabold text-text">Aktyvuoti komandą?</h3>
              <p className="mt-2 text-[14px] text-muted">
                Komanda vėl bus rodoma aktyviuose priskyrimuose ir tvarkaraštyje.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setReactivatingTeam(null)}
                  disabled={reactivateTeamMutation.isPending}
                  className="h-11 flex-1 rounded-card border border-border text-[14px] font-semibold text-muted transition-colors hover:bg-surface-2 disabled:opacity-60"
                >
                  Atšaukti
                </button>
                <button
                  type="button"
                  onClick={() => reactivateTeamMutation.mutate(reactivatingTeam.id)}
                  disabled={reactivateTeamMutation.isPending}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-card bg-primary text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {reactivateTeamMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                  Aktyvuoti
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deactivatingInstaller && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => { if (!deactivateMutation.isPending) setDeactivatingInstaller(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-2xl"
            >
              <h3 className="text-[18px] font-extrabold text-text">Deaktyvuoti montuotoją?</h3>
              <p className="mt-2 text-[14px] text-muted">
                Montuotojas nebebus rodomas aktyviuose priskyrimuose, tačiau istorija išliks.
              </p>
              <label className="mt-5 block">
                <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide text-subtle">Priežastis</span>
                <textarea
                  value={deactivationReason}
                  onChange={(event) => setDeactivationReason(event.target.value)}
                  disabled={deactivateMutation.isPending}
                  rows={3}
                  className="w-full resize-none rounded-card border border-border bg-surface-2 px-3 py-2 text-[14px] text-text outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  placeholder="Neprivaloma"
                />
              </label>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeactivatingInstaller(null)}
                  disabled={deactivateMutation.isPending}
                  className="h-11 flex-1 rounded-card border border-border text-[14px] font-semibold text-muted transition-colors hover:bg-surface-2 disabled:opacity-60"
                >
                  Atšaukti
                </button>
                <button
                  type="button"
                  onClick={submitDeactivation}
                  disabled={deactivateMutation.isPending}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-card bg-primary text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {deactivateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                  Deaktyvuoti
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reactivatingInstaller && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => { if (!reactivateMutation.isPending) setReactivatingInstaller(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-2xl"
            >
              <h3 className="text-[18px] font-extrabold text-text">Aktyvuoti montuotoją?</h3>
              <p className="mt-2 text-[14px] text-muted">
                Montuotojas vėl bus matomas aktyviuose priskyrimuose ir komandos pasirinkimuose.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setReactivatingInstaller(null)}
                  disabled={reactivateMutation.isPending}
                  className="h-11 flex-1 rounded-card border border-border text-[14px] font-semibold text-muted transition-colors hover:bg-surface-2 disabled:opacity-60"
                >
                  Atšaukti
                </button>
                <button
                  type="button"
                  onClick={() => reactivateMutation.mutate(reactivatingInstaller.id, { onSuccess: () => setReactivatingInstaller(null) })}
                  disabled={reactivateMutation.isPending}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-card bg-primary text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {reactivateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                  Aktyvuoti
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
