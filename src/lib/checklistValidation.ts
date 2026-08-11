import type { SiteChecklist, SitePhoto } from '../types/site.types';
import { photosForChecklistItem, requiredPhotoCount } from './checklistTemplatePhases';

/**
 * Result of gating a job for completion. `valid` is true only when every rule
 * passes; the arrays describe exactly what is blocking so the UI can list the
 * reasons. `messages` is a ready-to-render Lithuanian summary per failed rule.
 */
export interface JobCompletionValidation {
  valid: boolean;
  /** Items still in the `pending` state (Laukia). */
  pendingItems: SiteChecklist[];
  /** Items marked `fail` (Neatlikta) — these block completion. */
  failedItems: SiteChecklist[];
  /** Required items (not `n_a`) that have no photo evidence attached. */
  missingPhotoItems: SiteChecklist[];
  /** Human-readable Lithuanian reasons, one per failed rule. */
  messages: string[];
}

function itemPhotoCount(item: SiteChecklist, photos: SitePhoto[]): number {
  const linkedPhotos = photosForChecklistItem(item.id, photos);
  return linkedPhotos.length > 0 ? linkedPhotos.length : (item.photo_url ? 1 : 0);
}

/**
 * Gate a site's checklist before allowing "Užbaigti darbą".
 *
 * Rules:
 *  1. Every item must be `pass` (Atlikta) or `n_a` (Netaikoma). Any `pending`
 *     (Laukia) or `fail` (Neatlikta) item blocks completion.
 *  2. Every required item (`is_required`, unless it is `n_a`) must have at
 *     least one photo attached as proof.
 *
 * (Annotation "open/critical" gating — audit Rule 3 — is intentionally omitted:
 *  the schema does not track per-annotation status, so there is nothing to check.)
 */
export function validateJobCompletion(
  items: SiteChecklist[],
  photos: SitePhoto[],
): JobCompletionValidation {
  const pendingItems = items.filter((i) => (i.status ?? 'pending') === 'pending');
  const failedItems = items.filter((i) => i.status === 'fail');

  // n_a items are exempt from the photo requirement (the task isn't applicable).
  const missingPhotoItems = items.filter((i) => {
    const needed = requiredPhotoCount(i);
    return needed > 0 && i.status !== 'n_a' && itemPhotoCount(i, photos) < needed;
  });

  const messages: string[] = [];
  if (pendingItems.length > 0) {
    messages.push(`${pendingItems.length} punktas (-ai) nepažymėti (Laukia).`);
  }
  if (failedItems.length > 0) {
    messages.push(`${failedItems.length} punktas (-ai) pažymėti kaip neatlikti.`);
  }
  if (missingPhotoItems.length > 0) {
    const names = missingPhotoItems.map((i) => i.question_text).join(', ');
    messages.push(`Trūksta ${missingPhotoItems.length} privalomos (-ų) nuotraukos (-ų): ${names}.`);
  }

  return {
    valid: pendingItems.length === 0 && failedItems.length === 0 && missingPhotoItems.length === 0,
    pendingItems,
    failedItems,
    missingPhotoItems,
    messages,
  };
}
