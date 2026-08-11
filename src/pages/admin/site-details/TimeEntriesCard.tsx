import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Clock, Loader2, AlertTriangle, Pencil, Square, CheckCircle2, X } from 'lucide-react';
import {
  getSiteTimeEntries, adminCloseTimeEntry, adminCorrectTimeEntry, markTimeEntryReviewed,
  type AdminTimeEntry,
} from '../../../api/timeTracking';
import { isLikelyForgottenTimeEntry, getTimeEntryReviewReason } from '../../../lib/timeEntryReview';

/** Convert an ISO timestamp to the value a datetime-local input expects. */
const toLocalInput = (iso: string | null) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : '');
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

type ModalMode = { kind: 'close'; entry: AdminTimeEntry } | { kind: 'correct'; entry: AdminTimeEntry };

/** Admin per-entry time list with close/correct/review actions (Istorija tab). */
export default function TimeEntriesCard({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<ModalMode | null>(null);
  // Captured at mount; badge thresholds are hour-scale, live ticking is unnecessary.
  const [nowMs] = useState(() => Date.now());

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['site_time_entries', siteId],
    queryFn: () => getSiteTimeEntries(siteId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['site_time_entries', siteId] });
    void queryClient.invalidateQueries({ queryKey: ['site_audit_logs', siteId] });
    void queryClient.invalidateQueries({ queryKey: ['site_phase_time_summary', siteId] });
  };

  const review = useMutation({
    mutationFn: (entry: AdminTimeEntry) =>
      markTimeEntryReviewed(entry.id, entry.review_reason ?? 'Peržiūrėta administratoriaus.'),
    onSuccess: () => { toast.success('Pažymėta peržiūrėta.'); invalidate(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Nepavyko pažymėti.'),
  });

  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-6 flex justify-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }
  if (entries.length === 0) return null;

  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sm dark:shadow-none overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <Clock size={18} className="text-primary" />
        <h3 className="font-semibold text-[15px] text-text">Laiko įrašai</h3>
        <span className="ml-auto text-[12px] text-subtle">{entries.length}</span>
      </div>

      <div className="divide-y divide-border/60">
        {entries.map((e) => {
          const open = e.end_time == null;
          const forgotten = open && isLikelyForgottenTimeEntry(e, nowMs);
          const staleReason = getTimeEntryReviewReason(e, nowMs);
          return (
            <div key={e.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-text truncate">
                  {e.installer?.full_name ?? 'Nežinomas'}
                  {e.corrected_at && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-100 dark:bg-white/10 px-1.5 py-0.5 rounded" title={e.correction_reason ?? ''}>
                      Koreguota
                    </span>
                  )}
                </p>
                <p className="text-[12px] text-muted tabular-nums">
                  {format(new Date(e.start_time), 'yyyy-MM-dd HH:mm')}
                  {' → '}
                  {e.end_time ? format(new Date(e.end_time), 'yyyy-MM-dd HH:mm') : 'atviras'}
                  {e.duration_minutes != null && ` · ${Math.round(e.duration_minutes / 6) / 10} val.`}
                </p>
                {(e.review_reason ?? staleReason) && (e.needs_review || open) && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">{e.review_reason ?? staleReason}</p>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {e.needs_review && (
                  <Badge tone="amber"><AlertTriangle size={10} /> Reikia peržiūros</Badge>
                )}
                {forgotten && <Badge tone="red">Pamirštas laikas</Badge>}
                {open && !forgotten && <Badge tone="emerald">Vyksta</Badge>}
              </div>

              <div className="flex items-center gap-1">
                {open && (
                  <ActionBtn title="Uždaryti laiką" onClick={() => setModal({ kind: 'close', entry: e })}>
                    <Square size={13} /> Uždaryti laiką
                  </ActionBtn>
                )}
                <ActionBtn title="Koreguoti laiką" onClick={() => setModal({ kind: 'correct', entry: e })}>
                  <Pencil size={13} /> Koreguoti laiką
                </ActionBtn>
                {e.needs_review && (
                  <ActionBtn title="Pažymėti peržiūrėta" onClick={() => review.mutate(e)}>
                    <CheckCircle2 size={13} /> Pažymėti peržiūrėta
                  </ActionBtn>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <TimeCorrectionModal
          mode={modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); invalidate(); }}
        />
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: 'amber' | 'red' | 'emerald'; children: React.ReactNode }) {
  const cls = {
    amber: 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
    red: 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/20',
    emerald: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20',
  }[tone];
  return <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${cls}`}>{children}</span>;
}

function ActionBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-muted transition-colors hover:bg-surface-2 cursor-pointer">
      {children}
    </button>
  );
}

/** Close (end only) or correct (start + end) one entry, with a required reason. */
function TimeCorrectionModal({ mode, onClose, onSaved }: { mode: ModalMode; onClose: () => void; onSaved: () => void }) {
  const e = mode.entry;
  const [startedAt, setStartedAt] = useState(toLocalInput(e.start_time));
  const [endedAt, setEndedAt] = useState(toLocalInput(e.end_time) || toLocalInput(new Date().toISOString()));
  const [reason, setReason] = useState('');

  const startIso = fromLocalInput(startedAt);
  const endIso = fromLocalInput(endedAt);
  const effectiveStartIso = mode.kind === 'close' ? e.start_time : startIso;
  const orderValid = endIso != null && effectiveStartIso != null
    && Date.parse(endIso) > Date.parse(effectiveStartIso);
  const reasonValid = reason.trim().length >= 5;
  const canSubmit = orderValid && reasonValid;

  const save = useMutation({
    mutationFn: async () => {
      if (endIso == null || effectiveStartIso == null || !orderValid) {
        throw new Error('Pabaiga turi būti po pradžios.');
      }
      if (mode.kind === 'close') {
        await adminCloseTimeEntry(e.id, endIso, reason.trim());
      } else {
        await adminCorrectTimeEntry({ entryId: e.id, startedAt: effectiveStartIso, endedAt: endIso, reason: reason.trim() });
      }
    },
    onSuccess: () => { toast.success(mode.kind === 'close' ? 'Laikas uždarytas.' : 'Laikas pakoreguotas.'); onSaved(); },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '';
      toast.error(msg.includes('po pradžios') ? 'Pabaiga turi būti po pradžios.' : msg || 'Nepavyko koreguoti laiko.');
    },
  });

  const inputCls = 'w-full h-[40px] px-3 bg-surface-2 border border-border rounded-xl text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(ev) => { if (ev.target === ev.currentTarget && !save.isPending) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[17px] font-extrabold text-text">
            {mode.kind === 'close' ? 'Uždaryti laiką' : 'Koreguoti laiką'}
          </h3>
          <button onClick={onClose} disabled={save.isPending} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50">
            <X size={17} className="text-subtle" />
          </button>
        </div>
        <p className="text-[12px] text-subtle mb-4">{e.installer?.full_name ?? 'Nežinomas'} · pradžia {format(new Date(e.start_time), 'yyyy-MM-dd HH:mm')}</p>

        <div className="space-y-3">
          {mode.kind === 'correct' && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-subtle">Pradžia</span>
              <input type="datetime-local" value={startedAt} onChange={(ev) => setStartedAt(ev.target.value)} className={inputCls} />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-subtle">Pabaiga</span>
            <input type="datetime-local" value={endedAt} onChange={(ev) => setEndedAt(ev.target.value)} className={inputCls} />
            {!orderValid && endedAt && <p className="text-[11px] text-red-500 mt-1">Pabaiga turi būti po pradžios.</p>}
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-subtle">Korekcijos priežastis</span>
            <textarea value={reason} onChange={(ev) => setReason(ev.target.value)} rows={2}
              placeholder="Pvz.: montuotojas pamiršo sustabdyti laikmatį."
              className="w-full p-3 bg-surface-2 border border-border rounded-xl text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </label>
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={onClose} disabled={save.isPending}
            className="h-11 flex-1 rounded-xl border border-border text-[14px] font-semibold text-muted transition-colors hover:bg-surface-2 disabled:opacity-60 cursor-pointer">
            Atšaukti
          </button>
          <button onClick={() => save.mutate()} disabled={save.isPending || !canSubmit}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer">
            {save.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
            {mode.kind === 'close' ? 'Uždaryti laiką' : 'Koreguoti laiką'}
          </button>
        </div>
      </div>
    </div>
  );
}
