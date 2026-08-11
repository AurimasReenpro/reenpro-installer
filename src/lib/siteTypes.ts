export const SITE_TYPES = ['b2c', 'b2b', 'service'] as const;
export type SiteType = (typeof SITE_TYPES)[number];

export const DEFAULT_SITE_TYPE: SiteType = 'b2c';

export const SITE_TYPE_OPTIONS: { value: SiteType; label: string }[] = [
  { value: 'b2c', label: 'B2C' },
  { value: 'b2b', label: 'B2B' },
  { value: 'service', label: 'Servisas' },
];

export const REQUIRED_CHECKLIST_CATEGORY_TABS = ['B2C', 'B2B', 'Servisas'] as const;

const SITE_TYPE_CATEGORIES: Record<SiteType, string[]> = {
  b2c: ['b2c'],
  b2b: ['b2b'],
  service: ['servisas', 'service'],
};

export interface ChecklistTemplateLike {
  id: string;
  category: string | null;
  phase: string | null;
  requires_photo: boolean | null;
}

export interface ChecklistTemplateGroup {
  category: string;
  label: string;
  itemCount: number;
  requiresPhotoCount: number;
  phases: string[];
}

export function normalizeSiteType(value: string | null | undefined): SiteType {
  return SITE_TYPES.includes(value as SiteType) ? (value as SiteType) : DEFAULT_SITE_TYPE;
}

export function siteTypeLabel(siteType: string | null | undefined): string {
  const normalized = normalizeSiteType(siteType);
  return SITE_TYPE_OPTIONS.find((option) => option.value === normalized)?.label ?? 'B2C';
}

export function normalizeChecklistCategory(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function categoryMatchesSiteType(category: string | null | undefined, siteType: SiteType): boolean {
  const normalized = normalizeChecklistCategory(category);
  return SITE_TYPE_CATEGORIES[siteType].includes(normalized);
}

export function checklistCategoryMatchesFilter(
  category: string | null | undefined,
  filter: string,
): boolean {
  if (filter === 'Visi') return true;
  if (filter === 'B2C') return categoryMatchesSiteType(category, 'b2c');
  if (filter === 'B2B') return categoryMatchesSiteType(category, 'b2b');
  if (filter === 'Servisas') return categoryMatchesSiteType(category, 'service');
  return normalizeChecklistCategory(category) === normalizeChecklistCategory(filter);
}

export function groupChecklistTemplatesForSiteType(
  templates: ChecklistTemplateLike[],
  siteType: SiteType,
): ChecklistTemplateGroup[] {
  const groups = new Map<string, ChecklistTemplateGroup>();

  for (const template of templates) {
    if (!categoryMatchesSiteType(template.category, siteType) || !template.category) continue;

    const key = normalizeChecklistCategory(template.category);
    const existing = groups.get(key);
    if (existing) {
      existing.itemCount += 1;
      if (template.requires_photo) existing.requiresPhotoCount += 1;
      if (template.phase && !existing.phases.includes(template.phase)) existing.phases.push(template.phase);
      continue;
    }

    groups.set(key, {
      category: template.category,
      label: template.category,
      itemCount: 1,
      requiresPhotoCount: template.requires_photo ? 1 : 0,
      phases: template.phase ? [template.phase] : [],
    });
  }

  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'lt'));
}

export function buildSiteTypeUpdate(siteType: SiteType): { site_type: SiteType } {
  return { site_type: siteType };
}
