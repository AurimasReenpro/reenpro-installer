import type { SiteChecklist, SitePhoto } from '../types/site.types';
import type { PhaseTimeSummary, WorkPhase } from './workPhases';

export interface ChecklistTemplateWorkPhase {
  id: string;
  category: string;
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface PhotoRequirement {
  requiresPhoto: boolean;
  minPhotoCount: number;
}

export interface ChecklistPhaseGroup {
  phaseId: string | null;
  label: string;
  sortOrder: number;
  items: SiteChecklist[];
}

export interface ChecklistWorkCardSummary extends ChecklistPhaseGroup {
  code: string | null;
  isActive: boolean;
  totalHours: number;
  entryCount: number;
  openEntryCount: number;
  completedCount: number;
  totalCount: number;
  missingPhotoCount: number;
}

export function normalizePhotoRequirement(
  requiresPhoto: boolean | null | undefined,
  minPhotoCount: number | null | undefined,
): PhotoRequirement {
  const min = Math.max(0, Math.trunc(minPhotoCount ?? 0));
  if (!requiresPhoto) return { requiresPhoto: false, minPhotoCount: 0 };
  return { requiresPhoto: true, minPhotoCount: Math.max(1, min) };
}

export function requiredPhotoCount(
  item: Pick<SiteChecklist, 'requires_photo' | 'min_photo_count' | 'is_required'>,
): number {
  const requiresPhoto = item.requires_photo ?? item.is_required;
  return normalizePhotoRequirement(requiresPhoto, item.min_photo_count).minPhotoCount;
}

type ChecklistPhotoLike = Pick<SitePhoto, 'storage_path' | 'site_checklist_item_id'>;

export function photosForChecklistItem<T extends ChecklistPhotoLike>(itemId: string, photos: T[]): T[] {
  return photos.filter(
    (photo) => photo.site_checklist_item_id === itemId || photo.storage_path.includes(`/${itemId}/`),
  );
}

export function checklistItemPhotoCount(item: SiteChecklist, photos: SitePhoto[], pendingCount = 0): number {
  return photosForChecklistItem(item.id, photos).length + pendingCount;
}

export function canCompleteChecklistItemWithPhotos(
  item: SiteChecklist,
  photos: SitePhoto[],
  pendingCount = 0,
): boolean {
  const needed = requiredPhotoCount(item);
  if (needed === 0 || item.status === 'n_a') return true;
  return checklistItemPhotoCount(item, photos, pendingCount) >= needed;
}

export function groupChecklistItemsByWorkPhase(
  items: SiteChecklist[],
  phases: Pick<WorkPhase, 'id' | 'label' | 'sort_order'>[],
  preferredPhaseId?: string | null,
): ChecklistPhaseGroup[] {
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
  const groups = new Map<string, ChecklistPhaseGroup>();

  for (const phase of phases) {
    groups.set(phase.id, {
      phaseId: phase.id,
      label: phase.label,
      sortOrder: phase.sort_order,
      items: [],
    });
  }

  for (const item of items) {
    const phase = item.work_phase_id ? phaseById.get(item.work_phase_id) : null;
    const key = phase?.id ?? '__unassigned__';
    const existing = groups.get(key) ?? {
      phaseId: phase?.id ?? null,
      label: phase?.label ?? 'Papildomi darbai',
      sortOrder: phase?.sort_order ?? Number.MAX_SAFE_INTEGER,
      items: [],
    };
    existing.items.push(item);
    groups.set(key, existing);
  }

  return [...groups.values()]
    .filter((group) => group.items.length > 0)
    .sort((a, b) => {
      if (preferredPhaseId && a.phaseId === preferredPhaseId) return -1;
      if (preferredPhaseId && b.phaseId === preferredPhaseId) return 1;
      return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'lt');
    });
}

export function buildChecklistWorkCardSummaries(
  items: SiteChecklist[],
  phases: Pick<WorkPhase, 'id' | 'code' | 'label' | 'sort_order' | 'is_active'>[],
  photos: ChecklistPhotoLike[],
  timeSummaries: Pick<PhaseTimeSummary, 'phaseId' | 'code' | 'label' | 'sortOrder' | 'isActive' | 'totalHours' | 'entryCount' | 'openEntryCount'>[] = [],
): ChecklistWorkCardSummary[] {
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
  const timeByPhaseId = new Map(timeSummaries.map((summary) => [summary.phaseId, summary]));
  const cards = new Map<string, ChecklistWorkCardSummary>();

  const upsertCard = (phaseId: string | null, fallback?: Partial<ChecklistWorkCardSummary>) => {
    const key = phaseId ?? '__unassigned__';
    const phase = phaseId ? phaseById.get(phaseId) : null;
    const time = timeByPhaseId.get(phaseId);
    const existing = cards.get(key);
    if (existing) return existing;

    const card: ChecklistWorkCardSummary = {
      phaseId,
      code: phase?.code ?? time?.code ?? fallback?.code ?? null,
      label: phase?.label ?? time?.label ?? fallback?.label ?? 'Papildomi darbai',
      sortOrder: phase?.sort_order ?? time?.sortOrder ?? fallback?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      isActive: phase?.is_active ?? time?.isActive ?? fallback?.isActive ?? false,
      totalHours: time?.totalHours ?? fallback?.totalHours ?? 0,
      entryCount: time?.entryCount ?? fallback?.entryCount ?? 0,
      openEntryCount: time?.openEntryCount ?? fallback?.openEntryCount ?? 0,
      completedCount: 0,
      totalCount: 0,
      missingPhotoCount: 0,
      items: [],
    };
    cards.set(key, card);
    return card;
  };

  for (const phase of phases) upsertCard(phase.id);
  for (const time of timeSummaries) {
    if (time.phaseId && !phaseById.has(time.phaseId)) {
      upsertCard(time.phaseId, {
        code: time.code,
        label: time.label,
        sortOrder: time.sortOrder,
        isActive: time.isActive,
        totalHours: time.totalHours,
        entryCount: time.entryCount,
        openEntryCount: time.openEntryCount,
      });
    }
  }

  for (const item of items) {
    const card = upsertCard(item.work_phase_id ?? null);
    card.items.push(item);
    card.totalCount += 1;
    if (item.status === 'pass') card.completedCount += 1;

    const needed = requiredPhotoCount(item);
    if (
      needed > 0
      && item.status !== 'n_a'
      && photosForChecklistItem(item.id, photos).length < needed
    ) {
      card.missingPhotoCount += 1;
    }
  }

  return [...cards.values()]
    .filter((card) => card.items.length > 0 || card.entryCount > 0 || phases.some((phase) => phase.id === card.phaseId))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'lt'));
}
