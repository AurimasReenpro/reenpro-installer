export interface B2BWorkCategory {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface B2BWorkCategoryInput {
  code?: string;
  label: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface B2BWorkCategoryReorderItem {
  id: string;
  sort_order: number;
}

export const DEFAULT_B2B_WORK_CATEGORIES: Array<Pick<B2BWorkCategory, 'code' | 'label' | 'sort_order'>> = [
  { code: 'dc_install', label: 'DC montavimas', sort_order: 10 },
  { code: 'ballast', label: 'Balasto dėjimas', sort_order: 20 },
  { code: 'cable_trays', label: 'Lovelių montavimas', sort_order: 30 },
  { code: 'modules', label: 'Modulių montavimas', sort_order: 40 },
  { code: 'inverters', label: 'Inverteriai', sort_order: 50 },
  { code: 'commissioning', label: 'Paleidimas / patikra', sort_order: 60 },
];

export function normalizeB2BWorkCategoryCode(value: string): string {
  const code = value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return code || 'b2b_darbas';
}

export function sortB2BWorkCategories<T extends Pick<B2BWorkCategory, 'label' | 'sort_order'>>(categories: T[]): T[] {
  return [...categories].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, 'lt'));
}

export function filterActiveB2BWorkCategories<T extends Pick<B2BWorkCategory, 'is_active'>>(categories: T[]): T[] {
  return categories.filter((category) => category.is_active);
}

export function getB2BWorkCategoryLabel(
  categories: Pick<B2BWorkCategory, 'id' | 'code' | 'label'>[],
  idOrCode: string | null | undefined,
  fallback = '-',
): string {
  if (!idOrCode) return fallback;
  return categories.find((category) => category.id === idOrCode || category.code === idOrCode)?.label ?? fallback;
}

export function buildB2BWorkCategoryInsertPayload(input: B2BWorkCategoryInput) {
  const label = input.label.trim();
  return {
    code: normalizeB2BWorkCategoryCode(input.code || label),
    label,
    description: input.description?.trim() || null,
    sort_order: input.sort_order ?? 0,
    is_active: input.is_active ?? true,
  };
}

export function buildB2BWorkCategoryUpdatePayload(input: Partial<B2BWorkCategoryInput>) {
  return {
    ...(input.code !== undefined ? { code: normalizeB2BWorkCategoryCode(input.code) } : {}),
    ...(input.label !== undefined ? { label: input.label.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
    ...(input.sort_order !== undefined ? { sort_order: input.sort_order } : {}),
    ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
  };
}

export function buildDeactivateB2BWorkCategoryPayload() {
  return { is_active: false };
}

export function buildB2BWorkCategoryReorderPayload(items: B2BWorkCategoryReorderItem[]) {
  return items.map((item) => ({
    id: item.id,
    sort_order: item.sort_order,
  }));
}
