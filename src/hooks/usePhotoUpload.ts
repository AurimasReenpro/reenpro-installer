import { useState } from 'react';
import { useQueryClient, onlineManager } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import * as Sentry from '@sentry/react';
import type { SiteDetailData } from '../types/site.types';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';
import { useSyncStore } from '../stores/useSyncStore';
import { enqueuePhoto } from '../lib/photoOutbox';

type SitePhoto = SiteDetailData['photos'][number];

// Gallery uploads are not tied to a specific checklist item.
const GALLERY_ID = 'gallery';

function tempId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function compress(file: File): Promise<File> {
  if (file.size < 500 * 1024) return file;
  return imageCompression(file, {
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
  // inserted photos row (so callers can append it straight into the cache
  // instead of triggering a full site refetch).
  const uploadOne = async (
    file: File,
    itemId: string,
    sectionName: string | undefined,
  ): Promise<SitePhoto> => {
    const fileExt = file.name.split('.').pop() ?? 'jpg';
    const filePath = `${site!.id}/${itemId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

    const { error: storageErr } = await supabase.storage
      .from('site-photos')
      .upload(filePath, file);
    if (storageErr) throw new Error(`[1/2] Saugyklos klaida: ${toMsg(storageErr)}`);

    const { data: row, error: dbErr } = await supabase.from('photos').insert({
      site_id:      site!.id,
      checklist_id: null,
      installer_id: profileId!,
      storage_path: filePath,
      section_name: sectionName ?? null,
      site_checklist_item_id: itemId === GALLERY_ID ? null : itemId,
    }).select('*').single();
    if (dbErr || !row) {
      void supabase.storage.from('site-photos').remove([filePath]);
      throw new Error(`[2/2] DB klaida (failas pašalintas iš saugyklos): ${toMsg(dbErr)}`);
    }
    return row;
  };

  // ── Cache helpers — patch the cached site graph directly so a new photo shows
  // instantly WITHOUT invalidating ['site'] (which would refetch the whole heavy
  // query + re-sign every URL, causing the slow flicker / "reload" feel).
  const appendPhotosToCache = (rows: SitePhoto[]) => {
    if (rows.length === 0) return;
    queryClient.setQueryData<SiteDetailData>(['site', siteId], (old) =>
      old ? { ...old, photos: [...old.photos, ...rows] } : old,
    );
  };

  const patchChecklistItem = (itemId: string, patch: { status?: 'pass'; photo_url?: string | null }) => {
    queryClient.setQueryData<SiteDetailData>(['site', siteId], (old) => {
      if (!old) return old;
      return {
        ...old,
        site_checklists: old.site_checklists.map((cl) => ({
          ...cl,
          site_checklist_items: cl.site_checklist_items.map((it) =>
            it.id === itemId ? { ...it, ...patch } : it,
          ),
        })),
      };
    });
  };

  // Persist a compressed file to the durable IndexedDB outbox for later upload.
  const queueOne = async (file: File, itemId: string, sectionName: string | undefined) => {
    await enqueuePhoto({
      id: tempId(),
      siteId: site!.id,
      itemId,
      sectionName: sectionName ?? null,
      installerId: profileId!,
      fileName: file.name,
      blob: file,
      createdAt: Date.now(),
    });
  };

  // Optimistically flip a checklist item to 'pass' in the cached site so the
  // checkmark shows immediately even when the photo is only queued locally.
  const optimisticallyMarkPass = (itemId: string) => {
    queryClient.setQueryData<SiteDetailData>(['site', siteId], (old) => {
      if (!old) return old;
      return {
        ...old,
        site_checklists: old.site_checklists.map((cl) => ({
          ...cl,
          site_checklist_items: cl.site_checklist_items.map((it) =>
            it.id === itemId ? { ...it, status: 'pass' as const } : it,
          ),
        })),
      };
    });
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUploadPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    itemId: string,
    sectionName?: string,
  ) => {
    const input = e.target;
    const files = Array.from(input.files ?? []).filter(f => f.type.startsWith('image/'));
    if (files.length === 0 || !profileId || !site) {
      input.value = '';
      return;
    }
    // Hard guard: a completed site is read-only (the UI hides the controls; this
    // blocks any sneaky/queued path too).
    if (site.status === 'completed') {
      input.value = '';
      toast.error('Objektas užbaigtas — redaguoti negalima.');
      return;
    }

    const { startSync, finishSync } = useSyncStore.getState();
    startSync();

    let lastPath: string | null = null;
    let uploaded = 0;
    let queued = 0;

    try {
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

        if (onlineManager.isOnline()) {
          // Online: try the direct upload; on a network/poor-connection failure,
          // fall back to the durable queue rather than losing the photo.
          setUploadingCheckId(itemId);
          try {
            const row = await uploadOne(fileToUpload, itemId, sectionName);
            lastPath = row.storage_path;
            // Append to the cache as each one lands so it shows immediately.
            appendPhotosToCache([row]);
            uploaded += 1;
          } catch (oneErr) {
            console.warn('[Photo] Direct upload failed, queueing:', toMsg(oneErr));
            await queueOne(fileToUpload, itemId, sectionName);
            queued += 1;
          } finally {
            setUploadingCheckId(null);
          }
        } else {
          // Offline: straight to the durable queue.
          await queueOne(fileToUpload, itemId, sectionName);
          queued += 1;
        }

        await new Promise(r => setTimeout(r, 0));
      }

      // Online success → flag the checklist item (legacy column + status). We
      // patch the cache directly (no ['site'] invalidate → no refetch flicker).
      if (itemId !== GALLERY_ID && uploaded > 0 && lastPath) {
        patchChecklistItem(itemId, { photo_url: lastPath, status: 'pass' });
        const { error: itemErr } = await supabase
          .from('site_checklist_items')
          .update({ photo_url: lastPath, status: 'pass' })
          .eq('id', itemId);
        if (itemErr) {
          const warnMsg = `Checklist elemento atnaujinimas nepavyko: ${toMsg(itemErr)}`;
          console.warn('[Photo]', warnMsg);
          Sentry.captureException(new Error(warnMsg), {
            extra: { context: 'Checklist item update failed after upload', siteId, itemId, lastPath },
          });
        }
      }

      // Queued for a checklist item → optimistically mark it done locally.
      if (itemId !== GALLERY_ID && queued > 0) {
        optimisticallyMarkPass(itemId);
      }

      // IMPORTANT: do NOT invalidate ['site'] here — the cache was already
      // patched above, so a refetch would only cause the slow flicker. Only the
      // lightweight photo-outbox query is refreshed when something was queued.
      if (queued > 0) {
        void queryClient.invalidateQueries({ queryKey: ['photo-outbox', siteId] });
      }

      if (uploaded > 0 && queued === 0) {
        toast.success(uploaded > 1 ? `Įkeltos ${uploaded} nuotraukos!` : 'Nuotrauka sėkmingai įkelta!');
      } else if (queued > 0 && uploaded === 0) {
        toast.info(queued > 1
          ? `${queued} nuotraukos saugomos telefone – bus įkeltos atsiradus ryšiui.`
          : 'Nuotrauka saugoma telefone – bus įkelta atsiradus ryšiui.');
      } else if (uploaded > 0 && queued > 0) {
        toast.info(`Įkelta ${uploaded}, ${queued} saugoma telefone (bus įkelta atsiradus ryšiui).`);
      } else {
        toast.error('Nepavyko apdoroti nuotraukų.');
      }
    } finally {
      setCompressingCheckId(null);
      setUploadingCheckId(null);
      input.value = '';
      finishSync();
    }
  };

  // ── Delete (server photos only) ──────────────────────────────────────────────
  const handleDeletePhoto = async (
    selectedPhoto: { photo: SitePhoto; checkId: string } | null,
    onResetSelection: () => void,
  ) => {
    if (!selectedPhoto) return;

    try {
      const { error: storageErr } = await supabase.storage
        .from('site-photos')
        .remove([selectedPhoto.photo.storage_path]);
      if (storageErr) throw new Error(`Saugyklos klaida: ${toMsg(storageErr)}`);

      const { error: dbErr } = await supabase
        .from('photos')
        .delete()
        .eq('id', selectedPhoto.photo.id);
      if (dbErr) throw new Error(`DB klaida: ${toMsg(dbErr)}`);

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
