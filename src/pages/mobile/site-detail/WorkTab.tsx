import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import type { SiteChecklist, SitePhoto, SiteExtraMaterial } from '../../../types/site.types';
import type { ChecklistItemStatus } from '../../../hooks/useChecklistActions';
import { useExtraWorks } from '../../../hooks/useExtraWorks';
import { usePendingPhotos, type QueuedPhoto } from '../../../hooks/usePendingPhotos';
import { removeQueuedPhoto } from '../../../lib/photoOutbox';
import {
  Loader2, Camera, Image, X, ChevronDown,
  MessageSquare, CheckCircle2, XCircle, MinusCircle, Circle, Trash2,
  Plus, Package, Clock, ClipboardList,
} from 'lucide-react';
import ImageLightbox from '../../../components/shared/ImageLightbox';
import ConfirmModal from '../../../components/ui/ConfirmModal';

// ── Pending (locally-stored) photo thumbnails ────────────────────────────────
// Renders blobs queued in the IndexedDB outbox with a "Laikoma telefone" badge.
// Each can be deleted locally (it was never uploaded → no network delete).
function PendingPhotoThumbs({
  photos,
  onDelete,
  readOnly,
}: {
  photos: QueuedPhoto[];
  onDelete: (id: string) => void;
  readOnly?: boolean;
}) {
  const items = useMemo(
    () => photos.map((p) => ({ id: p.id, url: URL.createObjectURL(p.blob) })),
    [photos],
  );
  useEffect(() => () => { items.forEach((i) => URL.revokeObjectURL(i.url)); }, [items]);

  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((i) => (
        <div key={i.id} className="relative rounded-md overflow-hidden border border-warning/50">
          <img src={i.url} alt="Laikoma telefone" className="w-full aspect-square object-cover opacity-90" />
          <span
            title="Laikoma telefone – bus įkelta atsiradus ryšiui"
            className="absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1 text-[9px] font-bold px-1 py-0.5 rounded bg-warning-bg/95 text-warning border border-warning/40"
          >
            <Clock size={9} /> Telefone
          </span>
          {!readOnly && (
            <button
              onClick={() => onDelete(i.id)}
              className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-danger text-white flex items-center justify-center shadow-md border-2 border-white active:scale-90 transition-transform cursor-pointer"
              title="Ištrinti (saugoma telefone)"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// Strict cap on how many photos a single checklist task can hold (mirrors the
// annotation attachment cap). Upload controls are hidden once reached.
const MAX_PHOTOS = 5;

// Batch-sign all storage paths for an item in ONE request (preserves order so
// the lightbox index lines up with the thumbnail grid).
function useSignedPhotoUrls(paths: string[]) {
  const key = paths.join('|');
  return useQuery({
    queryKey: ['signed-urls-batch', key],
    queryFn: async () => {
      if (paths.length === 0) return [] as (string | null)[];
      const { data, error } = await supabase.storage
        .from('site-photos')
        .createSignedUrls(paths, 3600);
      if (error) throw error;
      return (data ?? []).map((d) => d.signedUrl ?? null);
    },
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000, // 50 minutes
  });
}

// ── Status display configuration ──────────────────────────────────────────────

const STATUS_CFG: Record<ChecklistItemStatus, {
  label: string;
  badgeCls: string;
  borderCls: string;
  Icon: React.ElementType;
  iconCls: string;
  btnActiveCls: string;
  btnInactiveCls: string;
}> = {
  pending: {
    label:        'Laukia',
    badgeCls:     'bg-surface-2 text-muted',
    borderCls:    'border-border',
    Icon:         Circle,
    iconCls:      'text-subtle',
    btnActiveCls: 'bg-text text-bg border-text',
    btnInactiveCls:'bg-surface-2 text-muted border-border',
  },
  pass: {
    label:        'Atlikta',
    badgeCls:     'bg-success-bg text-success',
    borderCls:    'border-success/30',
    Icon:         CheckCircle2,
    iconCls:      'text-success',
    btnActiveCls: 'bg-success text-white border-success',
    btnInactiveCls:'bg-success-bg text-success border-success/20',
  },
  fail: {
    label:        'Neatlikta',
    badgeCls:     'bg-[var(--danger)]/12 text-danger',
    borderCls:    'border-danger/30',
    Icon:         XCircle,
    iconCls:      'text-danger',
    btnActiveCls: 'bg-danger text-white border-danger',
    btnInactiveCls:'bg-[var(--danger)]/10 text-danger border-danger/20',
  },
  n_a: {
    label:        'Netaikoma',
    badgeCls:     'bg-warning-bg text-warning',
    borderCls:    'border-warning/30',
    Icon:         MinusCircle,
    iconCls:      'text-warning',
    btnActiveCls: 'bg-warning text-white border-warning',
    btnInactiveCls:'bg-warning-bg text-warning border-warning/20',
  },
};

// ── Photo picker (camera vs gallery bottom sheet) ─────────────────────────────
function PhotoPickerButton({
  checkId,
  onUploadPhoto,
}: {
  checkId: string;
  onUploadPhoto: (e: React.ChangeEvent<HTMLInputElement>, checkId: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const cameraId  = `wt-camera-${checkId}`;
  const galleryId = `wt-gallery-${checkId}`;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowPicker(false);
    void onUploadPhoto(e, checkId); // hook resets input.value itself
  };

  return (
    <>
      {/* Inputs are ALWAYS mounted (outside the conditional sheet) so the native
          <label> triggers and the resulting onChange always fire. Camera = single
          shot; gallery = multi-select via NO `accept` (image/* routes Android to
          single-select Google Photos), images are filtered in the upload hook. */}
      <input id={cameraId} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handleFile} />
      <input id={galleryId} type="file" multiple
        className="hidden" onChange={handleFile} />

      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className="flex items-center gap-2 h-[44px] px-4 rounded-xl bg-primary-fixed active:opacity-90 transition-opacity cursor-pointer border border-primary/15"
      >
        <Camera className="text-primary-ink w-5 h-5" />
        <span className="text-primary-ink font-semibold text-[13px]">Įkelti nuotrauką</span>
      </button>

      {showPicker && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end" onClick={() => setShowPicker(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-surface rounded-t-2xl px-4 pt-4 pb-8 flex flex-col gap-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-2" />
            <p className="text-center text-text font-bold text-base mb-1">Pridėti nuotrauką</p>
            {/* Native label triggers — no programmatic click(), so the OS keeps full
                picker privileges (multi-select). The sheet closes on the input's onChange. */}
            <label
              htmlFor={cameraId}
              className="flex items-center gap-4 w-full h-[58px] px-5 rounded-xl bg-primary text-white font-semibold text-base active:scale-95 transition-all shadow-md cursor-pointer"
            >
              <Camera className="w-5 h-5 shrink-0" /> Fotografuoti
            </label>
            <label
              htmlFor={galleryId}
              className="flex items-center gap-4 w-full h-[58px] px-5 rounded-xl bg-primary-fixed text-primary-ink font-semibold text-base active:scale-95 transition-all cursor-pointer"
            >
              <Image className="w-5 h-5 shrink-0" /> Pasirinkti iš galerijos
            </label>
            <button
              onClick={() => setShowPicker(false)}
              className="flex items-center justify-center w-full h-[50px] rounded-xl bg-surface-2 text-text font-semibold text-sm active:scale-95 transition-all mt-1"
            >
              <X className="w-4 h-4 mr-2" /> Atšaukti
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Thumbnail grid for an item's photos ───────────────────────────────────────
// Renders every photo linked to a task as a square thumbnail with a per-photo
// delete (X) button. Tapping a thumbnail opens the shared ImageLightbox in
// gallery mode so the user can swipe through all of the task's photos.
function ItemPhotoGrid({
  photos,
  checkId,
  onDeletePhoto,
  readOnly,
}: {
  photos: SitePhoto[];
  checkId: string;
  onDeletePhoto: (photo: SitePhoto, checkId: string) => void;
  readOnly?: boolean;
}) {
  const paths = useMemo(() => photos.map((p) => p.storage_path), [photos]);
  const { data: signed } = useSignedPhotoUrls(paths);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Align each photo with its signed URL (same order as `paths`).
  const items = photos.map((p, i) => ({ photo: p, url: signed?.[i] ?? null }));
  const galleryUrls = items.map((x) => x.url).filter((u): u is string => !!u);

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {items.map(({ photo, url }, idx) => (
          <div key={photo.id} className="relative">
            <button
              onClick={() => setLightboxIndex(idx)}
              className="block w-full aspect-square rounded-md overflow-hidden border border-border bg-surface-2 active:scale-95 transition-transform cursor-pointer"
              title="Peržiūrėti"
            >
              {url ? (
                <img src={url} alt="Nuotrauka" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 size={16} className="text-subtle animate-spin" />
                </div>
              )}
            </button>
            {!readOnly && (
              <button
                onClick={() => onDeletePhoto(photo, checkId)}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-danger text-white flex items-center justify-center shadow-md border-2 border-white active:scale-90 transition-transform cursor-pointer"
                title="Ištrinti nuotrauką"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        ))}
      </div>

      {lightboxIndex !== null && galleryUrls.length > 0 && (
        <ImageLightbox
          urls={galleryUrls}
          index={Math.min(lightboxIndex, galleryUrls.length - 1)}
          originalFileUrl={galleryUrls[Math.min(lightboxIndex, galleryUrls.length - 1)]}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}

// ── Accordion checklist item card ─────────────────────────────────────────────
interface ItemCardProps {
  item: SiteChecklist;
  photos: SitePhoto[];
  isExpanded: boolean;
  compressingCheckId: string | null;
  uploadingCheckId: string | null;
  onToggleExpand: () => void;
  onSetStatus: (itemId: string, status: ChecklistItemStatus) => void;
  onSaveComment: (itemId: string, comment: string) => Promise<void>;
  onUploadPhoto: (e: React.ChangeEvent<HTMLInputElement>, checkId: string) => void;
  onDeletePhoto: (photo: SitePhoto, checkId: string) => void;
  /** Locally-queued (not-yet-uploaded) photos for this item. */
  pendingPhotos?: QueuedPhoto[];
  /** Remove a locally-queued photo from the outbox (never uploaded). */
  onDeletePending: (id: string) => void;
  /** Present only for installer-created extras → renders a delete button. */
  onRequestDelete?: () => void;
  isDeleting?: boolean;
  /** Completed site → all edit controls disabled/hidden. */
  readOnly?: boolean;
}

function ChecklistItemCard({
  item,
  photos,
  isExpanded,
  compressingCheckId,
  uploadingCheckId,
  readOnly = false,
  onToggleExpand,
  onSetStatus,
  onSaveComment,
  onUploadPhoto,
  onDeletePhoto,
  pendingPhotos = [],
  onDeletePending,
  onRequestDelete,
  isDeleting,
}: ItemCardProps) {
  const currentStatus: ChecklistItemStatus = item.status ?? 'pending';
  const cfg = STATUS_CFG[currentStatus];
  const StatusIcon = cfg.Icon;

  // All photos linked to THIS task (durable `photos` rows are the source of
  // truth; the legacy single `photo_url` column is only a fallback).
  const linkedPhotos = (photos ?? []).filter((p) => p.storage_path.includes(`/${item.id}/`));
  // Strictly the durable `photos` rows. The legacy `photo_url` mirror is ignored:
  // it can stay stale after photos are deleted (e.g. from the Foto tab, which
  // uses the gallery id and never clears it), which previously left a ghost
  // camera icon in the header + a broken-image placeholder box in the body.
  const hasPhoto   = linkedPhotos.length > 0 || pendingPhotos.length > 0;
  const hasComment = !!item.comment?.trim();

  // Local comment — initialised from DB value at mount.
  // After a successful save the query refetches, but localComment already equals
  // the saved value (the user typed it), so no manual sync is needed.
  const [localComment,    setLocalComment]    = useState(item.comment ?? '');
  const [isSavingComment, setIsSavingComment] = useState(false);

  const commentChanged = localComment !== (item.comment ?? '');

  const handleSave = async () => {
    if (!commentChanged || isSavingComment) return;
    setIsSavingComment(true);
    try {
      await onSaveComment(item.id, localComment);
    } finally {
      setIsSavingComment(false);
    }
  };

  const handleStatusTap = (tapped: ChecklistItemStatus) => {
    // Tapping the active status a second time resets to 'pending'
    const next: ChecklistItemStatus = tapped === currentStatus ? 'pending' : tapped;
    onSetStatus(item.id, next);
  };

  return (
    <div className={`bg-surface rounded-2xl mb-3 overflow-hidden shadow-sm border transition-shadow ${cfg.borderCls} ${isExpanded ? 'shadow-md' : ''}`}>

      {/* ── Collapsed header (always visible) ── */}
      <button
        onClick={onToggleExpand}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-surface-2 transition-colors cursor-pointer"
      >
        {/* Status dot icon */}
        <StatusIcon size={20} className={`flex-shrink-0 ${cfg.iconCls}`} />

        {/* Task label */}
        <span className={`flex-1 text-text font-semibold text-[14px] leading-snug ${currentStatus === 'pass' ? 'line-through opacity-60' : ''}`}>
          {item.question_text}
        </span>

        {/* Right side: indicators + status badge + chevron */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasComment && <MessageSquare size={12} className="text-primary opacity-70" />}
          {hasPhoto   && <Camera size={12} className="text-primary opacity-70" />}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] ${cfg.badgeCls}`}>
            {cfg.label}
          </span>
          <ChevronDown
            size={16}
            className={`text-subtle transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* ── Expanded action area ── */}
      {isExpanded && (
        <div className="border-t border-border px-4 pb-5 pt-4 space-y-5 animate-in slide-in-from-top-2 fade-in duration-200">

          {/* 1 ▸ Status toggle buttons */}
          <div>
            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">Statusas</p>
            <div className="grid grid-cols-3 gap-2">
              {(['pass', 'fail', 'n_a'] as const).map((s) => {
                const sc = STATUS_CFG[s];
                const isActive = currentStatus === s;
                return (
                  <button
                    key={s}
                    onClick={() => { if (!readOnly) handleStatusTap(s); }}
                    disabled={readOnly}
                    className={`h-[52px] rounded-xl font-bold text-[13px] border-2 flex items-center justify-center gap-1.5 transition-all ${readOnly ? 'opacity-50 cursor-not-allowed' : 'active:scale-95 cursor-pointer'} ${isActive ? sc.btnActiveCls : sc.btnInactiveCls}`}
                  >
                    <sc.Icon size={15} />
                    {sc.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2 ▸ Comment textarea */}
          <div>
            <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-2">
              Komentaras / Pastaba
            </label>
            <textarea
              value={localComment}
              onChange={(e) => setLocalComment(e.target.value)}
              onBlur={() => { if (!readOnly && commentChanged) void handleSave(); }}
              readOnly={readOnly}
              placeholder="Pridėkite pastabą arba pastebėjimą..."
              rows={2}
              className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-xl text-[13px] text-text placeholder:text-subtle focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none transition-colors read-only:opacity-70"
            />
            {commentChanged && !readOnly && (
              <button
                onClick={() => { void handleSave(); }}
                disabled={isSavingComment}
                className="mt-1.5 flex items-center gap-1.5 h-[30px] px-3 rounded-lg bg-primary text-white font-semibold text-[11px] active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                {isSavingComment && <Loader2 size={11} className="animate-spin" />}
                Išsaugoti pastabą
              </button>
            )}
          </div>

          {/* 3 ▸ Photo area */}
          <div>
            <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-2">
              Nuotrauka{item.is_required && <span className="text-danger ml-0.5">*</span>}
            </label>

            <div className="space-y-3">
              {/* Photo grid — only the durable photos rows. Nothing is rendered
                  when there are 0 photos (no empty boxes / broken placeholders). */}
              {linkedPhotos.length > 0 && (
                <ItemPhotoGrid
                  photos={linkedPhotos}
                  checkId={item.id}
                  onDeletePhoto={onDeletePhoto}
                  readOnly={readOnly}
                />
              )}

              {/* Locally-stored photos awaiting upload */}
              {pendingPhotos.length > 0 && (
                <PendingPhotoThumbs photos={pendingPhotos} onDelete={onDeletePending} readOnly={readOnly} />
              )}

              {/* Upload controls / progress. Hidden when read-only or cap reached. */}
              {readOnly ? null : compressingCheckId === item.id ? (
                <div className="flex items-center gap-2 text-primary-ink text-[12px] font-semibold h-[44px]">
                  <Loader2 size={14} className="animate-spin" /> Spaudžiama...
                </div>
              ) : uploadingCheckId === item.id ? (
                <div className="flex items-center gap-2 text-primary-ink text-[12px] font-semibold h-[44px]">
                  <Loader2 size={14} className="animate-spin" /> Keliama į serverį...
                </div>
              ) : linkedPhotos.length >= MAX_PHOTOS ? (
                <p className="text-[12px] text-muted italic">
                  Pasiektas {MAX_PHOTOS} nuotraukų limitas.
                </p>
              ) : (
                <PhotoPickerButton checkId={item.id} onUploadPhoto={onUploadPhoto} />
              )}
            </div>
          </div>

          {/* 4 ▸ Delete (extras only). Tucked at the bottom of the expanded card
              + behind a confirm dialog so it can't be tapped by accident. */}
          {onRequestDelete && !readOnly && (
            <div className="pt-1 flex justify-end">
              <button
                onClick={onRequestDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 h-[36px] px-3 rounded-lg bg-[var(--danger)]/10 text-danger font-semibold text-[12px] border border-danger/20 active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
              >
                {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Ištrinti darbą
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Phases ────────────────────────────────────────────────────────────────────
const KNOWN_PHASES = new Set(['pre', 'during', 'post']);

const PHASE_TITLES: Record<string, string> = {
  pre:    'Pasiruošimas (Pre-checklist)',
  during: 'Darbų eiga',
  post:   'Užbaigimas (Post-checklist)',
};

// ── Add-extra-work bottom sheet ───────────────────────────────────────────────
// Installer-created extra task. Photos are staged locally (File[]) and only
// uploaded once the work is saved (the checklist item must exist first to key
// the storage path). At least one photo is encouraged.
function AddExtraWorkSheet({
  onClose,
  onSave,
  isSaving,
}: {
  onClose: () => void;
  onSave: (name: string, comment: string, files: File[]) => Promise<boolean>;
  isSaving: boolean;
}) {
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const cameraId = 'extra-work-camera';
  const galleryId = 'extra-work-gallery';

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (picked.length > 0) setFiles((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
    e.target.value = '';
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    const ok = await onSave(name, comment, files);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-surface rounded-t-2xl px-4 pt-4 pb-8 flex flex-col gap-4 shadow-2xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-border rounded-full mx-auto" />
        <p className="text-center text-text font-bold text-base">Pridėti papildomą darbą</p>

        {/* Name (required) */}
        <div>
          <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-2">
            Darbo pavadinimas <span className="text-danger">*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Pvz.: Papildoma kabelių trasa..."
            autoFocus
            className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-xl text-[14px] text-text placeholder:text-subtle focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
          />
        </div>

        {/* Comment */}
        <div>
          <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-2">
            Pastaba / Komentaras
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Aprašykite atliktą darbą..."
            rows={3}
            className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-xl text-[13px] text-text placeholder:text-subtle focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none transition-colors"
          />
        </div>

        {/* Photos */}
        <div>
          <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-2">
            Nuotraukos <span className="text-muted/70 normal-case font-medium">(rekomenduojama bent 1)</span>
          </label>

          <input id={cameraId} type="file" accept="image/*" capture="environment" className="hidden" onChange={addFiles} />
          <input id={galleryId} type="file" multiple className="hidden" onChange={addFiles} />

          {files.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {files.map((f, idx) => (
                <div key={`${f.name}-${idx}`} className="relative">
                  <img
                    src={URL.createObjectURL(f)}
                    alt="Peržiūra"
                    className="w-full aspect-square rounded-md object-cover border border-border"
                  />
                  <button
                    onClick={() => removeFile(idx)}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-danger text-white flex items-center justify-center shadow-md border-2 border-white active:scale-90 transition-transform cursor-pointer"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {files.length < MAX_PHOTOS && (
            <div className="flex gap-2">
              <label
                htmlFor={cameraId}
                className="flex-1 flex items-center justify-center gap-2 h-[46px] rounded-xl bg-primary text-white font-semibold text-[13px] active:scale-95 transition-all cursor-pointer"
              >
                <Camera className="w-4 h-4" /> Fotografuoti
              </label>
              <label
                htmlFor={galleryId}
                className="flex-1 flex items-center justify-center gap-2 h-[46px] rounded-xl bg-primary-fixed text-primary-ink font-semibold text-[13px] active:scale-95 transition-all cursor-pointer"
              >
                <Image className="w-4 h-4" /> Galerija
              </label>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 h-[50px] rounded-xl bg-surface-2 text-text font-semibold text-sm active:scale-95 transition-all disabled:opacity-60 cursor-pointer"
          >
            Atšaukti
          </button>
          <button
            onClick={() => { void handleSave(); }}
            disabled={isSaving || !name.trim()}
            className="flex-1 h-[50px] rounded-xl bg-primary text-white font-semibold text-sm active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Išsaugoti
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Extra materials section ───────────────────────────────────────────────────
function ExtraMaterialsSection({
  materials,
  onAdd,
  onDelete,
  readOnly,
}: {
  materials: SiteExtraMaterial[];
  onAdd: (m: { name: string; quantity: number; unit: string }) => boolean;
  onDelete: (id: string) => void;
  readOnly?: boolean;
}) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('vnt.');

  const handleAdd = () => {
    const ok = onAdd({ name, quantity: Number(qty) || 1, unit });
    if (ok) { setName(''); setQty('1'); setUnit('vnt.'); }
  };

  return (
    <div className="mb-6">
      <h3 className="text-text font-bold text-[15px] mb-3 flex items-center gap-2">
        <Package size={16} className="text-primary" /> Papildomos medžiagos
      </h3>

      <div className="bg-surface rounded-[20px] shadow-card border border-border p-4 space-y-3">
        {/* Existing rows */}
        {materials.length > 0 && (
          <div className="space-y-2">
            {materials.map((m) => (
              <div key={m.id} className="flex items-center gap-2 bg-surface-2 rounded-xl px-3 py-2.5 border border-border">
                <span className="flex-1 text-[13px] font-semibold text-text truncate">{m.name}</span>
                <span className="text-[13px] text-muted font-medium whitespace-nowrap">
                  {m.quantity} {m.unit}
                </span>
                {!readOnly && (
                  <button
                    onClick={() => onDelete(m.id)}
                    className="w-7 h-7 rounded-full bg-[var(--danger)]/10 text-danger flex items-center justify-center active:scale-90 transition-transform cursor-pointer shrink-0"
                    title="Ištrinti"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {readOnly && materials.length === 0 && (
          <p className="text-[13px] text-subtle text-center py-1">Papildomų medžiagų nėra.</p>
        )}

        {/* Inline add row: [name][qty][unit][+] */}
        {!readOnly && (
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Medžiaga"
            className="flex-1 min-w-0 px-3 h-[44px] bg-surface-2 border border-border rounded-xl text-[13px] text-text placeholder:text-subtle focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="Kiekis"
            className="w-[64px] px-2 h-[44px] bg-surface-2 border border-border rounded-xl text-[13px] text-text text-center placeholder:text-subtle focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="vnt."
            className="w-[60px] px-2 h-[44px] bg-surface-2 border border-border rounded-xl text-[13px] text-text text-center placeholder:text-subtle focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            className="w-[44px] h-[44px] shrink-0 rounded-xl bg-primary text-white flex items-center justify-center active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            title="Pridėti medžiagą"
          >
            <Plus size={20} />
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

// ── WorkTab props ─────────────────────────────────────────────────────────────
interface WorkTabProps {
  checklists: SiteChecklist[];
  photos: SitePhoto[];
  extraMaterials: SiteExtraMaterial[];
  siteId: string;
  siteChecklistId: string | undefined;
  profileId: string | undefined;
  compressingCheckId: string | null;
  uploadingCheckId: string | null;
  readOnly?: boolean;
  onSetStatus: (itemId: string, status: ChecklistItemStatus) => void;
  onSaveComment: (itemId: string, comment: string) => Promise<void>;
  onUploadPhoto: (e: React.ChangeEvent<HTMLInputElement>, checkId: string) => void;
  onDeletePhoto: (photo: SitePhoto, checkId: string) => void;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WorkTab({
  checklists,
  photos,
  extraMaterials,
  siteId,
  siteChecklistId,
  profileId,
  compressingCheckId,
  uploadingCheckId,
  readOnly = false,
  onSetStatus,
  onSaveComment,
  onUploadPhoto,
  onDeletePhoto,
}: WorkTabProps) {
  // Only one item can be expanded at a time (accordion behaviour)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddWork, setShowAddWork] = useState(false);
  // Pending delete confirmation — covers both extra works and materials.
  const [deleteTarget, setDeleteTarget] = useState<
    { type: 'work' | 'material'; id: string; name: string } | null
  >(null);

  const {
    isCreatingWork,
    deletingWorkId,
    createExtraWork,
    addMaterial,
    deleteMaterial,
    deleteExtraWork,
  } = useExtraWorks(siteId, siteChecklistId, profileId);

  const queryClient = useQueryClient();

  // Photos still queued in the device outbox (offline / failed uploads).
  const { data: pendingPhotos } = usePendingPhotos(siteId);
  const pendingForItem = (itemId: string) =>
    (pendingPhotos ?? []).filter((p) => p.itemId === itemId);

  // Delete a queued photo locally — it was never uploaded, so no network call.
  const handleDeletePending = (id: string) => {
    void (async () => {
      await removeQueuedPhoto(id);
      await queryClient.invalidateQueries({ queryKey: ['photo-outbox', siteId] });
      toast.success('Nuotrauka pašalinta iš telefono.');
    })();
  };

  const toggleItem = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  // Items with phase=null get their own section at the bottom — this covers both
  // admin-added items and installer-created extras (is_extra=true, phase=null).
  const customItems = checklists?.filter((c) => !KNOWN_PHASES.has(c.phase ?? '')) ?? [];

  const sharedProps: Omit<ItemCardProps, 'item' | 'isExpanded' | 'onToggleExpand' | 'pendingPhotos'> = {
    photos,
    compressingCheckId,
    uploadingCheckId,
    readOnly,
    onSetStatus,
    onSaveComment,
    onUploadPhoto,
    onDeletePhoto,
    onDeletePending: handleDeletePending,
  };

  return (
    <div className="px-4 pb-[120px] pt-4">

      {/* ── Standard phase sections ── */}
      {['pre', 'during', 'post'].map((phaseCode) => {
        const phaseItems = checklists?.filter((c) => c.phase === phaseCode) ?? [];
        if (phaseItems.length === 0) return null;

        return (
          <div key={phaseCode} className="mb-6">
            <h3 className="text-text font-bold text-[15px] mb-3">
              {PHASE_TITLES[phaseCode] ?? phaseCode}
            </h3>
            {phaseItems.map((item) => (
              <ChecklistItemCard
                key={item.id}
                item={item}
                isExpanded={expandedId === item.id}
                onToggleExpand={() => toggleItem(item.id)}
                pendingPhotos={pendingForItem(item.id)}
                {...sharedProps}
              />
            ))}
          </div>
        );
      })}

      {/* ── Custom / additional tasks (admin-added + installer extras, phase = null) ── */}
      <div className="mb-6">
        <h3 className="text-text font-bold text-[15px] mb-3">Papildomi darbai</h3>
        {customItems.map((item) => (
          <ChecklistItemCard
            key={item.id}
            item={item}
            isExpanded={expandedId === item.id}
            onToggleExpand={() => toggleItem(item.id)}
            pendingPhotos={pendingForItem(item.id)}
            {...sharedProps}
            {...(item.is_extra
              ? {
                  onRequestDelete: () =>
                    setDeleteTarget({ type: 'work', id: item.id, name: item.question_text }),
                  isDeleting: deletingWorkId === item.id,
                }
              : {})}
          />
        ))}

        {/* + Pridėti papildomą darbą (secondary outline) */}
        {!readOnly && (
          <>
            <button
              onClick={() => setShowAddWork(true)}
              disabled={!siteChecklistId}
              className="w-full h-[48px] rounded-xl border-2 border-dashed border-primary/40 text-primary font-semibold text-[14px] flex items-center justify-center gap-2 bg-surface active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
            >
              <Plus size={18} /> Pridėti papildomą darbą
            </button>
            {!siteChecklistId && (
              <p className="text-[11px] text-muted italic mt-2 text-center">
                Papildomus darbus galima pridėti tik priskirus checklist sesiją.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Extra materials ── */}
      <ExtraMaterialsSection
        materials={extraMaterials}
        readOnly={readOnly}
        onAdd={addMaterial}
        onDelete={(id) => {
          const m = extraMaterials.find((x) => x.id === id);
          setDeleteTarget({ type: 'material', id, name: m?.name ?? 'medžiaga' });
        }}
      />

      {/* ── Empty state (no checklist items at all) ── */}
      {(!checklists || checklists.length === 0) && customItems.length === 0 && (
        <div className="bg-surface rounded-[20px] border border-border shadow-card py-10 flex flex-col items-center gap-2">
          <ClipboardList className="w-9 h-9 text-subtle" />
          <p className="text-[14px] text-subtle">Standartinių užduočių nėra.</p>
        </div>
      )}

      {showAddWork && (
        <AddExtraWorkSheet
          onClose={() => setShowAddWork(false)}
          onSave={createExtraWork}
          isSaving={isCreatingWork}
        />
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={deleteTarget?.type === 'material' ? 'Ištrinti medžiagą' : 'Ištrinti papildomą darbą'}
        message={
          deleteTarget?.type === 'material'
            ? `Ar tikrai norite ištrinti šią medžiagą („${deleteTarget?.name}")?`
            : `Ar tikrai norite ištrinti šį papildomą darbą („${deleteTarget?.name}")? Bus pašalintos ir susijusios nuotraukos.`
        }
        confirmText="Ištrinti"
        cancelText="Atšaukti"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget?.type === 'work') {
            void deleteExtraWork(deleteTarget.id);
          } else if (deleteTarget?.type === 'material') {
            deleteMaterial(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
