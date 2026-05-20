import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import { getSiteDetailQuery } from '../../types/site.types';
import type { SitePhoto } from '../../types/site.types';

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
import SiteDetailActionBar from './site-detail/SiteDetailActionBar';
import PhotoViewerModal from './site-detail/PhotoViewerModal';
import ConfirmModal from '../../components/ui/ConfirmModal';

export default function SiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  
  const [activeTab, setActiveTab] = useState('Apžvalga');
  const [selectedPhoto, setSelectedPhoto] = useState<{ photo: SitePhoto; checkId: string } | null>(null);
  const [isConfirmCompleteOpen, setIsConfirmCompleteOpen] = useState(false);
  const [isDeletePhotoConfirmOpen, setIsDeletePhotoConfirmOpen] = useState(false);

  const { data: site, isLoading } = useQuery({
    queryKey: ['site', id],
    queryFn: async () => {
      const { data, error } = await getSiteDetailQuery(id as string);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const {
    isCheckingIn,
    isActionPending,
    handleCheckIn,
    handleResume,
    handlePause,
    handleComplete
  } = useSiteTimeTracking(id as string, site, profile?.id);

  const { handleToggleChecklist } = useChecklistActions(id as string);

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

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!site) {
    return <div className="p-4 text-center mt-10">Objektas nerastas.</div>;
  }

  const tabs = ['Apžvalga', 'Darbai', 'Foto'];

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
        <OverviewTab assignments={site.site_assignments || []} />
      )}

      {activeTab === 'Darbai' && (
        <WorkTab 
          checklists={site.site_checklists || []}
          photos={site.photos || []}
          compressingCheckId={compressingCheckId}
          uploadingCheckId={uploadingCheckId}
          onToggleChecklist={(checkId, status) => { void handleToggleChecklist(checkId, status); }}
          onUploadPhoto={(e, checkId) => { void handleUploadPhoto(e, checkId); }}
          onSelectPhoto={(photo, checkId) => setSelectedPhoto({ photo, checkId })}
        />
      )}

      {activeTab === 'Foto' && (
        <PhotosTab photos={site.photos || []} />
      )}

      <SiteDetailActionBar 
        status={site.status}
        isCheckingIn={isCheckingIn}
        isActionPending={isActionPending}
        onCheckIn={() => { void handleCheckIn(); }}
        onPause={() => { void handlePause(); }}
        onResume={() => { void handleResume(); }}
        onComplete={() => setIsConfirmCompleteOpen(true)}
      />

      {selectedPhoto && (
        <PhotoViewerModal 
          storagePath={selectedPhoto.photo.storage_path}
          onClose={() => setSelectedPhoto(null)}
          onDelete={() => setIsDeletePhotoConfirmOpen(true)}
        />
      )}

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
