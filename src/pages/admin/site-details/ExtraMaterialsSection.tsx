import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../../../lib/supabase';

/**
 * Installer-logged extra materials (off-contract → must be billed separately).
 * Shares the `site_extra_materials_billing` query key with the Checklist tab so
 * React Query serves both from one cached fetch.
 */
export default function ExtraMaterialsSection({ siteId }: { siteId: string }) {
  const { data: extraMaterials, isLoading: materialsLoading } = useQuery({
    queryKey: ['site_extra_materials_billing', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_extra_materials')
        .select('*, creator:user_profiles(full_name), checklist_item:site_checklist_items(question_text)')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
  });

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-[15px] font-bold text-warning flex items-center gap-2">
          <AlertTriangle size={17} className="text-warning" />
          Papildomai sunaudotos medžiagos
        </h3>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-warning-bg text-warning border border-warning/40 whitespace-nowrap">
          <AlertTriangle size={11} /> Papildomos išlaidos
        </span>
      </div>

      {materialsLoading ? (
        <div className="flex items-center gap-2 text-subtle dark:text-subtle px-4 py-3">
          <Loader2 size={15} className="animate-spin" />
          <span className="text-[13px]">Kraunama…</span>
        </div>
      ) : !extraMaterials || extraMaterials.length === 0 ? (
        <p className="text-[13px] text-subtle dark:text-subtle italic px-4 py-3 bg-surface-2 dark:bg-surface-2 rounded-[10px] border border-dashed border-border/50 dark:border-white/10">
          Papildomų medžiagų neužregistruota.
        </p>
      ) : (
        <div className="rounded-[12px] border border-warning/40 bg-warning-bg overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_104px_148px_108px] gap-3 px-4 py-2.5 bg-warning/10 border-b border-warning/30">
            <span className="text-[10px] font-bold text-warning uppercase tracking-wider">Medžiaga</span>
            <span className="text-[10px] font-bold text-warning uppercase tracking-wider">Kiekis</span>
            <span className="text-[10px] font-bold text-warning uppercase tracking-wider">Užregistravo</span>
            <span className="text-[10px] font-bold text-warning uppercase tracking-wider">Data</span>
          </div>

          {extraMaterials.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-[1fr_104px_148px_108px] gap-3 items-start px-4 py-3 border-b border-warning/15 last:border-none hover:bg-warning/10 transition-colors"
            >
              {/* Name + linked extra-work context */}
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-text leading-snug">{m.name}</p>
                {m.checklist_item?.question_text && (
                  <p className="text-[12px] text-warning/80 mt-0.5 leading-snug">
                    Panaudota prie: {m.checklist_item.question_text}
                  </p>
                )}
              </div>

              {/* Quantity + unit */}
              <div className="pt-0.5 flex items-center gap-1.5">
                <span className="text-[15px] font-bold text-text">{m.quantity}</span>
                <span className="text-[11px] font-semibold text-warning bg-warning/10 border border-warning/30 px-1.5 py-0.5 rounded-md">{m.unit}</span>
              </div>

              {/* Registered by */}
              <div className="pt-0.5 text-[13px] text-text truncate">
                {m.creator?.full_name ?? '—'}
              </div>

              {/* Date */}
              <div className="pt-0.5 text-[13px] text-subtle dark:text-subtle whitespace-nowrap">
                {format(new Date(m.created_at), 'yyyy-MM-dd')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
