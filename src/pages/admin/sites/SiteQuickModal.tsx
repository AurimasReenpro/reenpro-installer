import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, Loader2, Check, Users, Activity } from 'lucide-react';
import { assignSiteTeam, setSiteStatus } from '../../../api/sites';
import type { Team } from '../../../api/installers';
import { STATUS_OPTIONS, type SiteListRow } from './siteListModel';

export default function SiteQuickModal({
  site, mode, teams, onClose, onSaved,
}: {
  site: SiteListRow;
  mode: 'team' | 'status';
  teams: Team[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [teamId, setTeamId] = useState<string>(site.team_id ?? '');
  const [status, setStatus] = useState<string>(site.status ?? 'pending');

  const save = useMutation({
    mutationFn: () => (mode === 'team'
      ? assignSiteTeam(site.id, teamId || null)
      : setSiteStatus(site.id, status)),
    onSuccess: () => {
      toast.success(mode === 'team' ? 'Komanda atnaujinta.' : 'Statusas atnaujintas.');
      void queryClient.invalidateQueries({ queryKey: ['admin_sites_list'] });
      onSaved();
      onClose();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Nepavyko išsaugoti.'),
  });

  const selectCls = 'w-full h-[42px] px-3 bg-surface-2 border border-border dark:border-white/10 rounded-card text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget && !save.isPending) onClose(); }}>
      <div className="bg-surface rounded-[20px] shadow-2xl w-full max-w-sm border border-border dark:border-white/10 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-white/10">
          <div className="min-w-0">
            <h2 className="font-bold text-[16px] text-text flex items-center gap-2">
              {mode === 'team' ? <Users size={17} className="text-primary" /> : <Activity size={17} className="text-primary" />}
              {mode === 'team' ? 'Priskirti komandą' : 'Keisti statusą'}
            </h2>
            <p className="text-[12px] text-subtle mt-0.5 truncate">{site.code} · {site.client_name}</p>
          </div>
          <button onClick={onClose} disabled={save.isPending} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2 dark:hover:bg-[#27272a] transition-colors cursor-pointer disabled:opacity-50">
            <X size={18} className="text-subtle" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {mode === 'team' ? (
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={selectCls}>
              <option value="">— Nepriskirta —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : (
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} disabled={save.isPending} className="flex-1 h-[42px] rounded-card border border-border dark:border-white/10 text-muted font-medium text-[14px] hover:bg-surface-2 dark:hover:bg-[#27272a] transition-colors cursor-pointer disabled:opacity-50">
              Atšaukti
            </button>
            <button onClick={() => save.mutate()} disabled={save.isPending} className="flex-1 h-[42px] rounded-card bg-primary text-white font-medium text-[14px] hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
              {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Išsaugoti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
