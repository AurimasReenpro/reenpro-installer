import { useQuery } from '@tanstack/react-query';
import { Loader2, History, Activity, Pencil, CheckCircle2, Plus, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../../../lib/supabase';

const AUDIT_ITEM_STATUS_LT: Record<string, string> = {
  pending: 'Laukia', pass: 'Atlikta', fail: 'Neatlikta', n_a: 'Netaikoma',
};
const AUDIT_SITE_STATUS_LT: Record<string, string> = {
  pending: 'Laukia', in_progress: 'Vykdomas', paused: 'Sustabdytas', completed: 'Baigtas', archived: 'Archyvuotas',
};

function readField(j: unknown, key: string): string | undefined {
  if (j && typeof j === 'object' && !Array.isArray(j)) {
    const v = (j as Record<string, unknown>)[key];
    if (v == null) return undefined;
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  old_data: unknown;
  new_data: unknown;
  created_at: string;
  actor: { full_name: string | null } | null;
}

/** Build a readable Lithuanian description + an icon/tint for one audit entry. */
function describeAudit(log: AuditEntry): { icon: React.ElementType; title: string; detail?: string; tint: string } {
  const newStatus = readField(log.new_data, 'status');
  const question = readField(log.new_data, 'question_text');
  switch (log.action) {
    case 'status_change': {
      const lt = newStatus ? (AUDIT_SITE_STATUS_LT[newStatus] ?? newStatus) : '—';
      return { icon: Activity, title: `pakeitė statusą į „${lt}"`, tint: 'var(--info)' };
    }
    case 'site_updated':
      return { icon: Pencil, title: 'atnaujino objekto informaciją', tint: 'var(--primary-ink)' };
    case 'checklist_update': {
      const lt = newStatus ? (AUDIT_ITEM_STATUS_LT[newStatus] ?? newStatus) : '—';
      const tint = newStatus === 'pass' ? 'var(--success)' : newStatus === 'fail' ? 'var(--danger)' : 'var(--warning)';
      return { icon: CheckCircle2, title: `pažymėjo punktą kaip „${lt}"`, detail: question, tint };
    }
    case 'extra_work_added':
      return { icon: Plus, title: 'pridėjo papildomą darbą', detail: question, tint: 'var(--primary-ink)' };
    default:
      return { icon: Activity, title: log.action, detail: log.entity_type, tint: 'var(--text-subtle)' };
  }
}

export default function AuditLogTab({ siteId }: { siteId: string }) {
  const { data: logs, isLoading } = useQuery<AuditEntry[]>({
    queryKey: ['site_audit_logs', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_audit_logs')
        .select('id, action, entity_type, old_data, new_data, created_at, actor:user_profiles(full_name)')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!siteId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="bg-surface rounded-card border border-border shadow-sm py-12 flex flex-col items-center gap-3">
        <History className="w-9 h-9 text-subtle" />
        <p className="text-[14px] text-subtle">Veiksmų istorijos dar nėra.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-card border border-border shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border dark:border-white/5">
        <History size={18} className="text-primary" />
        <h3 className="font-semibold text-[15px] text-text">Veiksmų istorija</h3>
        <span className="ml-auto text-[12px] text-subtle">{logs.length}</span>
      </div>

      <ol className="px-3 py-1">
        {logs.map((log, i) => {
          const { icon: Icon, title, detail, tint } = describeAudit(log);
          return (
            <li key={log.id} className={`flex gap-3 px-2 py-3 ${i < logs.length - 1 ? 'border-b border-border dark:border-white/5' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center shrink-0" style={{ color: tint }}>
                <Icon size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] text-text leading-snug">
                  <span className="font-semibold">{log.actor?.full_name ?? 'Nežinomas'}</span>{' '}
                  {title}
                  {detail && <span className="text-muted"> — {detail}</span>}
                </p>
                <p className="flex items-center gap-1.5 text-[12px] text-subtle mt-0.5">
                  <Clock size={11} className="shrink-0" />
                  {format(new Date(log.created_at), 'yyyy-MM-dd HH:mm')}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
