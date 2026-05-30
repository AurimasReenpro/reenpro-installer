import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import { getSiteDetailQuery } from '../../types/site.types';
import type { SitePhoto } from '../../types/site.types';
import { supabase } from '../../lib/supabase';

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

export default function SiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  
  const [activeTab, setActiveTab] = useState('Apžvalga');
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

  const { data: teamMembers } = useQuery({
    queryKey: ['team_members', site?.team_id],
    queryFn: async () => {
      if (!site?.team_id) return [];
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('team_id', site.team_id);
      if (error) throw error;
      return data;
    },
    enabled: !!site?.team_id,
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

  const tabs = ['Apžvalga', 'Darbai', 'Objekto info', 'Brėžiniai', 'Foto'];

  const isActive = site?.time_entries?.some((e) => !e.end_time) ?? false;
  const displayStatus = site.status === 'completed'
    ? 'completed'
    : (isActive
      ? 'in_progress'
      : (site.time_entries && site.time_entries.length > 0
        ? 'paused'
        : site.status));

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
        systemType={site.system_type} 
        status={site.status} 
      />

      <TabsBar 
        tabs={tabs} 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
      />

      {activeTab === 'Apžvalga' && (
        <OverviewTab
          teamMembers={teamMembers || []}
          equipmentDetails={site.equipment_details}
        />
      )}

      {activeTab === 'Darbai' && (
        <WorkTab
          checklists={(site.site_checklists?.[0]?.site_checklist_items) ?? []}
          photos={site.photos || []}
          extraMaterials={site.site_extra_materials || []}
          siteId={id as string}
          siteChecklistId={site.site_checklists?.[0]?.id}
          profileId={profile?.id}
          compressingCheckId={compressingCheckId}
          uploadingCheckId={uploadingCheckId}
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
        onCheckIn={() => { void handleCheckIn(); }}
        onPause={() => { void handlePause(); }}
        onResume={() => { void handleResume(); }}
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
