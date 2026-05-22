import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2, ImageOff, X, Image } from 'lucide-react';
import SignedPhoto from '../../../components/ui/SignedPhoto';
import type { SiteDetailData, SitePhoto } from '../../../types/site.types';
import { usePhotoUpload } from '../../../hooks/usePhotoUpload';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { toast } from 'sonner';
import * as Sentry from '@sentry/react';

interface PhotosTabProps {
  photos: SitePhoto[];
  siteId: string;
  profileId: string | undefined;
  siteData: SiteDetailData | undefined;
}

// Fake checkId for gallery-direct uploads (not tied to a checklist item)
const GALLERY_CHECK_ID = 'gallery';

export default function PhotosTab({ photos, siteId, profileId, siteData }: PhotosTabProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewerPath, setViewerPath] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const { uploadingCheckId, compressingCheckId, handleUploadPhoto } = usePhotoUpload(
    siteId,
    siteData,
    profileId,
  );

  const isUploading = uploadingCheckId === GALLERY_CHECK_ID;
  const isCompressing = compressingCheckId === GALLERY_CHECK_ID;
  const isBusy = isUploading || isCompressing;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, inputRef: React.RefObject<HTMLInputElement | null>) => {
    void handleUploadPhoto(e, GALLERY_CHECK_ID);
    // Reset so the same file can be re-selected if needed
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDelete = async (photo: SitePhoto) => {
    setDeletingId(photo.id);
    try {
      await supabase.storage.from('site-photos').remove([photo.storage_path]);
      await supabase.from('photos').delete().eq('id', photo.id);
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      toast.success('Nuotrauka ištrinta.');
      setViewerPath(null);
    } catch (error) {
      console.error('Delete error:', error);
      Sentry.captureException(error);
      toast.error('Nepavyko ištrinti nuotraukos.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="px-4 pb-[140px] pt-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[#1d033a] font-bold text-base">Nuotraukų galerija</h3>
          <p className="text-[#4b4452] text-xs mt-0.5">{photos.length} nuotrauk{photos.length === 1 ? 'a' : 'ų'}</p>
        </div>

        {/* Hidden input — camera only */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFileChange(e, cameraInputRef)}
        />

        {/* Hidden input — gallery only */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileChange(e, galleryInputRef)}
        />

        <button
          onClick={() => setShowPicker(true)}
          disabled={isBusy || !profileId}
          className="flex items-center gap-2 h-[42px] px-4 rounded-xl font-semibold text-sm bg-primary text-white disabled:opacity-50 active:scale-95 transition-all shadow-md"
        >
          {isBusy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {isCompressing ? 'Glaudinamas…' : 'Keliama…'}
            </>
          ) : (
            <>
              <Camera className="w-4 h-4" />
              Pridėti foto
            </>
          )}
        </button>
      </div>

      {/* Upload progress bar */}
      {isBusy && (
        <div className="mb-4 rounded-xl bg-[#f3ebff] border border-primary/20 p-3 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
          <p className="text-sm text-primary font-medium">
            {isCompressing ? 'Glaudinamas failas…' : 'Nuotrauka keliama į serverį…'}
          </p>
        </div>
      )}

      {/* Gallery grid */}
      {photos.length === 0 && !isBusy ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-[#f6e9ff] flex items-center justify-center mb-4">
            <ImageOff className="w-9 h-9 text-primary" />
          </div>
          <p className="text-[#1d033a] font-bold text-base mb-1">Nėra nuotraukų</p>
          <p className="text-[#4b4452] text-sm max-w-[240px] leading-relaxed">
            Spausk „Pridėti foto", kad pridėtum pirmą nuotrauką iš šio objekto.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square rounded-xl overflow-hidden bg-[#f0e8f8] border border-[#cdc3d4]/30"
            >
              <SignedPhoto
                storage_path={photo.storage_path}
                alt="Objekto nuotrauka"
                className="w-full h-full object-cover cursor-pointer active:opacity-80 transition-opacity"
                onClick={() => setViewerPath(photo.storage_path)}
              />
              {/* Delete overlay while deleting */}
              {deletingId === photo.id && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Full-screen photo viewer modal */}
      {viewerPath && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center">
          <SignedPhoto
            storage_path={viewerPath}
            alt="Didelis rodinys"
            className="w-full max-h-[72vh] object-contain"
          />
          <div className="absolute bottom-10 left-0 right-0 flex flex-col gap-3 px-6">
            {/* Find photo object to pass to delete */}
            {(() => {
              const photo = photos.find(p => p.storage_path === viewerPath);
              return photo ? (
                <button
                  onClick={() => void handleDelete(photo)}
                  disabled={!!deletingId}
                  className="w-full h-[50px] bg-[#ba1a1a] text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {deletingId === photo.id ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Trash2 className="w-5 h-5" />
                  )}
                  Ištrinti nuotrauką
                </button>
              ) : null;
            })()}
            <button
              onClick={() => setViewerPath(null)}
              className="w-full h-[50px] bg-white text-[#1d033a] rounded-xl font-bold flex items-center justify-center gap-2"
            >
              <X className="w-5 h-5" />
              Uždaryti
            </button>
          </div>
        </div>
      )}

      {/* Photo source picker bottom sheet */}
      {showPicker && (
        <div
          className="fixed inset-0 z-[200] flex flex-col justify-end"
          onClick={() => setShowPicker(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" />

          {/* Sheet */}
          <div
            className="relative bg-white rounded-t-2xl px-4 pt-4 pb-8 flex flex-col gap-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#cdc3d4] rounded-full mx-auto mb-2" />
            <p className="text-center text-[#1d033a] font-bold text-base mb-1">Pridėti nuotrauką</p>

            {/* Camera button */}
            <button
              onClick={() => {
                setShowPicker(false);
                setTimeout(() => cameraInputRef.current?.click(), 50);
              }}
              className="flex items-center gap-4 w-full h-[58px] px-5 rounded-xl bg-primary text-white font-semibold text-base active:scale-95 transition-all shadow-md"
            >
              <Camera className="w-5 h-5 shrink-0" />
              Fotografuoti
            </button>

            {/* Gallery button */}
            <button
              onClick={() => {
                setShowPicker(false);
                setTimeout(() => galleryInputRef.current?.click(), 50);
              }}
              className="flex items-center gap-4 w-full h-[58px] px-5 rounded-xl bg-[#f3ebff] text-primary font-semibold text-base active:scale-95 transition-all"
            >
              <Image className="w-5 h-5 shrink-0" />
              Pasirinkti iš galerijos
            </button>

            {/* Cancel */}
            <button
              onClick={() => setShowPicker(false)}
              className="flex items-center justify-center w-full h-[50px] rounded-xl bg-[#f5f0fa] text-[#4b4452] font-semibold text-sm active:scale-95 transition-all mt-1"
            >
              Atšaukti
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
