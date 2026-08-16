import { useState } from 'react';
import {
  ArrowLeft, RotateCcw, Building2, MapPin, Sun, Battery,
  PlayCircle, PauseCircle, CheckCircle2, Archive, Clock, FileEdit,
} from 'lucide-react';
import { isSiteDraft } from '../../../lib/siteDraft';
import { siteTypeLabel } from '../../../lib/siteTypes';
import { formatLocation } from './helpers';
import ReopenSiteModal from './ReopenSiteModal';
import type { SiteWithTeam } from './types';

/**
 * Būsena yra vienintelis sodrus ženklelis antraštėje. Dizaino sistema (§14):
 * būsena niekada tik spalva — visada spalva + ikona + tekstas, todėl kiekviena
 * reikšmė turi savo ikoną, o ne vien foną.
 */
const STATUS_MAP: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  in_progress: { label: 'Vykdomas',    className: 'bg-success-bg text-success border-success/20', icon: PlayCircle },
  paused:      { label: 'Sustabdytas', className: 'bg-warning-bg text-warning border-warning/20', icon: PauseCircle },
  completed:   { label: 'Baigtas',     className: 'bg-surface-2 text-subtle border-border',       icon: CheckCircle2 },
  archived:    { label: 'Archyvuotas', className: 'bg-surface-2 text-subtle border-border',       icon: Archive },
  pending:     { label: 'Laukia',      className: 'bg-info-bg text-info border-info/20',          icon: Clock },
};

/**
 * Antriniai faktai apie objektą: komanda, sistemos tipas, B2B/B2C. Tai ne
 * būsenos, o klasifikatoriai, todėl jie neturi konkuruoti su būsena — vienodas
 * blankus stilius, be spalvinio kodo.
 */
function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[12px] font-medium text-muted dark:text-subtle">
      {children}
    </span>
  );
}

export default function SiteDetailsHeader({
  site,
  siteId,
  onBack,
}: {
  site: SiteWithTeam;
  siteId: string;
  onBack: () => void;
}) {
  const [showReopenModal, setShowReopenModal] = useState(false);
  const team = site.team;
  const status = STATUS_MAP[site.status ?? ''];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-subtle dark:text-subtle hover:text-primary transition-colors text-[14px] font-medium w-fit cursor-pointer"
        >
          <ArrowLeft size={16} />
          Grįžti prie objektų sąrašo
        </button>

        {site.status === 'completed' && (
          <button
            onClick={() => setShowReopenModal(true)}
            className="flex items-center gap-2 h-[38px] px-4 rounded-[10px] border border-border dark:border-white/10 text-muted dark:text-subtle font-semibold text-[13px] hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            <RotateCcw size={15} />
            Atidaryti iš naujo
          </button>
        )}
      </div>

      <div className="bg-surface rounded-card border border-border shadow-sm p-6">
        <div className="flex items-start justify-between gap-6 flex-col md:flex-row">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-card bg-surface-2 dark:bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 size={26} className="text-primary" />
            </div>
            <div className="min-w-0">
              {/* Objekto numeris yra tapatybė, ne būsena, todėl stovi prie
                  pavadinimo blankiu tekstu, o ne konkuruoja ženkleliu. */}
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h1 className="text-[22px] font-bold text-text leading-tight tracking-tight">
                  {site.client_name}
                </h1>
                <span className="text-[14px] font-medium text-subtle tabular-nums">
                  {site.code}
                </span>
              </div>
              <p className="text-[13px] text-subtle font-medium flex items-center gap-1.5 mt-1">
                <MapPin size={13} className="shrink-0" />
                <span className="truncate">{formatLocation(site.address)}</span>
              </p>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {/* Vienintelis sodrus ženklelis ekrane. */}
                {status && (
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${status.className}`}>
                    <status.icon size={14} className="shrink-0" />
                    {status.label}
                  </span>
                )}
                {isSiteDraft(site) && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning-bg px-2.5 py-1 text-[12px] font-semibold text-warning">
                    <FileEdit size={14} className="shrink-0" />
                    Juodraštis
                  </span>
                )}
                <MetaChip>{team?.name || 'Komanda nepriskirta'}</MetaChip>
                <MetaChip>{site.system_type}</MetaChip>
                <MetaChip>{siteTypeLabel(site.site_type)}</MetaChip>
              </div>
            </div>
          </div>

          {/* Capacity — kWp with total battery kWh stacked directly below it */}
          <div className="flex flex-col items-end shrink-0">
            <p className="flex items-center gap-1.5 text-[24px] font-bold text-text leading-none tracking-tight">
              <Sun className="w-4 h-4 text-subtle" />
              {site.kwp ?? '—'}<span className="text-[14px] text-subtle font-semibold ml-0.5">kWp</span>
            </p>
            {site.kwh != null && (
              <p className="flex items-center gap-1.5 text-[18px] font-bold text-muted dark:text-subtle leading-none tracking-tight mt-2">
                <Battery className="w-4 h-4 text-subtle" />
                {site.kwh}<span className="text-[12px] text-subtle font-semibold ml-0.5">kWh</span>
              </p>
            )}
          </div>
        </div>
      </div>

      <ReopenSiteModal siteId={siteId} open={showReopenModal} onClose={() => setShowReopenModal(false)} />
    </div>
  );
}
