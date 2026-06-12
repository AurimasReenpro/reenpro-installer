import { useRef, useState, useMemo } from 'react';
import { Camera, Loader2, Trash2, ImageOff, X, Image, Plus, Folder, Pencil } from 'lucide-react';
import SignedPhoto from '../../../components/ui/SignedPhoto';
import PhotoAnnotator from '../../../components/shared/PhotoAnnotator';
import type { SiteDetailData, SitePhoto } from '../../../types/site.types';
import { usePhotoUpload } from '../../../hooks/usePhotoUpload';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { toast } from 'sonner';
import * as Sentry from '@sentry/react';

const DEFAULT_SECTION = 'Bendros nuotraukos';
const GALLERY_CHECK_ID = 'gallery';

interface PhotosTabProps {
  photos: SitePhoto[];
  siteId: string;
  profileId: string | undefined;
  siteData: SiteDetailData | undefined;
  readOnly?: boolean;
}

export default function PhotosTab({ photos, siteId, profileId, siteData, readOnly = false }: PhotosTabProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  // Remembers which section the pending file-input pick belongs to
  const uploadSectionRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewerPath, setViewerPath] = useState<string | null>(null);
  // storage_path of the photo currently open in the annotator (null = closed)
  const [annotatingPath, setAnnotatingPath] = useState<string | null>(null);

  // Locally created (empty) sections that haven't had photos uploaded yet
  const [localSections, setLocalSections] = useState<string[]>([]);
  const [showNewSectionDialog, setShowNewSectionDialog] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');

  // Which section's source-picker sheet is open (null = closed)
  const [pickerSection, setPickerSection] = useState<string | null>(null);

  const { uploadingCheckId, compressingCheckId, handleUploadPhoto } = usePhotoUpload(
    siteId,
    siteData,
    profileId,
  );

  const isUploading = uploadingCheckId === GALLERY_CHECK_ID;
  const isCompressing = compressingCheckId === GALLERY_CHECK_ID;
  const isBusy = isUploading || isCompressing;

  // Group fetched photos by section_name; null → default section
  const photosBySection = useMemo(() => {
    const map = new Map<string, SitePhoto[]>();
    for (const photo of photos) {
      const key = photo.section_name ?? DEFAULT_SECTION;
      const arr = map.get(key) ?? [];
      arr.push(photo);
      map.set(key, arr);
    }
    return map;
  }, [photos]);

  // Ordered list: default first, then local additions, then any extra from DB
  const allSections = useMemo(() => {
    const names = new Set<string>([DEFAULT_SECTION]);
    for (const name of localSections) names.add(name);
    for (const name of photosBySection.keys()) {
      if (name !== DEFAULT_SECTION) names.add(name);
    }
    return [...names];
  }, [localSections, photosBySection]);

  // ── File input handlers ────────────────────────────────────────────────────

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    inputRef: React.RefObject<HTMLInputElement | null>,
  ) => {
    const section = uploadSectionRef.current;
    uploadSectionRef.current = null;
    // Store null for the default section so DB stays clean
    const effectiveSection = (section === DEFAULT_SECTION || !section) ? undefined : section;
    void handleUploadPhoto(e, GALLERY_CHECK_ID, effectiveSection);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleSourceSelect = (type: 'camera' | 'gallery') => {
    uploadSectionRef.current = pickerSection;
    setPickerSection(null);
    setTimeout(() => {
      if (type === 'camera') cameraInputRef.current?.click();
      else galleryInputRef.current?.click();
    }, 50);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

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

  // ── New section ────────────────────────────────────────────────────────────

  const handleAddSection = () => {
    const name = newSectionName.trim();
    if (!name || name === DEFAULT_SECTION || localSections.includes(name)) {
      setNewSectionName('');
      setShowNewSectionDialog(false);
      return;
    }
    setLocalSections(prev => [...prev, name]);
    setNewSectionName('');
    setShowNewSectionDialog(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 pb-[140px] pt-4">
      {/* Hidden file inputs. Camera = single shot; gallery = multi-select.
          The gallery input deliberately has NO `accept` filter — `accept="image/*"`
          forces Android into single-select Google Photos. Non-images are filtered
          out in the upload handler instead. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileChange(e, cameraInputRef)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFileChange(e, galleryInputRef)}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[#1d033a] dark:text-zinc-100 font-bold text-base">Nuotraukų galerija</h3>
          <p className="text-[#39323f] dark:text-zinc-200 text-xs mt-0.5">
            {photos.length} nuotrauk{photos.length === 1 ? 'a' : 'ų'}
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowNewSectionDialog(true)}
            className="flex items-center gap-2 h-[42px] px-4 rounded-xl font-semibold text-sm bg-primary text-white active:scale-95 transition-all shadow-md"
          >
            <Plus className="w-4 h-4" />
            Nauja skiltis
          </button>
        )}
      </div>

      {/* Global upload progress */}
      {isBusy && (
        <div className="mb-4 rounded-xl bg-[#f3ebff] dark:bg-purple-500/10 border border-primary/20 p-3 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
          <p className="text-sm text-primary font-medium">
            {isCompressing ? 'Glaudinamas failas…' : 'Nuotrauka keliama į serverį…'}
          </p>
        </div>
      )}

      {/* Section cards */}
      <div className="flex flex-col gap-4">
        {allSections.map((sectionName) => {
          const sectionPhotos = photosBySection.get(sectionName) ?? [];
          return (
            <div
              key={sectionName}
              className="rounded-2xl border border-[#cdc3d4]/40 dark:border-white/5 bg-white dark:bg-[#18181b] overflow-hidden shadow-sm"
            >
              {/* Section header */}
              <div className="flex items-center justify-between px-4 py-3 bg-[#f8f3ff] dark:bg-purple-500/10 border-b border-[#cdc3d4]/30 dark:border-white/5">
                <div className="flex items-center gap-2 min-w-0">
                  <Folder className="w-4 h-4 text-primary shrink-0" />
                  <span className="font-semibold text-[#1d033a] dark:text-zinc-100 text-sm truncate">{sectionName}</span>
                  <span className="text-xs text-[#39323f] dark:text-zinc-200 shrink-0">({sectionPhotos.length})</span>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setPickerSection(sectionName)}
                    disabled={isBusy || !profileId}
                    className="flex items-center gap-1.5 h-[34px] px-3 rounded-lg font-semibold text-xs bg-primary text-white disabled:opacity-50 active:scale-95 transition-all shadow-sm ml-2 shrink-0"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Įkelti
                  </button>
                )}
              </div>

              {/* Photos grid */}
              <div className="p-3">
                {sectionPhotos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <ImageOff className="w-8 h-8 text-[#cdc3d4] dark:text-zinc-600 mb-2" />
                    <p className="text-[#39323f] dark:text-zinc-200 text-xs">Nėra nuotraukų šioje skiltyje</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {sectionPhotos.map((photo) => (
                      <div
                        key={photo.id}
                        className="relative aspect-square rounded-xl overflow-hidden bg-[#f0e8f8] dark:bg-purple-500/10 border border-[#cdc3d4]/30 dark:border-white/5"
                      >
                        <SignedPhoto
                          storage_path={photo.storage_path}
                          alt="Objekto nuotrauka"
                          className="w-full h-full object-cover cursor-pointer active:opacity-80 transition-opacity"
                          onClick={() => setViewerPath(photo.storage_path)}
                        />
                        {/* Annotate (Žymėti) — opens the markup canvas for this photo */}
                        <button
                          onClick={() => setAnnotatingPath(photo.storage_path)}
                          className="absolute top-1.5 right-1.5 w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shadow-md active:scale-90 transition-all"
                          title="Žymėti"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {deletingId === photo.id && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Full-screen photo viewer */}
      {viewerPath && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center">
          <SignedPhoto
            storage_path={viewerPath}
            alt="Didelis rodinys"
            className="w-full max-h-[72vh] object-contain"
          />
          <div className="absolute bottom-10 left-0 right-0 flex flex-col gap-3 px-6">
            <button
              onClick={() => { const p = viewerPath; setViewerPath(null); setAnnotatingPath(p); }}
              className="w-full h-[50px] bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Pencil className="w-5 h-5" />
              Žymėti nuotrauką
            </button>
            {(() => {
              const photo = photos.find(p => p.storage_path === viewerPath);
              return photo && !readOnly ? (
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
              className="w-full h-[50px] bg-white dark:bg-[#18181b] text-[#1d033a] dark:text-zinc-100 rounded-xl font-bold flex items-center justify-center gap-2"
            >
              <X className="w-5 h-5" />
              Uždaryti
            </button>
          </div>
        </div>
      )}

      {/* Per-section source picker bottom sheet */}
      {pickerSection !== null && (
        <div
          className="fixed inset-0 z-[200] flex flex-col justify-end"
          onClick={() => setPickerSection(null)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative bg-white dark:bg-[#18181b] rounded-t-2xl px-4 pt-4 pb-8 flex flex-col gap-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#cdc3d4] rounded-full mx-auto mb-2" />
            <p className="text-center text-[#1d033a] dark:text-zinc-100 font-bold text-base">Pridėti nuotrauką</p>
            <p className="text-center text-xs text-[#39323f] dark:text-zinc-200 -mt-1 mb-1">{pickerSection}</p>

            <button
              type="button"
              onClick={() => handleSourceSelect('camera')}
              className="flex items-center gap-4 w-full h-[58px] px-5 rounded-xl bg-primary text-white font-semibold text-base active:scale-95 transition-all shadow-md"
            >
              <Camera className="w-5 h-5 shrink-0" />
              Fotografuoti
            </button>
            <button
              type="button"
              onClick={() => handleSourceSelect('gallery')}
              className="flex items-center gap-4 w-full h-[58px] px-5 rounded-xl bg-[#f3ebff] dark:bg-purple-500/10 text-primary font-semibold text-base active:scale-95 transition-all"
            >
              <Image className="w-5 h-5 shrink-0" />
              Pasirinkti iš galerijos
            </button>
            <button
              onClick={() => setPickerSection(null)}
              className="flex items-center justify-center w-full h-[50px] rounded-xl bg-[#f5f0fa] dark:bg-white/5 text-[#39323f] dark:text-zinc-200 font-semibold text-sm active:scale-95 transition-all mt-1"
            >
              Atšaukti
            </button>
          </div>
        </div>
      )}

      {/* New section dialog */}
      {showNewSectionDialog && (
        <div
          className="fixed inset-0 z-[300] flex flex-col justify-end"
          onClick={() => { setShowNewSectionDialog(false); setNewSectionName(''); }}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative bg-white dark:bg-[#18181b] rounded-t-2xl px-4 pt-4 pb-8 flex flex-col gap-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#cdc3d4] rounded-full mx-auto mb-2" />
            <p className="text-center text-[#1d033a] dark:text-zinc-100 font-bold text-base mb-1">
              Nauja nuotraukų skiltis
            </p>
            <input
              type="text"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              placeholder="Skilęs modulis"
              className="w-full h-[50px] px-4 rounded-xl border border-[#cdc3d4] dark:border-white/10 text-[#1d033a] dark:text-zinc-100 text-sm focus:outline-none focus:border-primary bg-[#faf7ff] dark:bg-purple-500/10"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddSection(); }}
            />
            <button
              onClick={handleAddSection}
              disabled={!newSectionName.trim()}
              className="w-full h-[50px] bg-primary text-white rounded-xl font-bold text-sm disabled:opacity-40 active:scale-95 transition-all"
            >
              Sukurti
            </button>
            <button
              onClick={() => { setShowNewSectionDialog(false); setNewSectionName(''); }}
              className="w-full h-[46px] bg-[#f5f0fa] dark:bg-white/5 text-[#39323f] dark:text-zinc-200 rounded-xl font-semibold text-sm active:scale-95 transition-all"
            >
              Atšaukti
            </button>
          </div>
        </div>
      )}

      {/* Image markup canvas for a single photo */}
      {annotatingPath && (
        <PhotoAnnotator
          siteId={siteId}
          storagePath={annotatingPath}
          onClose={() => setAnnotatingPath(null)}
        />
      )}
    </div>
  );
}
