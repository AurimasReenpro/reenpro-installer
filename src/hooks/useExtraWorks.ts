import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import * as Sentry from '@sentry/react';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';
import { useSyncStore } from '../stores/useSyncStore';
import { MUTATION_KEYS, type MaterialAddVars, type MaterialDeleteVars } from '../lib/offlineMutations';

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

export interface NewMaterial {
  name: string;
  quantity: number;
  unit: string;
}

/**
 * Installer-driven extra works & materials.
 *  - createExtraWork: inserts an installer-flagged checklist item (is_extra,
 *    status='pass', phase=null) and uploads its photos to the durable photos
 *    table keyed by `${siteId}/${itemId}/…` (same scheme the WorkTab grid reads).
 *  - addMaterial / deleteMaterial: rows in site_extra_materials.
 * All mutations invalidate ['site', siteId] so the detail query refetches.
 */
export function useExtraWorks(
  siteId: string,
  siteChecklistId: string | undefined,
  profileId: string | undefined,
) {
  const queryClient = useQueryClient();
  const [isCreatingWork, setIsCreatingWork] = useState(false);
  const [deletingWorkId, setDeletingWorkId] = useState<string | null>(null);

  // Materials add/delete go through the offline outbox (keyed mutations whose
  // fn + optimistic updates live in lib/offlineMutations) so they work offline.
  const materialAddMutation = useMutation<void, Error, MaterialAddVars>({ mutationKey: MUTATION_KEYS.materialAdd });
  const materialDeleteMutation = useMutation<void, Error, MaterialDeleteVars>({ mutationKey: MUTATION_KEYS.materialDelete });

  // Upload one already-compressed file: storage + photos row.
  const uploadOne = async (file: File, itemId: string): Promise<void> => {
    const fileExt = file.name.split('.').pop() ?? 'jpg';
    const filePath = `${siteId}/${itemId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

    const { error: storageErr } = await supabase.storage
      .from('site-photos')
      .upload(filePath, file);
    if (storageErr) throw new Error(`Saugyklos klaida: ${toMsg(storageErr)}`);

    const { error: dbErr } = await supabase.from('photos').insert({
      site_id: siteId,
      checklist_id: null,
      installer_id: profileId!,
      storage_path: filePath,
      section_name: 'Papildomi darbai',
    });
    if (dbErr) {
      void supabase.storage.from('site-photos').remove([filePath]);
      throw new Error(`DB klaida: ${toMsg(dbErr)}`);
    }
  };

  /** Create an extra checklist item + upload its photos. Returns true on success. */
  const createExtraWork = async (
    name: string,
    comment: string,
    files: File[],
  ): Promise<boolean> => {
    if (!siteChecklistId) {
      toast.error('Nėra aktyvios checklist sesijos šiam objektui.');
      return false;
    }
    if (!name.trim()) {
      toast.error('Įveskite darbo pavadinimą.');
      return false;
    }
    if (!profileId) {
      toast.error('Vartotojas neatpažintas.');
      return false;
    }

    const { startSync, finishSync } = useSyncStore.getState();
    startSync();
    setIsCreatingWork(true);

    try {
      // 1 ▸ Insert the extra checklist item
      const { data: inserted, error: insertErr } = await supabase
        .from('site_checklist_items')
        .insert({
          site_checklist_id: siteChecklistId,
          question_text: name.trim(),
          comment: comment.trim() || null,
          category: 'Papildomi darbai',
          phase: null,
          is_required: false,
          status: 'pass',
          is_extra: true,
          created_by: profileId,
        })
        .select('id')
        .single();

      if (insertErr || !inserted) {
        throw new Error(toMsg(insertErr) || 'Nepavyko sukurti papildomo darbo.');
      }

      // 2 ▸ Upload photos (sequential, keeps mobile memory flat)
      const images = files.filter((f) => f.type.startsWith('image/'));
      let failed = 0;
      for (const file of images) {
        try {
          const compressed = await compress(file).catch(() => file);
          await uploadOne(compressed, inserted.id);
        } catch (oneErr) {
          failed += 1;
          console.error('[ExtraWork] photo upload failed:', toMsg(oneErr));
          Sentry.captureException(
            oneErr instanceof Error ? oneErr : new Error(toMsg(oneErr)),
            { extra: { context: 'Extra work photo upload', siteId, itemId: inserted.id } },
          );
        }
        await new Promise((r) => setTimeout(r, 0));
      }

      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });

      if (failed > 0) {
        toast.warning(`Darbas pridėtas, bet ${failed} nuotrauk(os) neįkeltos.`);
      } else {
        toast.success('Papildomas darbas pridėtas!');
      }
      return true;
    } catch (err) {
      const msg = toMsg(err);
      console.error('[ExtraWork] create failed:', msg);
      Sentry.captureException(err instanceof Error ? err : new Error(msg), {
        extra: { context: 'Create extra work', siteId },
      });
      toast.error(`Klaida: ${msg}`);
      return false;
    } finally {
      setIsCreatingWork(false);
      finishSync();
    }
  };

  /**
   * Queue a new material (optimistic + offline-safe). Returns true once the row
   * is added to the cache — the actual insert is replayed automatically if the
   * device is offline. A client-side temp id keeps the optimistic row stable
   * until the refetch swaps in the server row.
   */
  const addMaterial = (material: NewMaterial): boolean => {
    if (!material.name.trim()) {
      toast.error('Įveskite medžiagos pavadinimą.');
      return false;
    }
    const tempId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    materialAddMutation.mutate({
      siteId,
      tempId,
      name: material.name.trim(),
      quantity: material.quantity || 1,
      unit: material.unit.trim() || 'vnt.',
      createdBy: profileId ?? null,
    });
    return true;
  };

  /** Queue a material deletion (optimistic + offline-safe). */
  const deleteMaterial = (materialId: string): void => {
    materialDeleteMutation.mutate({ siteId, id: materialId });
  };

  /**
   * Delete an installer-created extra work item and everything attached to it:
   *  1) its photos (storage objects + photos rows, keyed by `${siteId}/${itemId}/…`)
   *  2) any linked extra materials (checklist_item_id = itemId)
   *  3) the site_checklist_items row itself
   * RLS additionally guarantees only is_extra rows created by the caller can be
   * deleted — this UI only ever offers delete on the caller's own extras.
   */
  const deleteExtraWork = async (itemId: string): Promise<void> => {
    setDeletingWorkId(itemId);
    try {
      // 1 ▸ photos linked to this item
      const { data: photoRows, error: photoSelErr } = await supabase
        .from('photos')
        .select('id, storage_path')
        .eq('site_id', siteId)
        .like('storage_path', `${siteId}/${itemId}/%`);
      if (photoSelErr) throw new Error(toMsg(photoSelErr));

      if (photoRows && photoRows.length > 0) {
        const paths = photoRows.map((p) => p.storage_path);
        // Storage removal is best-effort; an orphaned object is harmless vs. a
        // dangling DB row, so we don't abort the delete if it fails.
        const { error: storageErr } = await supabase.storage
          .from('site-photos')
          .remove(paths);
        if (storageErr) console.warn('[ExtraWork] storage cleanup failed:', toMsg(storageErr));

        const { error: photoDelErr } = await supabase
          .from('photos')
          .delete()
          .in('id', photoRows.map((p) => p.id));
        if (photoDelErr) throw new Error(toMsg(photoDelErr));
      }

      // 2 ▸ materials linked to this item
      const { error: matErr } = await supabase
        .from('site_extra_materials')
        .delete()
        .eq('checklist_item_id', itemId);
      if (matErr) throw new Error(toMsg(matErr));

      // 3 ▸ the checklist item itself (RLS enforces is_extra + ownership)
      const { error: itemErr } = await supabase
        .from('site_checklist_items')
        .delete()
        .eq('id', itemId);
      if (itemErr) throw new Error(toMsg(itemErr));

      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      toast.success('Papildomas darbas ištrintas.');
    } catch (err) {
      const msg = toMsg(err);
      console.error('[ExtraWork] delete failed:', msg);
      Sentry.captureException(err instanceof Error ? err : new Error(msg), {
        extra: { context: 'Delete extra work', siteId, itemId },
      });
      toast.error(`Klaida ištrinant: ${msg}`);
    } finally {
      setDeletingWorkId(null);
    }
  };

  return {
    isCreatingWork,
    deletingWorkId,
    createExtraWork,
    addMaterial,
    deleteMaterial,
    deleteExtraWork,
  };
}
