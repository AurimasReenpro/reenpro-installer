import { useState } from 'react';
import { ArrowLeft, RotateCcw, Building2, MapPin, Sun, Battery } from 'lucide-react';
import { isSiteDraft } from '../../../lib/siteDraft';
import { formatLocation } from './helpers';
import ReopenSiteModal from './ReopenSiteModal';
import type { SiteWithTeam } from './types';

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  in_progress: { label: 'Vykdomas', className: 'bg-[#ECFDF5] text-[#10B981]' },
  paused:      { label: 'Sustabdytas', className: 'bg-[#FFFBEB] text-[#F59E0B]' },
  completed:   { label: 'Baigtas', className: 'bg-[#F3F4F6] text-[#6B7280]' },
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
          className="flex items-center gap-2 text-[#7c7484] dark:text-gray-400 hover:text-primary transition-colors text-[14px] font-medium w-fit cursor-pointer"
        >
          <ArrowLeft size={16} />
          Grįžti prie objektų sąrašo
        </button>

        {site.status === 'completed' && (
          <button
            onClick={() => setShowReopenModal(true)}
            className="flex items-center gap-2 h-[38px] px-4 rounded-[10px] border border-[#cdc3d4] dark:border-white/10 text-[#4b4452] dark:text-gray-300 font-semibold text-[13px] hover:bg-[#f6f5fa] transition-colors cursor-pointer disabled:opacity-60"
          >
            <RotateCcw size={15} />
            Atidaryti iš naujo
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm p-6">
        <div className="flex items-start justify-between gap-6 flex-col md:flex-row">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-[#fbf0ff] dark:bg-purple-500/10 flex items-center justify-center flex-shrink-0">
              <Building2 size={26} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold text-gray-900 dark:text-gray-100 leading-tight tracking-tight">
                {site.client_name}
              </h1>
              <p className="text-[13px] text-gray-400 font-medium flex items-center gap-1.5 mt-1">
                <MapPin size={13} className="shrink-0" />
                <span className="truncate">{formatLocation(site.address)}</span>
              </p>

              {/* Soft iOS-style badges */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="bg-gray-100 dark:bg-[#27272a] text-gray-600 dark:text-gray-300 rounded-full px-3 py-1 text-xs font-medium">
                  {site.code}
                </span>
                {isSiteDraft(site) && (
                  <span className="bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider self-center">
                    Juodraštis
                  </span>
                )}
                {status && (
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.className}`}>
                    {status.label}
                  </span>
                )}
                <span className="bg-emerald-50 text-emerald-600 rounded-full px-3 py-1 text-xs font-medium">
                  {team?.name || 'Nepriskirta'}
                </span>
                <span className="bg-purple-50 text-purple-600 rounded-full px-3 py-1 text-xs font-medium">
                  {site.system_type}
                </span>
              </div>
            </div>
          </div>

          {/* Capacity — kWp with total battery kWh stacked directly below it */}
          <div className="flex flex-col items-end shrink-0">
            <p className="flex items-center gap-1.5 text-[24px] font-bold text-gray-900 dark:text-gray-100 leading-none tracking-tight">
              <Sun className="w-4 h-4 text-gray-400" />
              {site.kwp ?? '—'}<span className="text-[14px] text-gray-400 font-semibold ml-0.5">kWp</span>
            </p>
            {site.kwh != null && (
              <p className="flex items-center gap-1.5 text-[18px] font-bold text-gray-700 dark:text-gray-300 leading-none tracking-tight mt-2">
                <Battery className="w-4 h-4 text-gray-400" />
                {site.kwh}<span className="text-[12px] text-gray-400 font-semibold ml-0.5">kWh</span>
              </p>
            )}
          </div>
        </div>
      </div>

      <ReopenSiteModal siteId={siteId} open={showReopenModal} onClose={() => setShowReopenModal(false)} />
    </div>
  );
}
