import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Loader2, Download, Trash2, Circle, CheckCircle2, XCircle, MinusCircle,
  ChevronRight, AlertTriangle, Image as ImageIcon,
} from 'lucide-react';
import { useConfirm } from '../../../hooks/useConfirm';
import { useSignedPhotoUrl } from '../../../hooks/useSignedPhotoUrl';
import ImageLightbox from '../../../components/shared/ImageLightbox';
import type { InstallerPhoto } from '../../../api/sites';
import { extractStoragePath, forceDownload, deletePhotoFromAllSources } from './helpers';
import type { ItemStatus } from './types';

const STATUS_ITEM: Record<ItemStatus, { label: string; icon: React.ElementType; className: string; dotClass: string }> = {
  pending: { label: 'Laukia',     icon: Circle,       className: 'bg-surface-2 dark:bg-surface-2 text-subtle dark:text-subtle border-border/50 dark:border-white/10',  dotClass: 'bg-border' },
  pass:    { label: 'Atlikta',    icon: CheckCircle2, className: 'bg-[#ECFDF5] text-[#059669] border-[#059669]/20',   dotClass: 'bg-[#059669]' },
  fail:    { label: 'Neatlikta', icon: XCircle,      className: 'bg-[#FEF2F2] text-[#DC2626] border-[#DC2626]/20',   dotClass: 'bg-[#DC2626]' },
  n_a:     { label: 'Netaikoma', icon: MinusCircle,  className: 'bg-[#FFFBEB] text-[#D97706] border-[#D97706]/20',   dotClass: 'bg-[#D97706]' },
};

/**
 * Renders a checklist item photo with Download + Delete action buttons.
 * `value` may be a bare storage path (new data) or a full https:// URL (legacy).
 */
function ChecklistPhoto({
  value,
  siteId,
  checklistItemId,
}: {
  value: string;
  siteId: string;
  checklistItemId: string;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = useState(false);
  const [deleting,    setDeleting]    = useState(false);

  const storagePath = extractStoragePath(value);
  const isPath = !value.startsWith('http');
  const { url: signedUrl, isLoading } = useSignedPhotoUrl(isPath ? storagePath : undefined);
  const displayUrl = isPath ? (signedUrl ?? '') : value;

  const handleDownload = async () => {
    if (!displayUrl) return;
    setDownloading(true);
    try {
      await forceDownload(displayUrl, storagePath);
    } catch (err) {
      toast.error(`Atsisiuntimo klaida: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Ištrinti nuotrauką?',
      message: 'Ar tikrai norite ištrinti šią nuotrauką? Veiksmas neatšaukiamas.',
      variant: 'danger',
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await deletePhotoFromAllSources(storagePath, checklistItemId);
      void queryClient.invalidateQueries({ queryKey: ['site_checklist_session', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['admin_site_photos',      siteId] });
      toast.success('Nuotrauka ištrinta.');
    } catch (err) {
      toast.error(`Klaida trinant: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-28 w-28 rounded-[8px] bg-surface-2 dark:bg-surface-2 border border-border/30 dark:border-white/10 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      </div>
    );
  }

  if (!displayUrl) return null;

  return (
    <div className="inline-flex flex-col gap-2">
      {/* Thumbnail */}
      <a href={displayUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
        <img
          src={displayUrl}
          alt="Nuotrauka"
          className="h-28 w-auto rounded-[8px] border border-border/30 dark:border-white/10 object-cover hover:opacity-90 transition-opacity cursor-zoom-in"
        />
      </a>
      {/* Action bar */}
      <div className="flex gap-1.5">
        <button
          onClick={() => void handleDownload()}
          disabled={downloading || deleting}
          title="Atsisiųsti"
          className="flex-1 flex items-center justify-center gap-1.5 h-[28px] rounded-[6px] bg-surface-2 dark:bg-surface-2 border border-border/40 dark:border-white/5 text-muted dark:text-subtle hover:bg-surface-2 hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-50 text-[11px] font-semibold cursor-pointer"
        >
          {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          Siųsti
        </button>
        <button
          onClick={() => void handleDelete()}
          disabled={downloading || deleting}
          title="Ištrinti nuotrauką"
          className="flex items-center justify-center gap-1.5 h-[28px] px-2.5 rounded-[6px] bg-[#FEF2F2] border border-[#DC2626]/20 text-[#DC2626] hover:bg-[#DC2626] hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
        >
          {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        </button>
      </div>
    </div>
  );
}

export default function ChecklistItemRow({
  item,
  siteId,
  installerPhotos = [],
}: {
  item: {
    id: string;
    question_text: string;
    category: string | null;
    phase: string | null;
    status: ItemStatus;
    photo_url: string | null;
    comment: string | null;
    is_required: boolean;
    is_extra?: boolean;
    requires_photo?: boolean | null;
    min_photo_count?: number | null;
  };
  siteId: string;
  /** Photos from the `photos` table whose storage_path maps to this item (durable record). */
  installerPhotos?: InstallerPhoto[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const s = STATUS_ITEM[item.status];
  const StatusIcon = s.icon;

  // Durable photos (photos table) are the source of truth. Fall back to the
  // legacy single `photo_url` column only when no rows matched this item.
  const photoUrls = installerPhotos.map(p => p.signedUrl).filter((u): u is string => !!u);
  const hasInstallerPhotos = photoUrls.length > 0;
  const hasAnyPhoto = hasInstallerPhotos || !!item.photo_url;

  return (
    <div className={`rounded-[10px] border transition-all duration-200 ${item.status === 'fail' ? 'border-[#DC2626]/30 bg-[#FEF2F2]/30' : 'border-border/30 dark:border-white/10 bg-surface hover:border-border/60'}`}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 p-3.5 text-left cursor-pointer"
      >
        <StatusIcon size={18} className={item.status === 'pass' ? 'text-[#059669]' : item.status === 'fail' ? 'text-[#DC2626]' : item.status === 'n_a' ? 'text-[#D97706]' : 'text-subtle'} />
        <span className="flex-1 text-[13px] font-semibold text-text dark:text-gray-100 leading-snug">
          {item.question_text}
          {item.is_extra && (
            <span className="ml-2 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#FBF0FF] text-primary border border-primary/20 align-middle">
              PAPILDOMAS DARBAS
            </span>
          )}
          {item.requires_photo && (
            <span className="ml-2 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#FFFBEB] text-[#D97706] border border-[#D97706]/20 align-middle">
              Reikia nuotraukos{item.min_photo_count && item.min_photo_count > 1 ? ` ${item.min_photo_count}` : ''}
            </span>
          )}
        </span>
        {/* Collapsed-state evidence thumbnail */}
        {hasInstallerPhotos && (
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded(true); setLightboxIndex(0); }}
            className="relative shrink-0 w-9 h-9 rounded-[6px] overflow-hidden border border-border/40 dark:border-white/5 cursor-zoom-in hover:border-primary/50 transition-colors"
            title="Peržiūrėti nuotrauką"
          >
            <img src={photoUrls[0]} alt="Įrodymas" className="w-full h-full object-cover" />
            {photoUrls.length > 1 && (
              <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] font-bold px-1 leading-tight rounded-tl-[4px]">
                {photoUrls.length}
              </span>
            )}
          </span>
        )}
        {item.is_required && item.status === 'pending' && (
          <span className="text-[10px] font-bold text-[#DC2626] border border-[#DC2626]/30 bg-[#FEF2F2] px-1.5 py-0.5 rounded">REQ</span>
        )}
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-[6px] border ${s.className}`}>{s.label}</span>
        <ChevronRight size={14} className={`text-subtle transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/20 dark:border-white/10 p-4 space-y-3">
              {/* Comment */}
              {item.comment ? (
                <div>
                  <p className="text-[11px] font-bold text-subtle dark:text-subtle uppercase tracking-wider mb-1">Komentaras</p>
                  <p className="text-[13px] text-text dark:text-gray-100 bg-surface-2 dark:bg-surface-2 rounded-[8px] px-3 py-2 border border-border/30 dark:border-white/10">{item.comment}</p>
                </div>
              ) : (
                <p className="text-[12px] text-subtle dark:text-subtle italic">Komentaro nėra.</p>
              )}

              {/* Installer's photos (Įrodymai) — durable photos-table records */}
              <div>
                <p className="text-[11px] font-bold text-subtle dark:text-subtle uppercase tracking-wider mb-2">Montuotojo nuotrauka</p>
                {hasInstallerPhotos ? (
                  <div className="flex flex-wrap gap-2">
                    {photoUrls.map((u, idx) => (
                      <button
                        key={installerPhotos[idx]?.id ?? u}
                        onClick={() => setLightboxIndex(idx)}
                        className="w-20 h-20 rounded-[8px] overflow-hidden border border-border/30 dark:border-white/10 hover:border-primary/50 transition-colors cursor-zoom-in focus:outline-none"
                        title="Peržiūrėti"
                      >
                        <img src={u} alt="Įrodymas" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : item.photo_url ? (
                  /* Legacy fallback: single photo_url column */
                  <ChecklistPhoto
                    value={item.photo_url}
                    siteId={siteId}
                    checklistItemId={item.id}
                  />
                ) : (
                  <div className="flex items-center gap-2 text-subtle dark:text-subtle bg-surface-2 dark:bg-surface-2 border border-dashed border-border/50 dark:border-white/10 rounded-[8px] px-3 py-2.5">
                    <ImageIcon size={14} className="text-subtle" />
                    <span className="text-[12px] italic">Nėra nuotraukos</span>
                  </div>
                )}
              </div>

              {item.status === 'fail' && !hasAnyPhoto && (
                <div className="flex items-center gap-2 text-[#D97706] bg-[#FFFBEB] border border-[#D97706]/20 rounded-[8px] px-3 py-2">
                  <AlertTriangle size={14} />
                  <span className="text-[12px] font-semibold">Reikia nuotraukos — laukiama montuotojo įkėlimo.</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen lightbox for the installer evidence photos */}
      {lightboxIndex !== null && hasInstallerPhotos && (
        <ImageLightbox
          urls={photoUrls}
          index={lightboxIndex}
          originalFileUrl={photoUrls[lightboxIndex]}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
