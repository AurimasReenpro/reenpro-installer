import { useState } from 'react';
import { ArrowLeft, RotateCcw, Building2, MapPin, Sun, Battery } from 'lucide-react';
import { isSiteDraft } from '../../../lib/siteDraft';
import { siteTypeLabel } from '../../../lib/siteTypes';
import { formatLocation } from './helpers';
import ReopenSiteModal from './ReopenSiteModal';
import type { SiteWithTeam } from './types';

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  in_progress: { label: 'Vykdomas', className: 'bg-[#ECFDF5] text-[#10B981]' },
  paused:      { label: 'Sustabdytas', className: 'bg-[#FFFBEB] text-[#F59E0B]' },
  completed:   { label: 'Baigtas', className: 'bg-[#F3F4F6] text-[#6B7280]' },
  archived:    { label: 'Archyvuotas', className: 'bg-surface-2 text-subtle dark:bg-white/5' },
  pending:     { label: 'Laukia', className: 'bg-[#F0F9FF] text-[#0284C7]' },
};

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
              <h1 className="text-[22px] font-bold text-text leading-tight tracking-tight">
                {site.client_name}
              </h1>
              <p className="text-[13px] text-subtle font-medium flex items-center gap-1.5 mt-1">
                <MapPin size={13} className="shrink-0" />
                <span className="truncate">{formatLocation(site.address)}</span>
              </p>

              {/* Soft iOS-style badges */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="bg-surface-2 text-muted dark:text-subtle rounded-full px-3 py-1 text-xs font-medium">
                  {site.code}
                </span>
                {isSiteDraft(site) && (
                  <span className="bg-warning-bg text-warning text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider self-center">
                    Juodraštis
                  </span>
                )}
                {status && (
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.className}`}>
                    {status.label}
                  </span>
                )}
                <span className="bg-success-bg text-success rounded-full px-3 py-1 text-xs font-medium">
                  {team?.name || 'Nepriskirta'}
                </span>
                <span className="bg-primary-fixed text-primary rounded-full px-3 py-1 text-xs font-medium">
                  {site.system_type}
                </span>
                <span className="bg-surface-2 text-muted dark:text-subtle rounded-full px-3 py-1 text-xs font-medium">
                  {siteTypeLabel(site.site_type)}
                </span>
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
