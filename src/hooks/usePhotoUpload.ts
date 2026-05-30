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
    // Lighter than before (1600px / 0.4MB) to keep the per-image canvas memory
    // down — uploading several large phone photos in a row can otherwise spike
    // RAM enough for Android to kill & reload the page.
    maxSizeMB: 0.4,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.8,
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

  // Upload a single already-compressed file: storage + photos row. Returns the
  // storage path on success, or throws with a step-tagged message.
  const uploadOne = async (
    file: File,
    itemId: string,
    sectionName: string | undefined,
  ): Promise<string> => {
    const fileExt = file.name.split('.').pop() ?? 'jpg';
    const filePath = `${site!.id}/${itemId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

    // ── Step 1: Storage upload ──────────────────────────────────────────────
    const { error: storageErr } = await supabase.storage
      .from('site-photos')
      .upload(filePath, file);
    if (storageErr) throw new Error(`[1/2] Saugyklos klaida: ${toMsg(storageErr)}`);

    // ── Step 2: Insert photos row ───────────────────────────────────────────
    const { error: dbErr } = await supabase.from('photos').insert({
      site_id:      site!.id,
      checklist_id: null,
      installer_id: profileId!,
      storage_path: filePath,
      section_name: sectionName ?? null,
    });
    if (dbErr) {
      // Roll back the orphaned storage file so storage stays clean.
      void supabase.storage.from('site-photos').remove([filePath]);
      throw new Error(`[2/2] DB klaida (failas pašalintas iš saugyklos): ${toMsg(dbErr)}`);
    }
    return filePath;
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUploadPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    itemId: string,
    sectionName?: string,
  ) => {
    const input = e.target;
    // Multi-select: upload EVERY chosen image. The gallery input has no `accept`
    // filter (to keep Android multi-select working), so ignore non-image files.
    const files = Array.from(input.files ?? []).filter(f => f.type.startsWith('image/'));
    if (files.length === 0 || !profileId || !site) {
      input.value = '';
      return;
    }

    const { startSync, finishSync } = useSyncStore.getState();
    startSync();

    let lastPath: string | null = null;
    let succeeded = 0;

    try {
      // Sequentially compress + upload each file (keeps the compress web worker
      // and storage from being hammered by a large batch).
      for (const file of files) {
        setCompressingCheckId(itemId);
        let fileToUpload: File;
        try {
          fileToUpload = await compress(file);
        } catch (compErr) {
          console.warn('[Photo] Compression failed, using original file:', toMsg(compErr));
          fileToUpload = file;
        } finally {
          setCompressingCheckId(null);
        }

        setUploadingCheckId(itemId);
        try {
          lastPath = await uploadOne(fileToUpload, itemId, sectionName);
          succeeded += 1;
        } catch (oneErr) {
          // One file failing shouldn't abort the rest of the batch.
          console.error('[Photo] One upload failed:', toMsg(oneErr));
          Sentry.captureException(oneErr instanceof Error ? oneErr : new Error(toMsg(oneErr)), {
            extra: { context: 'Photo upload (single in batch)', siteId, itemId },
          });
        }
        // Yield between files so the browser can paint and release the transient
        // compression canvas before the next image — keeps mobile memory flat.
        await new Promise(r => setTimeout(r, 0));
      }

      if (succeeded === 0) {
        toast.error('Nepavyko įkelti nuotraukų.');
        return;
      }

      // ── Update checklist item once (skip for gallery uploads) ──────────────
      if (itemId !== GALLERY_ID && lastPath) {
        const { error: itemErr } = await supabase
          .from('site_checklist_items')
          .update({ photo_url: lastPath, status: 'pass' })
          .eq('id', itemId);

        if (itemErr) {
          // Photos are already uploaded & visible — non-fatal.
          const warnMsg = `Checklist elemento atnaujinimas nepavyko: ${toMsg(itemErr)}`;
          console.warn('[Photo]', warnMsg);
          Sentry.captureException(new Error(warnMsg), {
            extra: { context: 'Checklist item update failed after successful upload', siteId, itemId, lastPath },
          });
          void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
          toast.warning('Nuotraukos įkeltos, tačiau checklist statusas neatnaujintas.');
          return;
        }
      }

      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      const failed = files.length - succeeded;
      if (failed > 0) {
        toast.warning(`Įkelta ${succeeded} iš ${files.length} nuotraukų.`);
      } else {
        toast.success(succeeded > 1 ? `Įkeltos ${succeeded} nuotraukos!` : 'Nuotrauka sėkmingai įkelta!');
      }
    } finally {
      // Always reset state, clear the input and release the sync lock.
      setCompressingCheckId(null);
      setUploadingCheckId(null);
      input.value = '';
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
