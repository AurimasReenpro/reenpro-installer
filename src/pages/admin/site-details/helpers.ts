import { supabase } from '../../../lib/supabase';
import { isPdf } from '../../../lib/pdf';

// ── Shared photo helpers ──────────────────────────────────────────────────────

/**
 * Derives the relative storage path from either a bare path or a full
 * Supabase storage URL (public or signed).
 *   "abc/def/photo.jpg"                       → "abc/def/photo.jpg"
 *   "https://.../object/public/site-photos/abc/def/photo.jpg"  → "abc/def/photo.jpg"
 */
export function extractStoragePath(value: string): string {
  if (!value.startsWith('http')) return value;
  const match = /site-photos\/([^?]+)/.exec(value);
  return match?.[1] ?? value;
}

/**
 * Force-downloads a signed URL as a file rather than opening it in a new tab.
 * Uses blob + object URL so the browser respects the `download` attribute even
 * for cross-origin URLs.
 */
export async function forceDownload(signedUrl: string, storagePath: string): Promise<void> {
  const fileName = storagePath.split('/').pop() ?? 'photo.jpg';
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

/**
 * Removes a photo from all three locations:
 *  1. `photos` DB table   (matched by storage_path)
 *  2. `site_checklist_items.photo_url` (reset to null / 'pending')
 *  3. `site-photos` storage bucket
 *
 * Pass `checklistItemId` when you know the exact item so the UPDATE is precise;
 * otherwise falls back to matching by the photo_url value.
 */
export async function deletePhotoFromAllSources(
  storagePath: string,
  checklistItemId?: string,
): Promise<void> {
  const { error: dbErr } = await supabase
    .from('photos')
    .delete()
    .eq('storage_path', storagePath);
  if (dbErr) throw new Error(`Įrašo klaida: ${dbErr.message}`);

  if (checklistItemId) {
    await supabase
      .from('site_checklist_items')
      .update({ photo_url: null, status: 'pending' })
      .eq('id', checklistItemId);
  } else {
    await supabase
      .from('site_checklist_items')
      .update({ photo_url: null, status: 'pending' })
      .eq('photo_url', storagePath);
  }

  const { error: storageErr } = await supabase.storage
    .from('site-photos')
    .remove([storagePath]);
  if (storageErr) throw new Error(`Saugyklos klaida: ${storageErr.message}`);
}

// ── File / formatting helpers ─────────────────────────────────────────────────

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
export const isImage = (name: string) => IMAGE_EXTS.includes(name.split('.').pop()?.toLowerCase() ?? '');
export const isPreviewable = (name: string) => isImage(name) || isPdf(name);

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** If an "address" is actually raw "lat, lng", trim each to 4 decimals. */
export function formatLocation(value: string | null | undefined): string {
  if (!value) return '—';
  const m = value.match(/^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
  if (m) return `${parseFloat(m[1] ?? '0').toFixed(4)}, ${parseFloat(m[2] ?? '0').toFixed(4)}`;
  return value;
}
