import { Fragment, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { addDays, format, isToday, startOfToday } from 'date-fns';
import { lt } from 'date-fns/locale/lt';
import { supabase } from '../../lib/supabase';
import { getTeams } from '../../api/installers';
import { useCreateBlankSite } from '../../hooks/useCreateSite';
import { isSiteDraft } from '../../lib/siteDraft';
import {
  MapPin, Zap, Battery, GripVertical, CalendarClock, Inbox, ArrowUpRight,
  ChevronLeft, ChevronRight, Plus, RotateCcw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScheduleSite {
  id: string;
  code: string | null;
  client_name: string | null;
  address: string | null;
  status: string | null;
  scheduled_start: string | null;
  kwp: number | null;
  kwh: number | null;
  team_id: string | null;
}

const DAY_COUNT = 7;
const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Status pill (label + colour) shown on every card.
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  completed:   { label: 'Baigtas',     cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' },
  in_progress: { label: 'Vykdomas',    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' },
  paused:      { label: 'Pristabdyta', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' },
  pending:     { label: 'Laukia',      cls: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400' },
};

// ── Draggable site card ───────────────────────────────────────────────────────
function SiteCard({
  site,
  compact = false,
  onOpen,
  onUnassign,
}: {
  site: ScheduleSite;
  compact?: boolean;
  onOpen?: () => void;
  onUnassign?: () => void;
}) {
  const hasBattery = site.kwh != null;
  const isCompleted = site.status === 'completed';
  const draft = isSiteDraft(site);
  const badge = site.status ? STATUS_BADGE[site.status] : undefined;
  // Show unassign only for assigned, non-completed jobs (completed stays locked).
  const canUnassign = site.team_id !== null && !isCompleted;
  return (
    <div
      className={`group relative rounded-xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#27272a] shadow-sm ${
        compact ? 'p-2.5' : 'p-3'
      } ${isCompleted ? 'opacity-60' : ''}`}
    >
      {(onOpen || (onUnassign && canUnassign)) && (
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          {onUnassign && canUnassign && (
            <button
              onClick={(e) => { e.stopPropagation(); onUnassign(); }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Atšaukti priskyrimą"
              className="bg-white/90 dark:bg-[#27272a]/90 backdrop-blur-sm p-1.5 rounded-lg shadow-sm border border-gray-100 dark:border-white/10 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <RotateCcw size={14} />
            </button>
          )}
          {onOpen && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpen(); }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Atidaryti objektą"
              className="bg-white/90 dark:bg-[#27272a]/90 backdrop-blur-sm p-1.5 rounded-lg shadow-sm border border-gray-100 dark:border-white/10 text-gray-500 hover:text-purple-600 dark:hover:text-white transition-colors cursor-pointer"
            >
              <ArrowUpRight size={14} />
            </button>
          )}
        </div>
      )}
      <div className="flex items-start gap-2">
        <GripVertical size={15} className="text-gray-300 dark:text-gray-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap pr-6">
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              #{site.code ?? '—'}
            </span>
            {draft ? (
              <span className="bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Juodraštis
              </span>
            ) : badge && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${badge.cls}`}>
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-[13px] font-bold text-gray-900 dark:text-gray-100 truncate leading-tight mt-0.5">
            {site.client_name || 'Nežinomas klientas'}
          </p>
          {!compact && site.address && (
            <p className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
              <MapPin size={11} className="shrink-0" />
              <span className="truncate">{site.address}</span>
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
              <Zap size={11} className="text-amber-500" /> {site.kwp ?? '—'} kWp
            </span>
            {hasBattery && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                <Battery size={11} className="text-emerald-500" /> {site.kwh} kWh
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DraggableSite({
  site,
  compact,
  onOpen,
  onUnassign,
}: {
  site: ScheduleSite;
  compact?: boolean;
  onOpen?: () => void;
  onUnassign?: () => void;
}) {
  // Completed jobs and incomplete drafts cannot be dragged onto the calendar.
  const locked = site.status === 'completed' || isSiteDraft(site);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: site.id,
    disabled: locked,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      className={`touch-none ${locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
      {...(locked ? {} : { ...listeners, ...attributes })}
    >
      <SiteCard site={site} compact={compact} onOpen={onOpen} onUnassign={onUnassign} />
    </div>
  );
}

// ── Droppable matrix cell ─────────────────────────────────────────────────────
function DroppableCell({
  teamId,
  dKey,
  sites,
  highlight,
  onOpenSite,
  onQuickAdd,
  onUnassignSite,
}: {
  teamId: string;
  dKey: string;
  sites: ScheduleSite[];
  highlight: boolean;
  onOpenSite: (id: string) => void;
  onQuickAdd: () => void;
  onUnassignSite: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-team_${teamId}-date_${dKey}` });
  const totalKwp = sites.reduce((sum, s) => sum + (s.kwp ?? 0), 0);
  const isEmpty = sites.length === 0;
  return (
    <div
      ref={setNodeRef}
      className={`group relative flex flex-col gap-2 p-2 min-h-[120px] h-full border-b border-r border-gray-50 dark:border-white/5 transition-colors ${
        isOver
          ? 'bg-purple-100/60 dark:bg-purple-500/15 ring-1 ring-inset ring-purple-400'
          : highlight
          ? 'bg-purple-50/30 dark:bg-purple-900/10'
          : ''
      }`}
    >
      {sites.map((s) => (
        <DraggableSite
          key={s.id}
          site={s}
          compact
          onOpen={() => onOpenSite(s.id)}
          onUnassign={() => onUnassignSite(s.id)}
        />
      ))}

      {/* Daily capacity indicator */}
      {totalKwp > 0 && (
        <span className="mt-auto self-end text-[10px] font-semibold text-gray-400 dark:text-gray-500">
          {totalKwp.toFixed(1)} kWp
        </span>
      )}

      {/* Quick-add (empty cells only) */}
      {isEmpty && (
        <button
          onClick={() => onQuickAdd()}
          onPointerDown={(e) => e.stopPropagation()}
          title="Pridėti objektą"
          className="absolute inset-0 m-auto w-8 h-8 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        >
          <Plus size={16} />
        </button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Schedule() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [baseDate, setBaseDate] = useState<Date>(startOfToday);
  const days = useMemo(
    () => Array.from({ length: DAY_COUNT }, (_, i) => addDays(baseDate, i)),
    [baseDate],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const { createBlankSite } = useCreateBlankSite();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const openSite = (id: string) => { void navigate(`/admin/sites/${id}`); };
  // Quick-add creates an UNASSIGNED draft and jumps to its detail page. Drafts
  // can't be placed on the calendar until they're filled in (see the drag guard).
  const openQuickAdd = () => { void createBlankSite(); };

  // One-click unassign → clears team + planned day, returns the card to the backlog.
  // Reliable replacement for the abandoned drag-to-backlog interaction.
  const handleUnassign = async (siteId: string) => {
    const { error } = await supabase
      .from('sites')
      .update({ team_id: null, scheduled_start: null, status: 'pending' })
      .eq('id', siteId);
    if (error) {
      console.error('Unassign failed:', error);
      toast.error('Nepavyko atšaukti priskyrimo');
      return;
    }
    void qc.invalidateQueries({ queryKey: ['schedule_sites'] });
    void qc.invalidateQueries({ queryKey: ['admin_all_sites'] });
    void qc.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
    toast.success('Objektas grąžintas į laukiamąjį');
  };

  // Fetch 1: teams (Y-axis)
  const { data: teams } = useQuery({ queryKey: ['admin_teams'], queryFn: getTeams });

  // Fetch 2: pending + active sites
  const { data: sites } = useQuery({
    queryKey: ['schedule_sites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('id, code, client_name, address, status, scheduled_start, kwp, kwh, team_id')
        .in('status', ['pending', 'in_progress', 'paused', 'completed'])
        .order('scheduled_start', { ascending: true });
      if (error) throw error;
      return (data ?? []) satisfies ScheduleSite[];
    },
  });

  const allSites = useMemo<ScheduleSite[]>(() => sites ?? [], [sites]);
  const allTeams = teams ?? [];

  // Backlog = genuinely unassigned (no team AND no planned day). Driven purely by
  // server data — no local overlay. The grid re-renders from the refetch after a drop.
  const backlogSites = useMemo(
    () => allSites.filter((s) => !s.team_id || !s.scheduled_start),
    [allSites],
  );

  const cellSites = (teamId: string, dKey: string) =>
    allSites.filter(
      (s) =>
        s.team_id === teamId &&
        !!s.scheduled_start &&
        format(new Date(s.scheduled_start), 'yyyy-MM-dd') === dKey,
    );

  const activeSite = activeId ? allSites.find((s) => s.id === activeId) ?? null : null;

  // Bare-metal drop: a single guaranteed DB write, then a raw refetch. No overlays.
  // Columns are the real `team_id` / `scheduled_start` (the brief's assigned_team_id /
  // planned_start do not exist on `sites`).
  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    console.log('Drag ended over:', over?.id);
    if (!over) return;
    const siteId = String(active.id);
    const overId = String(over.id);
    const currentStatus = allSites.find((s) => s.id === siteId)?.status ?? null;

    const refetch = () => {
      void qc.invalidateQueries({ queryKey: ['schedule_sites'] });
      void qc.invalidateQueries({ queryKey: ['admin_all_sites'] });
      void qc.invalidateQueries({ queryKey: ['admin_dashboard_stats'] });
    };

    // ── Drop onto the backlog → unassign ──
    if (overId === 'backlog-zone') {
      const { error } = await supabase
        .from('sites')
        .update({ team_id: null, scheduled_start: null, status: 'pending' })
        .eq('id', siteId);
      if (error) {
        console.error('DB Update Failed:', error);
        toast.error('Klaida atšaukiant priskyrimą');
        return;
      }
      refetch();
      return;
    }

    // ── Drop onto a team/day cell → assign ──
    const match = overId.match(/^cell-team_(.+)-date_(.+)$/);
    if (!match) return;
    const teamId = match[1];
    const date = match[2];
    if (!teamId || !date) return;

    // Backstop: drafts must be completed before they can be scheduled.
    const dragged = allSites.find((s) => s.id === siteId);
    if (dragged && isSiteDraft(dragged)) {
      toast.error('Užpildykite objekto duomenis prieš priskiriant');
      return;
    }

    const { error } = await supabase
      .from('sites')
      .update({
        team_id: teamId,
        // Anchor 08:00 to LOCAL (Vilnius) time so the card never jumps a column.
        scheduled_start: format(new Date(`${date}T08:00:00`), "yyyy-MM-dd'T'HH:mm:ssXXX"),
        status: currentStatus === 'completed' ? 'completed' : 'pending',
      })
      .eq('id', siteId);
    if (error) {
      console.error('DB Update Failed:', error);
      toast.error('Klaida atnaujinant tvarkaraštį');
      return;
    }
    refetch();
  };

  const { setNodeRef: backlogRef, isOver: backlogOver } = useDroppable({ id: 'backlog-zone' });

  const gridCols = `180px repeat(${days.length}, minmax(150px, 1fr))`;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0 gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Tvarkaraštis</h2>
          <p className="text-[14px] text-gray-500 dark:text-gray-400">
            Tempkite objektus iš laukiančiųjų į komandos dieną
          </p>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-1 bg-white dark:bg-[#18181b] border border-gray-100 dark:border-white/10 rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setBaseDate(startOfToday())}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 rounded-md transition-colors"
          >
            Šiandien
          </button>
          <button
            onClick={() => setBaseDate((d) => addDays(d, -DAY_COUNT))}
            title="Ankstesnė savaitė"
            className="px-3 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 rounded-md transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setBaseDate((d) => addDays(d, DAY_COUNT))}
            title="Kita savaitė"
            className="px-3 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 rounded-md transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={(e) => { void onDragEnd(e); }}>
        <div className="flex gap-5 flex-1 min-h-0">
          {/* ── Main timeline grid ── */}
          <div className="flex-1 min-w-0 bg-white dark:bg-[#18181b] border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none overflow-auto">
            <div className="min-w-max" style={{ display: 'grid', gridTemplateColumns: gridCols }}>
              {/* Header row */}
              <div className="sticky top-0 left-0 z-30 bg-gray-50/80 dark:bg-[#27272a] backdrop-blur-sm border-b border-r border-gray-100 dark:border-white/10 px-4 py-3 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Komandos
              </div>
              {days.map((d) => {
                const today = isToday(d);
                return (
                  <div
                    key={dayKey(d)}
                    className={`sticky top-0 z-20 backdrop-blur-sm border-b border-r border-gray-100 dark:border-white/10 px-3 py-2.5 text-center ${
                      today
                        ? 'bg-purple-50/80 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300'
                        : 'bg-gray-50/80 dark:bg-[#27272a] text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    <p className="text-[11px] font-bold uppercase tracking-wider">
                      {cap(format(d, 'EEEE', { locale: lt }))}
                    </p>
                    <p className={`text-[15px] font-extrabold ${today ? '' : 'text-gray-900 dark:text-gray-100'}`}>
                      {format(d, 'MM-dd')}
                    </p>
                  </div>
                );
              })}

              {/* Team rows */}
              {allTeams.map((team) => (
                <Fragment key={team.id}>
                  <div className="sticky left-0 z-10 bg-white dark:bg-[#18181b] border-b border-r border-gray-100 dark:border-white/10 px-4 py-3 flex items-center">
                    <span className="text-[13px] font-bold text-gray-900 dark:text-gray-100 truncate">{team.name}</span>
                  </div>
                  {days.map((d) => (
                    <DroppableCell
                      key={`${team.id}:${dayKey(d)}`}
                      teamId={team.id}
                      dKey={dayKey(d)}
                      sites={cellSites(team.id, dayKey(d))}
                      highlight={isToday(d)}
                      onOpenSite={openSite}
                      onQuickAdd={openQuickAdd}
                      onUnassignSite={(id) => { void handleUnassign(id); }}
                    />
                  ))}
                </Fragment>
              ))}

              {allTeams.length === 0 && (
                <div className="col-span-full px-4 py-12 text-center text-[14px] text-gray-400 dark:text-gray-500">
                  Komandų nėra. Sukurkite komandą skiltyje „Montuotojai".
                </div>
              )}
            </div>
          </div>

          {/* ── Unassigned backlog (whole panel is the drop target) ── */}
          <div
            ref={backlogRef}
            className={`w-[320px] h-full shrink-0 flex flex-col border rounded-2xl shadow-sm dark:shadow-none overflow-hidden transition-colors ${
              backlogOver
                ? 'bg-purple-50/20 dark:bg-purple-900/10 border-purple-300 dark:border-purple-500/40 ring-2 ring-inset ring-purple-400'
                : 'bg-white dark:bg-[#18181b] border-gray-100 dark:border-white/10'
            }`}
          >
            <div className="px-4 py-3.5 border-b border-gray-100 dark:border-white/10 flex items-center gap-2 shrink-0">
              <CalendarClock size={16} className="text-purple-600 dark:text-purple-300" />
              <h3 className="text-[14px] font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Laukia priskyrimo</h3>
              <span className="ml-auto text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-[#27272a] rounded-full px-2 py-0.5">
                {backlogSites.length}
              </span>
            </div>
            <div className={`flex-1 overflow-y-auto p-3 space-y-2.5 transition-colors ${backlogOver ? 'bg-purple-50/50 dark:bg-purple-500/10' : ''}`}>
              {backlogSites.map((s) => (
                <DraggableSite key={s.id} site={s} onOpen={() => openSite(s.id)} />
              ))}
              {backlogSites.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
                  <Inbox size={28} className="text-gray-300 dark:text-gray-600" />
                  <p className="text-[13px] text-gray-400 dark:text-gray-500">
                    {backlogOver ? 'Atleiskite, kad grąžintumėte į laukiančiuosius' : 'Visi objektai priskirti'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Drag preview — kept above grid + backlog layers so drops never get trapped. */}
        <DragOverlay dropAnimation={null} zIndex={100}>
          {activeSite ? (
            <div className="relative z-[100] w-[280px] rotate-2 cursor-grabbing">
              <SiteCard site={activeSite} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
