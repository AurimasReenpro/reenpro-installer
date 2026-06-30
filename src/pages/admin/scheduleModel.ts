import { isBatteryCategory, parseEquipmentDetails } from '../../types/equipment.types';

export const SCHEDULE_OBJECT_COUNT_OVERLOAD_THRESHOLD = 2;
export const SCHEDULE_KWP_OVERLOAD_THRESHOLD = 20;

export interface ScheduleSummarySite {
  kwp: number | null;
  kwh: number | null;
  system_type?: string | null;
  equipment_details?: unknown;
}

export interface ScheduleCellSummary {
  objectCount: number;
  totalKwp: number | null;
  bessCount: number;
  bessCapacityKwh: number | null;
  optimizerCount: number;
  label: string;
}

type RawEquipmentItem = Record<string, unknown>;

const CAPACITY_FIELDS = [
  'battery_capacity_kwh',
  'bess_capacity_kwh',
  'capacity_kwh',
  'batteryCapacityKwh',
  'capacityKwh',
] as const;
const TOTAL_CAPACITY_FIELDS = [
  'total_battery_capacity_kwh',
  'totalBatteryCapacityKwh',
] as const;

function toPositiveNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function rawEquipmentItems(rawEquipment: unknown): RawEquipmentItem[] {
  return Array.isArray(rawEquipment)
    ? rawEquipment.filter((item): item is RawEquipmentItem => !!item && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function optimizerCount(rawEquipment: unknown): number {
  return parseEquipmentDetails(rawEquipment).reduce((count, item) => {
    const haystack = `${item.category} ${item.model}`.toLowerCase();
    if (!haystack.includes('optim')) return count;
    return count + (Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 0);
  }, 0);
}

function batteryRows(rawEquipment: unknown) {
  const parsed = parseEquipmentDetails(rawEquipment);
  const raw = rawEquipmentItems(rawEquipment);

  return parsed
    .map((item, index) => ({ item, raw: raw[index] ?? {} }))
    .filter(({ item }) => isBatteryCategory(item.category));
}

function siteHasBess(site: ScheduleSummarySite): boolean {
  return (site.kwh ?? 0) > 0
    || (site.system_type ?? '').toUpperCase().includes('BESS')
    || batteryRows(site.equipment_details).length > 0;
}

function siteBessCount(site: ScheduleSummarySite): number {
  const rows = batteryRows(site.equipment_details);
  if (rows.length === 0) return siteHasBess(site) ? 1 : 0;

  return rows.reduce((count, { item, raw }) => {
    const quantity = toPositiveNumber(raw.quantity) ?? (Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1);
    return count + quantity;
  }, 0);
}

function rowCapacityKwh(raw: RawEquipmentItem, quantity: number): number | null {
  const total = TOTAL_CAPACITY_FIELDS
    .map((field) => toPositiveNumber(raw[field]))
    .find((value): value is number => value != null);
  if (total != null) return total;

  const perUnit = CAPACITY_FIELDS
    .map((field) => toPositiveNumber(raw[field]))
    .find((value): value is number => value != null);
  return perUnit != null ? perUnit * quantity : null;
}

function siteBessCapacityKwh(site: ScheduleSummarySite): number | null {
  const siteTotal = toPositiveNumber(site.kwh);
  if (siteTotal != null) return siteTotal;

  const capacities = batteryRows(site.equipment_details)
    .map(({ item, raw }) => {
      const quantity = toPositiveNumber(raw.quantity) ?? (Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1);
      return rowCapacityKwh(raw, quantity);
    })
    .filter((value): value is number => value != null);

  return capacities.length > 0 ? capacities.reduce((sum, value) => sum + value, 0) : null;
}

function fmtKwp(value: number): string {
  return `${Math.round(value * 10) / 10}`;
}

function fmtCompactNumber(value: number, digits: number): string {
  return `${+value.toFixed(digits)}`;
}

function formatBessCapacityLabel(capacityKwh: number | null): string | null {
  return capacityKwh != null ? `${fmtCompactNumber(capacityKwh, 2)} kWh` : null;
}

export function buildScheduleCellSummary(sites: ScheduleSummarySite[]): ScheduleCellSummary {
  const kwpValues = sites
    .map((site) => site.kwp)
    .filter((kwp): kwp is number => typeof kwp === 'number' && Number.isFinite(kwp));
  const totalKwp = kwpValues.length > 0
    ? kwpValues.reduce((sum, kwp) => sum + kwp, 0)
    : null;
  const bessCount = sites.reduce((sum, site) => sum + siteBessCount(site), 0);
  const bessCapacityValues = sites
    .map(siteBessCapacityKwh)
    .filter((value): value is number => value != null);
  const bessCapacityKwh = bessCapacityValues.length > 0
    ? bessCapacityValues.reduce((sum, value) => sum + value, 0)
    : null;
  const optCount = sites.reduce((sum, site) => sum + optimizerCount(site.equipment_details), 0);

  const parts: string[] = [];
  if (sites.length > 0) parts.push(`${sites.length} obj.`);
  if (totalKwp != null) parts.push(`${fmtKwp(totalKwp)} kWp`);
  const bessCapacityLabel = formatBessCapacityLabel(bessCapacityKwh);
  if (bessCapacityLabel) parts.push(bessCapacityLabel);
  if (optCount > 0) parts.push(`${optCount} opt.`);

  return {
    objectCount: sites.length,
    totalKwp,
    bessCount,
    bessCapacityKwh,
    optimizerCount: optCount,
    label: parts.join(' · '),
  };
}

export function buildScheduleSiteEquipmentSummary(site: ScheduleSummarySite): string {
  const parts: string[] = [
    site.kwp != null && Number.isFinite(site.kwp) ? `${fmtCompactNumber(site.kwp, 2)} kWp` : '— kWp',
  ];
  const bessCapacityLabel = formatBessCapacityLabel(siteBessCapacityKwh(site));
  if (bessCapacityLabel) parts.push(bessCapacityLabel);
  return parts.join(' · ');
}

export function isScheduleCellOverloaded(summary: ScheduleCellSummary): boolean {
  return summary.objectCount > SCHEDULE_OBJECT_COUNT_OVERLOAD_THRESHOLD
    || (summary.totalKwp ?? 0) > SCHEDULE_KWP_OVERLOAD_THRESHOLD;
}
