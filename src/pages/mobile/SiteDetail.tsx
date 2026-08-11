import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import { getSiteDetailQuery } from '../../types/site.types';
import type { SitePhoto } from '../../types/site.types';
import { getSiteWorkPhases } from '../../api/workPhases';

// Custom Hooks
import { useSiteTimeTracking } from '../../hooks/useSiteTimeTracking';
import { useChecklistActions } from '../../hooks/useChecklistActions';
import { usePhotoUpload } from '../../hooks/usePhotoUpload';

// UI Components
import SiteDetailHeader from './site-detail/SiteDetailHeader';
import HeroSection from './site-detail/HeroSection';
import TabsBar from './site-detail/TabsBar';
import OverviewTab from './site-detail/OverviewTab';
import WorkTab from './site-detail/WorkTab';
import PhotosTab from './site-detail/PhotosTab';
import BlueprintsTab from './site-detail/BlueprintsTab';
import SiteDetailActionBar from './site-detail/SiteDetailActionBar';
import InfoTab from './site-detail/InfoTab';
import ConfirmModal from '../../components/ui/ConfirmModal';
import JobCompletionBlockedModal from '../../components/mobile/JobCompletionBlockedModal';
import { validateJobCompletion, type JobCompletionValidation } from '../../lib/checklistValidation';
import { isArchivedSiteStatus, isCompletedOrArchivedSiteStatus } from '../../lib/siteStatus';

export default function SiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  
  const [activeTab, setActiveTab] = useState('Objekto info');
  const [selectedPhoto, setSelectedPhoto] = useState<{ photo: SitePhoto; checkId: string } | null>(null);
  const [isConfirmCompleteOpen, setIsConfirmCompleteOpen] = useState(false);
  const [isDeletePhotoConfirmOpen, setIsDeletePhotoConfirmOpen] = useState(false);
  const [completionBlock, setCompletionBlock] = useState<JobCompletionValidation | null>(null);

  const { data: site, isLoading } = useQuery({
    queryKey: ['site', id],
    queryFn: async () => {
      const { data, error } = await getSiteDetailQuery(id as string);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: activeWorkPhases = [] } = useQuery({
    queryKey: ['site_work_phases', id, 'active'],
    queryFn: () => getSiteWorkPhases(id as string, { activeOnly: true }),
    enabled: !!id && site?.site_type === 'b2b',
  });

  const { data: allWorkPhases = [] } = useQuery({
    queryKey: ['site_work_phases', id, 'all'],
    queryFn: () => getSiteWorkPhases(id as string),
    enabled: !!id && site?.site_type === 'b2b',
  });

  const {
    isCheckingIn,
    isActionPending,
    handleCheckIn,
    handleResume,
    handlePause,
    handleComplete
  } = useSiteTimeTracking(id as string, site, profile?.id);

  const { handleSetStatus, handleSaveComment } = useChecklistActions(id as string);

  const {
    compressingCheckId,
    uploadingCheckId,
    handleUploadPhoto,
    handleDeletePhoto
  } = usePhotoUpload(id as string, site, profile?.id);

  const openMaps = () => {
    if (site?.address) {
      window.open(`https://maps.google.com/?q=${encodeURIComponent(site.address)}`, '_blank');
    }
  };

  // Gate "Užbaigti darbą": every item must be pass/n_a and every required item
  // must have a photo. On failure we show the blocking modal instead of the
  // standard confirm dialog; on success we proceed to confirmation.
  const handleAttemptComplete = () => {
    const items = site?.site_checklists?.[0]?.site_checklist_items ?? [];
    const result = validateJobCompletion(items, site?.photos ?? []);
    if (!result.valid) {
      setCompletionBlock(result);
      return;
    }
    setIsConfirmCompleteOpen(true);
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!site) {
    return <div className="p-4 text-center mt-10">Objektas nerastas.</div>;
  }

  const tabs = ['Objekto info', 'Įranga', 'Darbai', 'Brėžiniai', 'Foto'];

  const isActive = site?.time_entries?.some((e) => !e.end_time) ?? false;
  const currentWorkPhaseId = site?.time_entries?.find(
    (entry) => entry.installer_id === profile?.id && !entry.end_time,
  )?.work_phase_id ?? null;
  const displayStatus = isArchivedSiteStatus(site.status)
    ? 'archived'
    : site.status === 'completed'
      ? 'completed'
      : (isActive
        ? 'in_progress'
        : (site.time_entries && site.time_entries.length > 0
          ? 'paused'
          : site.status));

  const isReadOnly = isCompletedOrArchivedSiteStatus(site.status);

  return (
    <div className="fixed inset-0 z-[60] bg-app-bg overflow-y-auto pb-[100px]">
      <SiteDetailHeader 
        code={site.code} 
        onBack={() => { void navigate(-1); }} 
        onOpenMaps={openMaps} 
      />

      <HeroSection
        clientName={site.client_name}
        address={site.address}
        status={displayStatus}
        teamName={site.team?.name ?? null}
      />

      <TabsBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Completed → read-only notice */}
      {isReadOnly && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-card bg-warning-bg border border-warning/30 px-3 py-2.5">
          <Lock size={14} className="text-warning shrink-0" />
          <span className="text-[13px] font-medium text-warning">Projektas užbaigtas arba archyvuotas. Redagavimas negalimas.</span>
        </div>
      )}

      {activeTab === 'Įranga' && (
        <OverviewTab
          equipmentDetails={site.equipment_details}
          kwp={site.kwp}
          kwh={site.kwh}
        />
      )}

      {activeTab === 'Darbai' && (
        <WorkTab
          readOnly={isReadOnly}
          checklists={(site.site_checklists?.[0]?.site_checklist_items) ?? []}
          photos={site.photos || []}
          extraMaterials={site.site_extra_materials || []}
          siteId={id as string}
          siteChecklistId={site.site_checklists?.[0]?.id}
          profileId={profile?.id}
          compressingCheckId={compressingCheckId}
          uploadingCheckId={uploadingCheckId}
          siteType={site.site_type}
          workPhases={allWorkPhases}
          currentWorkPhaseId={currentWorkPhaseId}
          onSetStatus={(itemId, status) => { void handleSetStatus(itemId, status); }}
          onSaveComment={handleSaveComment}
          onUploadPhoto={(e, checkId) => { void handleUploadPhoto(e, checkId); }}
          onDeletePhoto={(photo, checkId) => {
            setSelectedPhoto({ photo, checkId });
            setIsDeletePhotoConfirmOpen(true);
          }}
        />
      )}

      {activeTab === 'Objekto info' && (
        <InfoTab site={site} />
      )}

      {activeTab === 'Brėžiniai' && (
        <BlueprintsTab siteId={id as string} categories={site.blueprint_categories} />
      )}

      {activeTab === 'Foto' && (
        <PhotosTab
          readOnly={isReadOnly}
          photos={site.photos || []}
          siteId={id as string}
          profileId={profile?.id}
          siteData={site}
        />
      )}

      <SiteDetailActionBar 
        status={displayStatus}
        isCheckingIn={isCheckingIn}
        isActionPending={isActionPending}
        siteType={site.site_type}
        workPhases={activeWorkPhases}
        onCheckIn={(workPhaseId) => { void handleCheckIn(workPhaseId); }}
        onPause={() => { void handlePause(); }}
        onResume={(workPhaseId) => { void handleResume(workPhaseId); }}
        onComplete={handleAttemptComplete}
        entries={site.time_entries || []}
        installerId={profile?.id}
      />

      <JobCompletionBlockedModal
        isOpen={completionBlock !== null}
        result={completionBlock}
        onClose={() => setCompletionBlock(null)}
      />

      <ConfirmModal
        isOpen={isConfirmCompleteOpen}
        title="Užbaigti darbą"
        message="Ar tikrai norite užbaigti šį objektą?"
        confirmText="Užbaigti"
        cancelText="Atšaukti"
        variant="success"
        onConfirm={() => {
          setIsConfirmCompleteOpen(false);
          void handleComplete();
        }}
        onCancel={() => setIsConfirmCompleteOpen(false)}
      />

      <ConfirmModal
        isOpen={isDeletePhotoConfirmOpen}
        title="Ištrinti nuotrauką"
        message="Ar tikrai norite ištrinti šią nuotrauką?"
        confirmText="Ištrinti"
        cancelText="Atšaukti"
        variant="danger"
        onConfirm={() => {
          setIsDeletePhotoConfirmOpen(false);
          if (selectedPhoto) {
            void handleDeletePhoto(selectedPhoto, () => setSelectedPhoto(null));
          }
        }}
        onCancel={() => setIsDeletePhotoConfirmOpen(false)}
      />
    </div>
  );
}
