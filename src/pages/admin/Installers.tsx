import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import {
  Plus, Loader2, Mail, Phone, Calendar, Trash2, Users, UsersRound,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Database } from '../../types/database.types';
import AddInstallerModal from '../../components/admin/AddInstallerModal';
import EditInstallerModal from '../../components/admin/EditInstallerModal';
import { useConfirm } from '../../hooks/useConfirm';
import {
  deleteInstaller, getTeams, createTeam, deleteTeam,
  type Team,
} from '../../api/installers';

type UserProfile = Database['public']['Tables']['user_profiles']['Row'];

type TabId = 'installers' | 'teams';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'installers', label: 'Montuotojai', icon: <Users size={16} /> },
  { id: 'teams', label: 'Komandos', icon: <UsersRound size={16} /> },
];

export default function Installers() {
  const [activeTab, setActiveTab] = useState<TabId>('installers');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingInstaller, setEditingInstaller] = useState<UserProfile | null>(null);
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const createTeamInputRef = useRef<HTMLInputElement>(null);

  /* ── Installers query ── */
  const { data: installers, isLoading: installersLoading } = useQuery<UserProfile[]>({
    queryKey: ['admin_installers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('role', 'installer')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  /* ── Teams query ── */
  const { data: teams, isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ['admin_teams'],
    queryFn: getTeams,
  });

  /* ── Delete installer ── */
  const deleteMutation = useMutation({
    mutationFn: deleteInstaller,
    onSuccess: () => {
      toast.success('Montuotojas ištrintas');
      void queryClient.invalidateQueries({ queryKey: ['admin_installers'] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Nepavyko ištrinti montuotojo';
      toast.error(message);
    },
  });

  const handleDeleteInstaller = async (id: string) => {
    const ok = await confirm({
      title: 'Ištrinti montuotoją?',
      message: 'Ar tikrai norite ištrinti šį montuotoją? Šis veiksmas negrįžtamas.',
      variant: 'danger',
    });
    if (ok) deleteMutation.mutate(id);
  };

  /* ── Create team ── */
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

  const handleCreateTeam = () => {
    const name = newTeamName.trim();
    if (!name) { toast.error('Įveskite komandos pavadinimą'); return; }
    createTeamMutation.mutate(name);
  };

  /* ── Delete team ── */
  const deleteTeamMutation = useMutation({
    mutationFn: deleteTeam,
    onSuccess: () => {
      toast.success('Komanda ištrinta');
      void queryClient.invalidateQueries({ queryKey: ['admin_teams'] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Nepavyko ištrinti komandos';
      toast.error(message);
    },
  });

  const handleDeleteTeam = async (team: Team) => {
    const ok = await confirm({
      title: `Ištrinti komandą "${team.name}"?`,
      message: 'Komandos montuotojai liks sistemoje, tačiau nebus priskirti jokiai komandai.',
      variant: 'danger',
    });
    if (ok) deleteTeamMutation.mutate(team.id);
  };

  /* ── Helpers ── */
  const getInitials = (name: string | null) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const getRoleBadge = (role: string | null) => {
    if (role === 'installer') {
      return (
        <span className="bg-[#fbf0ff] text-primary border border-primary/20 px-2.5 py-1 rounded-[6px] text-[12px] font-bold uppercase tracking-wide">
          Montuotojas
        </span>
      );
    }
    return (
      <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-[6px] text-[12px] font-bold uppercase border border-gray-200">
        {role || 'Nenurodyta'}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    try { return format(new Date(dateStr), 'yyyy-MM-dd'); } catch { return '-'; }
  };

  const teamMembersOf = (teamId: string) =>
    (installers || []).filter((i) => i.team_id === teamId);

  /* ──────────────────────── JSX ──────────────────────── */
  return (
    <div className="space-y-6 h-full flex flex-col">

      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Montuotojai</h2>
          <p className="text-[14px] text-gray-500 dark:text-gray-400">Sistemos montuotojų paskyros ir komandos</p>
        </div>

        {activeTab === 'installers' ? (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Plus size={18} />
            Pridėti montuotoją
          </button>
        ) : (
          <button
            onClick={() => { setIsCreateTeamOpen(true); setTimeout(() => createTeamInputRef.current?.focus(), 50); }}
            className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Plus size={18} />
            Sukurti komandą
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="relative flex gap-1 bg-gray-100 dark:bg-[#27272a] rounded-[10px] p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative z-10 flex items-center gap-2 px-4 py-2 rounded-[8px] text-[14px] font-semibold transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'text-purple-600 dark:text-purple-300'
                : 'text-gray-500 dark:text-gray-400'
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

      {/* ── INSTALLERS TAB ── */}
      <AnimatePresence mode="wait">
        {activeTab === 'installers' && (
          <motion.div
            key="installers"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-[#18181b] border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none flex-1 overflow-hidden flex flex-col"
          >
            {installersLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-gray-400 dark:text-gray-500 text-[14px] font-medium">Kraunami montuotojai...</p>
              </div>
            ) : (
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-[#27272a]">
                      <th className="py-4 px-6 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Vardas</th>
                      <th className="py-4 px-6 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">El. Paštas</th>
                      <th className="py-4 px-6 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Telefonas</th>
                      <th className="py-4 px-6 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Rolė</th>
                      <th className="py-4 px-6 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Sukurta</th>
                      <th className="py-4 px-6 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">Veiksmai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installers?.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-gray-400 dark:text-gray-500 text-[14px]">
                          Montuotojų nerasta.
                        </td>
                      </tr>
                    ) : (
                      installers?.map((installer) => {
                        const initials = getInitials(installer.full_name);
                        return (
                          <tr key={installer.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50/50 dark:hover:bg-[#27272a] transition-colors">
                            <td className="py-4 px-6 font-bold text-[#1d033a] dark:text-gray-100 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0 shadow-sm">
                                {initials}
                              </div>
                              <span>{installer.full_name || 'Be vardo'}</span>
                            </td>
                            <td className="py-4 px-6 text-[#4b4452] dark:text-gray-400 text-[14px]">
                              <div className="flex items-center gap-1.5">
                                <Mail size={16} className="text-[#cdc3d4] dark:text-gray-600" />
                                {installer.email}
                              </div>
                            </td>
                            <td className="py-4 px-6 text-[#4b4452] dark:text-gray-400 text-[14px]">
                              <div className="flex items-center gap-1.5">
                                <Phone size={16} className="text-[#cdc3d4] dark:text-gray-600" />
                                {installer.phone || '-'}
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              {getRoleBadge(installer.role)}
                            </td>
                            <td className="py-4 px-6 text-[#4b4452] dark:text-gray-400 text-[14px] font-medium">
                              <div className="flex items-center gap-1.5">
                                <Calendar size={16} className="text-[#cdc3d4] dark:text-gray-600" />
                                {formatDate(installer.created_at)}
                              </div>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <button
                                  onClick={() => setEditingInstaller(installer)}
                                  className="text-primary dark:text-purple-300 font-semibold text-[14px] hover:underline cursor-pointer"
                                >
                                  Redaguoti
                                </button>
                                <button
                                  onClick={() => void handleDeleteInstaller(installer.id)}
                                  className="text-red-500 hover:text-red-700 transition-colors cursor-pointer flex items-center"
                                  title="Ištrinti montuotoją"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* ── TEAMS TAB ── */}
        {activeTab === 'teams' && (
          <motion.div
            key="teams"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col gap-4"
          >
            {/* Create team inline form */}
            <AnimatePresence>
              {isCreateTeamOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: -6 }}
                  transition={{ type: 'spring', bounce: 0.25, duration: 0.35 }}
                  className="bg-white dark:bg-[#18181b] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm dark:shadow-none p-5 flex items-center gap-3"
                >
                  <input
                    ref={createTeamInputRef}
                    type="text"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTeam(); if (e.key === 'Escape') { setIsCreateTeamOpen(false); setNewTeamName(''); } }}
                    placeholder="Komandos pavadinimas..."
                    disabled={createTeamMutation.isPending}
                    className="flex-1 h-[40px] px-4 bg-gray-50 dark:bg-[#27272a] border border-transparent dark:border-white/10 rounded-xl text-[14px] text-gray-900 dark:text-white focus:outline-none focus:bg-white dark:focus:bg-[#27272a] focus:ring-2 focus:ring-purple-500 transition-all disabled:opacity-60"
                  />
                  <button
                    onClick={handleCreateTeam}
                    disabled={createTeamMutation.isPending}
                    className="h-[40px] px-4 font-medium text-[14px] rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-all flex items-center gap-2 disabled:opacity-70 cursor-pointer"
                  >
                    {createTeamMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : null}
                    Sukurti
                  </button>
                  <button
                    onClick={() => { setIsCreateTeamOpen(false); setNewTeamName(''); }}
                    disabled={createTeamMutation.isPending}
                    className="h-[40px] px-4 font-medium text-[14px] rounded-xl border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#27272a] transition-colors cursor-pointer"
                  >
                    Atšaukti
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Teams grid */}
            {teamsLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-gray-400 dark:text-gray-500 text-[14px] font-medium">Kraunamos komandos...</p>
              </div>
            ) : !teams || teams.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 dark:bg-[#27272a] flex items-center justify-center">
                  <UsersRound size={28} className="text-[#cdc3d4] dark:text-gray-600" />
                </div>
                <p className="text-[#1d033a] dark:text-gray-100 font-bold text-[16px]">Komandų nėra</p>
                <p className="text-[#7c7484] dark:text-gray-400 text-[14px]">Sukurkite pirmą komandą paspausdami mygtuką viršuje</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams.map((team) => {
                  const members = teamMembersOf(team.id);
                  return (
                    <motion.div
                      key={team.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.2 }}
                      className="bg-white dark:bg-[#18181b] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm dark:shadow-none p-5 flex flex-col gap-3"
                    >
                      {/* Card header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-purple-600 to-purple-500 flex items-center justify-center shadow-sm flex-shrink-0">
                            <UsersRound size={16} className="text-white" />
                          </div>
                          <div>
                            <p className="text-[15px] font-bold text-[#1d033a] dark:text-gray-100 leading-tight">{team.name}</p>
                            <p className="text-[12px] text-[#7c7484] dark:text-gray-400">{members.length} montuotojas(-ai)</p>
                          </div>
                        </div>
                        <button
                          onClick={() => void handleDeleteTeam(team)}
                          className="text-[#cdc3d4] dark:text-gray-600 hover:text-red-500 transition-colors cursor-pointer flex-shrink-0 mt-0.5"
                          title="Ištrinti komandą"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      {/* Divider */}
                      <div className="h-px bg-[#cdc3d4]/20 dark:bg-white/5" />

                      {/* Members list */}
                      {members.length === 0 ? (
                        <p className="text-[13px] text-[#7c7484] dark:text-gray-400 italic">Nėra priskirtų montuotojų</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {members.slice(0, 5).map((m) => (
                            <div key={m.id} className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-primary/10 dark:bg-purple-900/30 text-primary dark:text-purple-300 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                                {getInitials(m.full_name)}
                              </div>
                              <span className="text-[13px] text-[#1d033a] dark:text-gray-200 font-medium truncate">
                                {m.full_name || m.email}
                              </span>
                            </div>
                          ))}
                          {members.length > 5 && (
                            <p className="text-[12px] text-[#7c7484] dark:text-gray-400 pl-8">
                              +{members.length - 5} daugiau...
                            </p>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AddInstallerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
      <EditInstallerModal
        isOpen={!!editingInstaller}
        onClose={() => setEditingInstaller(null)}
        installer={editingInstaller}
      />
    </div>
  );
}
