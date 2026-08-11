import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, Cpu, DraftingCompass, FolderOpen, ListChecks, History, AlertTriangle } from 'lucide-react';
import { getSiteById } from '../../api/sites';
import { parseEquipmentDetails } from '../../types/equipment.types';
import { isSiteDraft } from '../../lib/siteDraft';
import ImageAnnotator from '../../components/shared/ImageAnnotatorLazy';
import ImageLightbox from '../../components/shared/ImageLightbox';
import { AdminEmptyState, AdminPanelSkeleton } from '../../components/admin/AdminStates';
import SiteDetailsHeader from './site-details/SiteDetailsHeader';
import InfoTab from './site-details/InfoTab';
import EquipmentTab from './site-details/EquipmentTab';
import BlueprintsTab from './site-details/BlueprintsTab';
import FilesTab from './site-details/FilesTab';
import ChecklistTab from './site-details/ChecklistTab';
import AuditLogTab from './site-details/AuditLogTab';
import TimeEntriesCard from './site-details/TimeEntriesCard';
import type { SiteWithTeam, TabId } from './site-details/types';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'info', label: 'Objekto info', icon: Info },
  { id: 'equip', label: 'Įranga', icon: Cpu },
  { id: 'blueprints', label: 'Brėžiniai', icon: DraftingCompass },
  { id: 'files', label: 'Failai', icon: FolderOpen },
  { id: 'check', label: 'Checklist', icon: ListChecks },
  { id: 'history', label: 'Istorija', icon: History },
];

const TAB_MOTION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.18 },
};

export default function SiteDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>('info');
  // Shared annotation/lightbox state, triggered by both the Blueprints and Files tabs.
  const [annotatingFile, setAnnotatingFile] = useState<{ name: string; url: string; page?: number } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxPdf, setLightboxPdf] = useState<{ url: string; page: number } | null>(null);

  // Single source of truth for the site, passed to children via props.
  const { data: site, isLoading: siteLoading } = useQuery({
    queryKey: ['admin_site', id],
    queryFn: () => getSiteById(id!) as unknown as Promise<SiteWithTeam>,
    enabled: !!id,
  });

  const currentEquipment = parseEquipmentDetails(site?.equipment_details);

  if (siteLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <AdminPanelSkeleton className="h-40" />
        <AdminPanelSkeleton className="h-12" />
        <AdminPanelSkeleton className="h-96" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <AdminEmptyState
          title="Įrašų nerasta."
          message="Objektas nerastas."
          className="rounded-2xl border border-border bg-surface"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full">

      {/* ── Draft warning ── */}
      {isSiteDraft(site) && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 px-4 py-3">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[13px] text-amber-800 dark:text-amber-300 leading-snug">
            Šis objektas yra <span className="font-bold">juodraštis</span>. Užpildykite pavadinimą ir adresą,
            kad jis taptų aktyvus ir galėtų būti priskirtas komandai.
          </p>
        </div>
      )}

      {/* ── Header ── */}
      <SiteDetailsHeader site={site} siteId={id!} onBack={() => { void navigate('/admin/sites'); }} />

      {/* ── Tabs ── */}
      <div className="relative flex gap-1 bg-surface-2 dark:bg-surface-2 rounded-[12px] p-1.5 overflow-x-auto border border-border/30 dark:border-white/10 flex-shrink-0 min-h-[48px]">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative z-10 px-4 py-2 rounded-[8px] text-[13px] font-semibold transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap"
              style={{ color: isActive ? 'var(--primary)' : 'var(--text-subtle)' }}
            >
              {isActive && (
                <motion.div
                  layoutId="sitedetail-tab"
                  className="absolute inset-0 bg-surface rounded-[8px] shadow-sm border border-border/20 dark:border-white/10"
                  style={{ zIndex: -1 }}
                  transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}
                />
              )}
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <AnimatePresence mode="wait">
        {activeTab === 'info' && (
          <motion.div key="info" {...TAB_MOTION}>
            <InfoTab site={site} siteId={id!} />
          </motion.div>
        )}

        {activeTab === 'equip' && (
          <motion.div key="equip" {...TAB_MOTION}>
            <EquipmentTab
              siteId={id!}
              currentEquipment={currentEquipment}
              onSaved={() => void queryClient.invalidateQueries({ queryKey: ['admin_site', id] })}
            />
          </motion.div>
        )}

        {activeTab === 'blueprints' && (
          <motion.div key="blueprints" {...TAB_MOTION}>
            <BlueprintsTab
              siteId={id!}
              blueprintCategories={site.blueprint_categories ?? []}
              stringingDetails={site.stringing_details}
              onAnnotate={setAnnotatingFile}
              onLightbox={setLightboxUrl}
              onPdfLightbox={setLightboxPdf}
            />
          </motion.div>
        )}

        {activeTab === 'files' && (
          <motion.div key="files" {...TAB_MOTION}>
            <FilesTab siteId={id!} onLightbox={setLightboxUrl} onAnnotate={setAnnotatingFile} />
          </motion.div>
        )}

        {activeTab === 'check' && (
          <motion.div key="check" {...TAB_MOTION}>
            <ChecklistTab siteId={id!} siteType={site.site_type} />
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div key="history" {...TAB_MOTION} className="space-y-5">
            <TimeEntriesCard siteId={id!} />
            <AuditLogTab siteId={id!} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Shared modals (Blueprints + Files trigger these) ── */}
      {annotatingFile && id && (
        <ImageAnnotator
          siteId={id}
          fileName={annotatingFile.name}
          imageUrl={annotatingFile.url}
          initialPage={annotatingFile.page ?? 1}
          isAdmin={true}
          onClose={() => setAnnotatingFile(null)}
        />
      )}

      {/* ── Image Lightbox (zoom/pan, no annotation tools) ── */}
      {lightboxUrl && (
        <ImageLightbox
          url={lightboxUrl}
          originalFileUrl={lightboxUrl}
          onClose={() => setLightboxUrl(null)}
        />
      )}

      {/* ── PDF Lightbox (full-screen zoom + pagination) ── */}
      {lightboxPdf && (
        <ImageLightbox
          pdfUrl={lightboxPdf.url}
          initialPage={lightboxPdf.page}
          originalFileUrl={lightboxPdf.url}
          onClose={() => setLightboxPdf(null)}
        />
      )}
    </div>
  );
}
