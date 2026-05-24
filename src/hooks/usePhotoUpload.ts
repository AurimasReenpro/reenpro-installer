import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import * as Sentry from '@sentry/react';
import type { SiteDetailData } from '../types/site.types';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';
import { useSyncStore } from '../stores/useSyncStore';

type SitePhoto = SiteDetailData['photos'][number];

// Gallery uploads are not tied to a specific checklist item.
const GALLERY_ID = 'gallery';

async function compress(file: File): Promise<File> {
  if (file.size < 500 * 1024) return file;
  return imageCompression(file, {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.85,
  });
}

/** Extract a human-readable message from any thrown value. */
function toMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    const raw = e.message ?? e.error_description ?? e.error;
    if (raw !== undefined) return typeof raw === 'string' ? raw : JSON.stringify(raw);
    return JSON.stringify(err);
  }
  return String(err);
}

export function usePhotoUpload(
  siteId: string,
  site: SiteDetailData | undefined,
  profileId: string | undefined,
) {
  const queryClient = useQueryClient();
  const [compressingCheckId, setCompressingCheckId] = useState<string | null>(null);
  const [uploadingCheckId,   setUploadingCheckId]   = useState<string | null>(null);

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUploadPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    itemId: string,
  ) => {
    const file = e.target.files?.[0];
    if (!file || !profileId || !site) return;

    const { startSync, finishSync } = useSyncStore.getState();
    startSync();

    // ── 0. Compress ──────────────────────────────────────────────────────────
    setCompressingCheckId(itemId);
    let fileToUpload: File;
    try {
      fileToUpload = await compress(file);
      console.log(
        `[Photo] Compressed ${(file.size / 1024).toFixed(0)} KB → ${(fileToUpload.size / 1024).toFixed(0)} KB`,
      );
    } catch (compErr) {
      // Compression is best-effort — fall back to the original.
      console.warn('[Photo] Compression failed, using original file:', toMsg(compErr));
      fileToUpload = file;
    } finally {
      setCompressingCheckId(null);
    }

    // ── 1–3. Upload pipeline ─────────────────────────────────────────────────
    setUploadingCheckId(itemId);
    const fileExt = file.name.split('.').pop() ?? 'jpg';
    const filePath = `${site.id}/${itemId}/${Date.now()}.${fileExt}`;

    try {
      // ── Step 1 / 3: Storage upload ──────────────────────────────────────
      const { error: storageErr } = await supabase.storage
        .from('site-photos')
        .upload(filePath, fileToUpload);

      if (storageErr) {
        throw new Error(`[1/3] Saugyklos klaida: ${toMsg(storageErr)}`);
      }
      console.log('[Photo] Step 1/3 ✓ — storage upload:', filePath);

      // ── Step 2 / 3: Insert photos row ───────────────────────────────────
      const { error: dbErr } = await supabase.from('photos').insert({
        site_id:      site.id,
        checklist_id: null,
        installer_id: profileId,
        storage_path: filePath,
      });

      if (dbErr) {
        // Roll back the orphaned storage file so storage stays clean.
        void supabase.storage.from('site-photos').remove([filePath]);
        throw new Error(`[2/3] DB klaida (failas pašalintas iš saugyklos): ${toMsg(dbErr)}`);
      }
      console.log('[Photo] Step 2/3 ✓ — photos row inserted');

      // ── Step 3 / 3: Update checklist item (skip for gallery uploads) ────
      if (itemId !== GALLERY_ID) {
        const { error: itemErr } = await supabase
          .from('site_checklist_items')
          .update({ photo_url: filePath, status: 'pass' })
          .eq('id', itemId);

        if (itemErr) {
          // Photo + DB are already consistent — the photo IS uploaded and visible.
          // Treat this as a non-fatal warning so the installer is not misled by
          // a full error when the important part (storage + photos row) succeeded.
          const warnMsg = `[3/3] Checklist elemento atnaujinimas nepavyko: ${toMsg(itemErr)}`;
          console.warn('[Photo]', warnMsg);
          Sentry.captureException(new Error(warnMsg), {
            extra: { context: 'Checklist item update failed after successful upload', siteId, itemId, filePath },
          });
          // Still surface the photo in the UI.
          void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
          toast.warning('Nuotrauka įkelta, tačiau checklist statusas neatnaujintas.');
          return;
        }
        console.log('[Photo] Step 3/3 ✓ — checklist item updated');
      }

      // ── All steps succeeded ──────────────────────────────────────────────
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      toast.success('Nuotrauka sėkmingai įkelta!');
    } catch (err) {
      const msg = toMsg(err);
      console.error('[Photo] Upload pipeline failed:', msg);
      Sentry.captureException(err instanceof Error ? err : new Error(msg), {
        extra: { context: 'Photo upload pipeline', siteId, itemId, filePath },
      });
      // Show the exact step that failed — no more generic "Klaida" messages.
      toast.error(`Klaida įkeliant nuotrauką: ${msg}`);
    } finally {
      // Always reset state and release the sync lock, regardless of outcome.
      setUploadingCheckId(null);
      finishSync();
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDeletePhoto = async (
    selectedPhoto: { photo: SitePhoto; checkId: string } | null,
    onResetSelection: () => void,
  ) => {
    if (!selectedPhoto) return;

    try {
      // Step 1: remove from storage
      const { error: storageErr } = await supabase.storage
        .from('site-photos')
        .remove([selectedPhoto.photo.storage_path]);
      if (storageErr) throw new Error(`Saugyklos klaida: ${toMsg(storageErr)}`);

      // Step 2: delete photos row
      const { error: dbErr } = await supabase
        .from('photos')
        .delete()
        .eq('id', selectedPhoto.photo.id);
      if (dbErr) throw new Error(`DB klaida: ${toMsg(dbErr)}`);

      // Step 3: clear checklist item reference (best-effort; don't fail the
      // delete if the checklist item no longer exists or is inaccessible)
      if (selectedPhoto.checkId && selectedPhoto.checkId !== GALLERY_ID) {
        const { error: itemErr } = await supabase
          .from('site_checklist_items')
          .update({ photo_url: null, status: 'pending' })
          .eq('id', selectedPhoto.checkId);
        if (itemErr) {
          console.warn('[Photo] Checklist item reset failed (non-fatal):', toMsg(itemErr));
        }
      }

      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      onResetSelection();
      toast.success('Nuotrauka ištrinta.');
    } catch (err) {
      const msg = toMsg(err);
      console.error('[Photo] Delete failed:', msg);
      Sentry.captureException(err instanceof Error ? err : new Error(msg), {
        extra: { context: 'Photo delete pipeline', siteId },
      });
      toast.error(`Klaida ištrinant nuotrauką: ${msg}`);
    }
  };

  return { compressingCheckId, uploadingCheckId, handleUploadPhoto, handleDeletePhoto };
}
