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
          <h2 className="text-[24px] font-bold text-[#1d033a]">Montuotojai</h2>
          <p className="text-[14px] text-[#4b4452]">Sistemos montuotojų paskyros ir komandos</p>
        </div>

        {activeTab === 'installers' ? (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="h-[40px] px-4 font-semibold text-[14px] rounded-[8px] bg-primary text-white hover:bg-primary/80 transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Plus size={18} />
            Pridėti montuotoją
          </button>
        ) : (
          <button
            onClick={() => { setIsCreateTeamOpen(true); setTimeout(() => createTeamInputRef.current?.focus(), 50); }}
            className="h-[40px] px-4 font-semibold text-[14px] rounded-[8px] bg-primary text-white hover:bg-primary/80 transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Plus size={18} />
            Sukurti komandą
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="relative flex gap-1 bg-[#f6f5fa] rounded-[10px] p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="relative z-10 flex items-center gap-2 px-4 py-2 rounded-[8px] text-[14px] font-semibold transition-colors cursor-pointer"
            style={{ color: activeTab === tab.id ? '#490891' : '#7c7484' }}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute inset-0 bg-white rounded-[8px] shadow-sm"
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
            className="bg-white rounded-[16px] shadow-[0px_4px_20px_rgba(29,3,58,0.05)] border border-[#cdc3d4]/20 flex-1 overflow-hidden flex flex-col"
          >
            {installersLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-[#4b4452] text-[14px] font-medium">Kraunami montuotojai...</p>
              </div>
            ) : (
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#cdc3d4]/40 bg-[#f6f5fa]/50">
                      <th className="py-4 px-6 text-[13px] font-bold text-[#4b4452] uppercase tracking-wider">Vardas</th>
                      <th className="py-4 px-6 text-[13px] font-bold text-[#4b4452] uppercase tracking-wider">El. Paštas</th>
                      <th className="py-4 px-6 text-[13px] font-bold text-[#4b4452] uppercase tracking-wider">Telefonas</th>
                      <th className="py-4 px-6 text-[13px] font-bold text-[#4b4452] uppercase tracking-wider">Rolė</th>
                      <th className="py-4 px-6 text-[13px] font-bold text-[#4b4452] uppercase tracking-wider">Sukurta</th>
                      <th className="py-4 px-6 text-[13px] font-bold text-[#4b4452] uppercase tracking-wider text-right">Veiksmai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installers?.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-[#4b4452] text-[14px]">
                          Montuotojų nerasta.
                        </td>
                      </tr>
                    ) : (
                      installers?.map((installer) => {
                        const initials = getInitials(installer.full_name);
                        return (
                          <tr key={installer.id} className="border-b border-[#cdc3d4]/20 hover:bg-[#f6f5fa]/30 transition-colors">
                            <td className="py-4 px-6 font-bold text-[#1d033a] flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0 shadow-sm">
                                {initials}
                              </div>
                              <span>{installer.full_name || 'Be vardo'}</span>
                            </td>
                            <td className="py-4 px-6 text-[#4b4452] text-[14px]">
                              <div className="flex items-center gap-1.5">
                                <Mail size={16} className="text-[#cdc3d4]" />
                                {installer.email}
                              </div>
                            </td>
                            <td className="py-4 px-6 text-[#4b4452] text-[14px]">
                              <div className="flex items-center gap-1.5">
                                <Phone size={16} className="text-[#cdc3d4]" />
                                {installer.phone || '-'}
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              {getRoleBadge(installer.role)}
                            </td>
                            <td className="py-4 px-6 text-[#4b4452] text-[14px] font-medium">
                              <div className="flex items-center gap-1.5">
                                <Calendar size={16} className="text-[#cdc3d4]" />
                                {formatDate(installer.created_at)}
                              </div>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <button
                                  onClick={() => setEditingInstaller(installer)}
                                  className="text-primary font-semibold text-[14px] hover:underline cursor-pointer"
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
                  className="bg-white rounded-[16px] border border-[#cdc3d4]/30 shadow-[0px_4px_20px_rgba(29,3,58,0.06)] p-5 flex items-center gap-3"
                >
                  <input
                    ref={createTeamInputRef}
                    type="text"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTeam(); if (e.key === 'Escape') { setIsCreateTeamOpen(false); setNewTeamName(''); } }}
                    placeholder="Komandos pavadinimas..."
                    disabled={createTeamMutation.isPending}
                    className="flex-1 h-[40px] px-3 bg-[#f6f5fa] border border-[#cdc3d4] rounded-[8px] text-[14px] text-[#1d033a] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
                  />
                  <button
                    onClick={handleCreateTeam}
                    disabled={createTeamMutation.isPending}
                    className="h-[40px] px-4 font-semibold text-[14px] rounded-[8px] bg-primary text-white hover:bg-primary/80 transition-colors flex items-center gap-2 disabled:opacity-70 cursor-pointer"
                  >
                    {createTeamMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : null}
                    Sukurti
                  </button>
                  <button
                    onClick={() => { setIsCreateTeamOpen(false); setNewTeamName(''); }}
                    disabled={createTeamMutation.isPending}
                    className="h-[40px] px-4 font-semibold text-[14px] rounded-[8px] border border-[#cdc3d4] text-[#4b4452] hover:bg-[#f6f5fa] transition-colors cursor-pointer"
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
                <p className="text-[#4b4452] text-[14px] font-medium">Kraunamos komandos...</p>
              </div>
            ) : !teams || teams.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-16 h-16 rounded-2xl bg-[#f6f5fa] flex items-center justify-center">
                  <UsersRound size={28} className="text-[#cdc3d4]" />
                </div>
                <p className="text-[#1d033a] font-bold text-[16px]">Komandų nėra</p>
                <p className="text-[#7c7484] text-[14px]">Sukurkite pirmą komandą paspausdami mygtuką viršuje</p>
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
                      className="bg-white rounded-[16px] border border-[#cdc3d4]/20 shadow-[0px_4px_20px_rgba(29,3,58,0.05)] p-5 flex flex-col gap-3"
                    >
                      {/* Card header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-[#490891] to-[#8052b2] flex items-center justify-center shadow-sm flex-shrink-0">
                            <UsersRound size={16} className="text-white" />
                          </div>
                          <div>
                            <p className="text-[15px] font-bold text-[#1d033a] leading-tight">{team.name}</p>
                            <p className="text-[12px] text-[#7c7484]">{members.length} montuotojas(-ai)</p>
                          </div>
                        </div>
                        <button
                          onClick={() => void handleDeleteTeam(team)}
                          className="text-[#cdc3d4] hover:text-red-500 transition-colors cursor-pointer flex-shrink-0 mt-0.5"
                          title="Ištrinti komandą"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      {/* Divider */}
                      <div className="h-px bg-[#cdc3d4]/20" />

                      {/* Members list */}
                      {members.length === 0 ? (
                        <p className="text-[13px] text-[#7c7484] italic">Nėra priskirtų montuotojų</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {members.slice(0, 5).map((m) => (
                            <div key={m.id} className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                                {getInitials(m.full_name)}
                              </div>
                              <span className="text-[13px] text-[#1d033a] font-medium truncate">
                                {m.full_name || m.email}
                              </span>
                            </div>
                          ))}
                          {members.length > 5 && (
                            <p className="text-[12px] text-[#7c7484] pl-8">
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
