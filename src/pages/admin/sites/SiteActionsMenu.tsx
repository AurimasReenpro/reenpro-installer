import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreVertical, Eye, Pencil, Users, Activity, Archive, Trash2 } from 'lucide-react';
import type { SiteListRow } from './siteListModel';

export default function SiteActionsMenu({
  site, onAssignTeam, onChangeStatus, onArchive, onDelete,
}: {
  site: SiteListRow;
  onAssignTeam: () => void;
  onChangeStatus: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const item = 'w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-[#27272a] transition-colors cursor-pointer text-left';

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
        title="Veiksmai"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute right-0 top-9 z-20 w-52 bg-surface dark:bg-[#18181b] rounded-xl shadow-lg border border-zinc-200 dark:border-white/10 py-1 overflow-hidden">
            <Link to={`/admin/sites/${site.id}`} onClick={close} className={item}>
              <Eye size={15} className="text-zinc-400" /> Žiūrėti
            </Link>
            <Link to={`/admin/sites/${site.id}`} onClick={close} className={item}>
              <Pencil size={15} className="text-zinc-400" /> Redaguoti
            </Link>
            <div className="my-1 border-t border-zinc-100 dark:border-white/5" />
            <button onClick={() => { close(); onAssignTeam(); }} className={item}>
              <Users size={15} className="text-zinc-400" /> Priskirti komandą
            </button>
            <button onClick={() => { close(); onChangeStatus(); }} className={item}>
              <Activity size={15} className="text-zinc-400" /> Keisti statusą
            </button>
            <div className="my-1 border-t border-zinc-100 dark:border-white/5" />
            <button onClick={() => { close(); onArchive(); }} className={item}>
              <Archive size={15} className="text-amber-500" /> Archyvuoti
            </button>
            <button onClick={() => { close(); onDelete(); }} className={`${item} text-red-600 dark:text-red-400`}>
              <Trash2 size={15} /> Ištrinti
            </button>
          </div>
        </>
      )}
    </div>
  );
}
