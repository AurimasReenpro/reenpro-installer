import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Image as ImageIcon, Download, Trash2, X } from 'lucide-react';
import { useConfirm } from '../../../hooks/useConfirm';
import type { InstallerPhoto } from '../../../api/sites';
import { forceDownload, deletePhotoFromAllSources } from './helpers';

export default function InstallerPhotosSection({
  photos,
  isLoading,
  siteId,
}: {
  photos: InstallerPhoto[];
  isLoading: boolean;
  siteId: string;
}) {
  const confirm      = useConfirm();
  const queryClient  = useQueryClient();

  const [lightboxPhoto, setLightboxPhoto] = useState<InstallerPhoto | null>(null);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);
  const [downloading,   setDownloading]   = useState(false);

  const handleDownload = async (photo: InstallerPhoto) => {
    if (!photo.signedUrl) return;
    setDownloading(true);
    try {
      await forceDownload(photo.signedUrl, photo.storage_path);
    } catch (err) {
      toast.error(`Atsisiuntimo klaida: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async (photo: InstallerPhoto) => {
    const ok = await confirm({
      title: 'Ištrinti nuotrauką?',
      message: 'Ar tikrai norite ištrinti šią nuotrauką? Veiksmas neatšaukiamas.',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingId(photo.id);
    if (lightboxPhoto?.id === photo.id) setLightboxPhoto(null);
    try {
      await deletePhotoFromAllSources(photo.storage_path);
      void queryClient.invalidateQueries({ queryKey: ['admin_site_photos',      siteId] });
      void queryClient.invalidateQueries({ queryKey: ['site_checklist_session', siteId] });
      toast.success('Nuotrauka ištrinta.');
    } catch (err) {
      toast.error(`Klaida trinant: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <span className="ml-3 text-[14px] text-subtle dark:text-subtle">Kraunamos nuotraukos...</span>
      </div>
    );
  }

  if (photos.length === 0) return null;

  return (
    <>
      <div className="bg-surface rounded-[16px] border border-border/20 dark:border-white/10 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border/20 dark:border-white/10 bg-surface-2/50 flex items-center gap-2">
          <ImageIcon size={18} className="text-primary" />
          <h3 className="font-semibold text-text text-[14px]">Montuotojų nuotraukos</h3>
          <span className="ml-auto text-[12px] text-subtle dark:text-subtle">
            {photos.length} nuotrauk{photos.length === 1 ? 'a' : 'ų'}
          </span>
        </div>

        {/* Grid */}
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {photos.map((photo) => {
              const isDeleting = deletingId === photo.id;
              return (
                <div
                  key={photo.id}
                  className="group relative aspect-square rounded-[10px] overflow-hidden bg-surface-2 dark:bg-surface-2 border border-border/20 dark:border-white/10 hover:border-primary/40 transition-colors"
                >
                  {/* Thumbnail (click → lightbox) */}
                  <button
                    onClick={() => setLightboxPhoto(photo)}
                    className="w-full h-full focus:outline-none"
                    disabled={isDeleting}
                  >
                    {photo.signedUrl ? (
                      <img
                        src={photo.signedUrl}
                        alt="Objekto nuotrauka"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={24} className="text-subtle" />
                      </div>
                    )}
                  </button>

                  {/* Hover action overlay — clicking the overlay itself opens the lightbox;
                      individual action buttons stopPropagation so they don't trigger this. */}
                  <div
                    onClick={() => setLightboxPhoto(photo)}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto flex flex-col justify-between p-2 cursor-pointer"
                  >
                    {/* Top-right action buttons */}
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); void handleDownload(photo); }}
                        disabled={downloading || isDeleting}
                        title="Atsisiųsti"
                        className="w-8 h-8 rounded-[6px] bg-white/90 text-text flex items-center justify-center hover:bg-white transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                      >
                        {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); void handleDelete(photo); }}
                        disabled={isDeleting || downloading}
                        title="Ištrinti"
                        className="w-8 h-8 rounded-[6px] bg-danger/90 text-white flex items-center justify-center hover:bg-danger transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                      >
                        {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                    {/* Center hint */}
                    <div className="flex justify-center">
                      <span className="text-white/90 text-[11px] font-semibold bg-black/30 px-2 py-0.5 rounded-full">
                        Peržiūrėti
                      </span>
                    </div>
                  </div>

                  {/* Deleting spinner overlay */}
                  {isDeleting && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Full-screen lightbox ─────────────────────────────────────────── */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-[200] bg-black/95 animate-in fade-in duration-150"
          onClick={() => setLightboxPhoto(null)}
        >
          {/* Image — fills the entire overlay; tiny padding keeps it off screen edges */}
          <img
            src={lightboxPhoto.signedUrl}
            alt="Didelis rodinys"
            className="w-full h-full object-contain p-2"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Floating action toolbar — pinned top-right, sits over the photo */}
          <div
            className="absolute top-4 right-4 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Download */}
            <button
              onClick={() => void handleDownload(lightboxPhoto)}
              disabled={downloading || deletingId === lightboxPhoto.id}
              title="Atsisiųsti"
              className="h-[38px] px-4 rounded-[8px] bg-white/90 backdrop-blur-sm text-text font-semibold text-[13px] flex items-center gap-2 hover:bg-white transition-colors disabled:opacity-60 cursor-pointer shadow-lg"
            >
              {downloading
                ? <Loader2 size={14} className="animate-spin" />
                : <Download size={14} />}
              Siųsti
            </button>

            {/* Delete */}
            <button
              onClick={() => void handleDelete(lightboxPhoto)}
              disabled={deletingId === lightboxPhoto.id || downloading}
              title="Ištrinti nuotrauką"
              className="h-[38px] px-4 rounded-[8px] bg-danger/90 backdrop-blur-sm text-white font-semibold text-[13px] flex items-center gap-2 hover:bg-danger transition-colors disabled:opacity-60 cursor-pointer shadow-lg"
            >
              {deletingId === lightboxPhoto.id
                ? <Loader2 size={14} className="animate-spin" />
                : <Trash2 size={14} />}
              Trinti
            </button>

            {/* Close */}
            <button
              onClick={() => setLightboxPhoto(null)}
              title="Uždaryti"
              className="w-[38px] h-[38px] rounded-[8px] bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/25 transition-colors cursor-pointer shadow-lg"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
