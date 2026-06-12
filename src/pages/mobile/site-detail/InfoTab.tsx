import type { ElementType, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Zap, Battery, Wrench, Home, Layers, Ruler, Calendar, CheckCircle2,
  User, Building2, Mail, Navigation, Phone, AlertTriangle, RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../../../lib/supabase';
import type { SiteDetailData } from '../../../types/site.types';

interface InfoTabProps {
  site: SiteDetailData;
}

/** Revisit category → human Lithuanian label for the alert banner. */
const REVISIT_LABELS: Record<string, string> = {
  Brokas: 'Brokas',
  Dokumentacija: 'Trūksta dokumentacijos',
  Planavimas: 'Planavimo klaida',
  Kliento_uzsakymas: 'Kliento papildomas užsakymas',
};

const fmtDate = (d: string | null | undefined) => (d ? format(new Date(d), 'yyyy-MM-dd') : null);

/** iOS list row: muted icon + label on the left, focal value on the right. */
function Row({ icon: Icon, label, children, last }: { icon: ElementType; label: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 ${last ? '' : 'border-b border-gray-50 dark:border-white/5'}`}>
      <span className="flex items-center gap-2.5 text-[14px] text-gray-500 dark:text-zinc-400 shrink-0">
        <Icon size={16} className="text-gray-400 dark:text-zinc-500 shrink-0" />
        {label}
      </span>
      <span className="text-[14px] font-semibold text-gray-900 dark:text-zinc-100 text-right min-w-0 truncate">{children}</span>
    </div>
  );
}

/** iOS grouped-list section label. */
function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-[12px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide px-1 mb-1.5">{children}</p>;
}

export default function InfoTab({ site }: InfoTabProps) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address)}`;
  const scheduled = fmtDate(site.scheduled_start);
  const completed = fmtDate(site.actual_end);

  const quickAction = 'flex-1 flex flex-col items-center gap-1.5 bg-[#fbf0ff] dark:bg-purple-500/10 text-primary rounded-xl py-3 active:bg-[#f3e2ff] transition-colors';

  // Latest revisit (FTFR) record — drives the "Pakartotinis vizitas" banner.
  const { data: revisit } = useQuery({
    queryKey: ['site_revisits', site.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_revisits')
        .select('category, notes, created_at')
        .eq('site_id', site.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!site.id,
  });

  // Only surface the banner while the project is being (re)worked, not once
  // it is completed again.
  const showRevisit = !!revisit && site.status !== 'completed';

  return (
    <div className="px-4 pb-[140px] pt-4 flex flex-col gap-5">

      {/* ── Pakartotinis vizitas (iOS system-notification style) ── */}
      {showRevisit && (
        <div className="bg-amber-50/80 backdrop-blur-sm border border-amber-100 rounded-2xl p-4 -mb-1 flex items-start gap-3 shadow-sm">
          <RotateCcw size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider font-bold text-amber-700">
              Pakartotinis vizitas
            </p>
            <p className="text-sm text-amber-900 font-medium leading-snug mt-0.5">
              {REVISIT_LABELS[revisit.category] ?? revisit.category}
              {revisit.notes ? ` — ${revisit.notes}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* ── Quick actions (iOS Contacts style) ── */}
      <div className="flex gap-2">
        {site.client_phone && (
          <a href={`tel:${site.client_phone}`} className={quickAction}>
            <Phone size={20} />
            <span className="text-xs font-medium">Skambinti</span>
          </a>
        )}
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={quickAction}>
          <Navigation size={20} />
          <span className="text-xs font-medium">Naviguoti</span>
        </a>
        {site.client_email && (
          <a href={`mailto:${site.client_email}`} className={quickAction}>
            <Mail size={20} />
            <span className="text-xs font-medium">El. paštas</span>
          </a>
        )}
      </div>

      {/* ── Kontaktai ── */}
      <div>
        <SectionLabel>Kontaktai</SectionLabel>
        <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
          <Row icon={Building2} label="Įmonė / Klientas">{site.client_name || '—'}</Row>
          <Row icon={User} label="Kontaktinis asmuo">{site.contact_person || '—'}</Row>
          <Row icon={Phone} label="Tel. numeris">
            {site.client_phone ? <a href={`tel:${site.client_phone}`} className="text-primary">{site.client_phone}</a> : '—'}
          </Row>
          <Row icon={Mail} label="El. paštas" last>
            {site.client_email ? <a href={`mailto:${site.client_email}`} className="text-primary">{site.client_email}</a> : '—'}
          </Row>
        </div>
      </div>

      {/* ── Techniniai duomenys ── */}
      <div>
        <SectionLabel>Techniniai duomenys</SectionLabel>
        <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
          <Row icon={Zap} label="Saulės galia">
            {site.kwp != null ? <>{site.kwp} <span className="text-gray-400 dark:text-zinc-500 font-medium">kWp</span></> : '—'}
          </Row>
          {site.kwh != null && (
            <Row icon={Battery} label="Baterija">
              {site.kwh} <span className="text-gray-400 dark:text-zinc-500 font-medium">kWh</span>
            </Row>
          )}
          <Row icon={Wrench} label="Sistemos tipas">{site.system_type || '—'}</Row>
          {scheduled && <Row icon={Calendar} label="Planuojama pradžia">{scheduled}</Row>}
          {completed && <Row icon={CheckCircle2} label="Užbaigta">{completed}</Row>}
          {site.roof_type && <Row icon={Home} label="Stogo tipas">{site.roof_type}</Row>}
          {site.roof_material && <Row icon={Layers} label="Stogo danga">{site.roof_material}</Row>}
          <Row icon={Ruler} label="Stogo nuolydis" last>{site.roof_angle || '—'}</Row>
        </div>
      </div>

      {/* ── Office notes ── */}
      {site.notes && (
        <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-amber-500 shrink-0" />
            <p className="font-semibold text-gray-900 dark:text-zinc-100 text-[14px]">Svarbios pastabos iš ofiso</p>
          </div>
          <p className="text-[14px] text-gray-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">{site.notes}</p>
        </div>
      )}
    </div>
  );
}
