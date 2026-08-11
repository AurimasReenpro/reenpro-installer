import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';
import type { EquipmentItem } from '../types/equipment.types';
import { isBatteryCategory } from '../types/equipment.types';
import { INSTALLER_VISIBLE_SITE_STATUS_FILTER } from '../lib/siteStatus';
import {
  buildSiteTypeUpdate,
  groupChecklistTemplatesForSiteType,
  normalizeChecklistCategory,
  normalizeSiteType,
  type ChecklistTemplateGroup,
  type SiteType,
} from '../lib/siteTypes';
import { normalizePhotoRequirement } from '../lib/checklistTemplatePhases';

// ── Nominatim geocoding ───────────────────────────────────────────────────────
interface NominatimResult { lat: string; lon: string; }

async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'lt,en', 'User-Agent': 'InstallerApp/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const results = (await res.json()) as NominatimResult[];
    if (!results.length || !results[0]) return null;
    return { latitude: parseFloat(results[0].lat), longitude: parseFloat(results[0].lon) };
  } catch {
    return null;
  }
}

export interface SiteFile {
  name: string;
  url: string;
  size: number;
  updatedAt: string;
}

// ── Fetch single site with team ──────────────────────────────────────────────
export async function getSiteById(id: string) {
  const { data, error } = await supabase
    .from('sites')
    .select('*, team:teams(name), time_entries(*)')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── kWp auto-calculation ──────────────────────────────────────────────────────
/**
 * Scan equipment rows in the "Moduliai" category and extract wattage from the
 * model string (e.g. "Jinko 555W", "Canadian Solar 450Wp").
 * Returns the total installed power in kWp (rounded to 2 dp), or null when no
 * parseable module rows exist.
 */
export function calculateKwpFromEquipment(equipment: EquipmentItem[]): number | null {
  // Matches e.g. "555W", "555Wp", "555.5W" — case-insensitive, optional decimal
  const WATT_RE = /(\d+(?:\.\d+)?)W/i;
  let totalWatts = 0;
  let found = false;

  for (const item of equipment) {
    if (item.category !== 'Moduliai') continue;
    const match = WATT_RE.exec(item.model);
    if (!match?.[1]) continue;
    const w = parseFloat(match[1]);
    if (!isFinite(w) || w <= 0) continue;
    totalWatts += w * item.quantity;
    found = true;
  }

  return found ? parseFloat((totalWatts / 1000).toFixed(2)) : null;
}

/**
 * Auto-rollup of total battery capacity (kWh) from the equipment list — sums the
 * (already total-per-row) capacity_kwh of every energy-storage row. Returns null
 * when there are no battery rows with a capacity, so the site shows no kWh.
 */
export function calculateKwhFromEquipment(equipment: EquipmentItem[]): number | null {
  let total = 0;
  let found = false;
  for (const item of equipment) {
    if (!isBatteryCategory(item.category)) continue;
    const c = item.capacity_kwh;
    if (typeof c === 'number' && isFinite(c) && c > 0) {
      total += c;
      found = true;
    }
  }
  return found ? parseFloat(total.toFixed(2)) : null;
}

// ── Update equipment_details JSONB (new structured array format) ─────────────
export async function updateEquipment(
  id: string,
  equipment: EquipmentItem[]
): Promise<void> {
  // Derive kWp from module rows and persist it alongside the equipment list so
  // the "Techniniai duomenys" card and header badge stay in sync automatically.
  const kwp = calculateKwpFromEquipment(equipment);

  const { error } = await supabase
    .from('sites')
    .update({
      equipment_details: equipment as unknown as Record<string, string>,
      kwp,
    })
    .eq('id', id);

  if (error) throw new Error(error.message);

  // Best-effort battery rollup → sites.kwh. Done as a SEPARATE update so a
  // missing `kwh` column (if the migration hasn't run yet) can never break the
  // primary equipment save.
  const kwh = calculateKwhFromEquipment(equipment);
  const { error: kwhErr } = await supabase
    .from('sites')
    .update({ kwh })
    .eq('id', id);
  if (kwhErr) console.warn('[updateEquipment] kWh rollup skipped:', kwhErr.message);
}

// ── Update site notes and stringing details ────────────────────────────────────
export async function updateSiteDetails(
  id: string,
  data: { notes?: string; stringing_details?: unknown }
): Promise<void> {
  const { error } = await supabase
    .from('sites')
    .update(data)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// ── Storage helpers ──────────────────────────────────────────────────────────
/**
 * Canonical storage bucket for admin site files, blueprints and annotation
 * attachments. Single source of truth — never hardcode the bucket name
 * (underscore spelling; a stray hyphen variant once broke delete-safety).
 */
export const SITE_FILES_BUCKET = 'site_files';
const BUCKET = SITE_FILES_BUCKET;

export async function uploadSiteFile(siteId: string, file: File): Promise<void> {
  const path = `${siteId}/${file.name}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true });

  if (error) throw new Error(error.message);
}

// ── Blueprints (Brėžiniai) ─────────────────────────────────────────────────
// Blueprints live in the site_files bucket under a dynamic prefix so they stay
// hidden from the generic Files tab and can be grouped into custom categories.
//   New:    __blueprint_<hexCategory>__.<ext>
//   Legacy: __dc_schema__.<ext> / __roof_plan__.<ext>
export const BLUEPRINT_PREFIX = '__blueprint_';

// Old fixed-prefix files are mapped back to a human-readable category on read.
const LEGACY_BLUEPRINTS: Record<string, string> = {
  __dc_schema__: 'DC schema',
  __roof_plan__: 'Stogo planas',
};

// The category name is hex-encoded into the filename: hex chars (0-9a-f) are
// always storage-key-safe and round-trip Lithuanian/space characters exactly.
function encodeCategory(name: string): string {
  return Array.from(new TextEncoder().encode(name))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function decodeCategory(hex: string): string {
  const bytes = hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? [];
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** Returns the blueprint category for a file name, or null if it isn't one. */
export function parseBlueprintCategory(fileName: string): string | null {
  for (const [prefix, label] of Object.entries(LEGACY_BLUEPRINTS)) {
    if (fileName.startsWith(prefix)) return label;
  }
  if (fileName.startsWith(BLUEPRINT_PREFIX)) {
    const rest = fileName.slice(BLUEPRINT_PREFIX.length);
    const end = rest.indexOf('__');
    if (end <= 0) return null;
    try {
      return decodeCategory(rest.slice(0, end));
    } catch {
      return null;
    }
  }
  return null;
}

export function isBlueprintFile(fileName: string): boolean {
  return parseBlueprintCategory(fileName) !== null;
}

export interface Blueprint {
  category: string;
  file: SiteFile;
}

/** Groups raw site files into blueprints keyed by category (legacy + new). */
export function groupBlueprints(files: SiteFile[]): Blueprint[] {
  const out: Blueprint[] = [];
  for (const f of files) {
    const category = parseBlueprintCategory(f.name);
    if (category) out.push({ category, file: f });
  }
  return out;
}

// Upload (or replace) the single blueprint for a category. Uploaded as-is — no
// compression — to preserve blueprint quality. Any existing blueprint for the
// same category (including a legacy file) is removed first so replacing with a
// different file extension never leaves an orphan behind.
export async function uploadBlueprintFile(
  siteId: string,
  category: string,
  file: File,
): Promise<void> {
  const trimmed = category.trim();
  if (!trimmed) throw new Error('Kategorijos pavadinimas privalomas.');

  const existing = await getSiteFiles(siteId);
  const toRemove = existing
    .filter((f) => parseBlueprintCategory(f.name) === trimmed)
    .map((f) => `${siteId}/${f.name}`);
  if (toRemove.length > 0) {
    await supabase.storage.from(BUCKET).remove(toRemove);
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const path = `${siteId}/${BLUEPRINT_PREFIX}${encodeCategory(trimmed)}__.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true });

  if (error) throw new Error(error.message);
}

// Persisted (empty) blueprint categories live in the sites.blueprint_categories
// text[] column so admins can pre-create placeholder slots for installers to
// fill in later — these survive a refresh even before any file is uploaded.
async function getBlueprintCategories(siteId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('sites')
    .select('blueprint_categories')
    .eq('id', siteId)
    .single();
  if (error) throw new Error(error.message);
  return data?.blueprint_categories ?? [];
}

/** Append a category to the site's persisted list (no-op if it already exists). */
export async function addBlueprintCategory(
  siteId: string,
  categoryName: string,
): Promise<void> {
  const trimmed = categoryName.trim();
  if (!trimmed) throw new Error('Kategorijos pavadinimas privalomas.');

  const current = await getBlueprintCategories(siteId);
  if (current.includes(trimmed)) return;

  const { error } = await supabase
    .from('sites')
    .update({ blueprint_categories: [...current, trimmed] })
    .eq('id', siteId);
  if (error) throw new Error(error.message);
}

/** Remove a category from the site's persisted list. */
export async function removeBlueprintCategory(
  siteId: string,
  categoryName: string,
): Promise<void> {
  const current = await getBlueprintCategories(siteId);
  const next = current.filter((c) => c !== categoryName);
  if (next.length === current.length) return;

  const { error } = await supabase
    .from('sites')
    .update({ blueprint_categories: next })
    .eq('id', siteId);
  if (error) throw new Error(error.message);
}

// Upload a photo attachment for a specific annotation. Each call generates a
// UNIQUE filename so multiple photos can be attached to the same pin without
// overwriting one another. Returns the public URL of the new file.
export async function uploadAnnotationAttachment(
  siteId: string,
  annotationId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const path = `${siteId}/ann_${annotationId}__${Date.now()}_${uuidv4()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Best-effort removal of an annotation attachment from storage, given its
// public URL. Errors are swallowed — the annotation array is the source of truth.
export async function deleteAnnotationAttachment(publicUrl: string): Promise<void> {
  const marker = `/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(publicUrl.slice(idx + marker.length));
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function getSiteFiles(siteId: string): Promise<SiteFile[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(siteId, { sortBy: { column: 'updated_at', order: 'desc' } });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  return data.map((item) => {
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(`${siteId}/${item.name}`);

    return {
      name: item.name,
      url: urlData.publicUrl,
      size: item.metadata?.size ?? 0,
      updatedAt: item.updated_at ?? item.created_at ?? '',
    };
  });
}

export async function deleteSiteFile(siteId: string, fileName: string): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([`${siteId}/${fileName}`]);

  if (error) throw new Error(error.message);
}

// ── Fetch sites for a specific installer by their team_id ────────────────────
// Narrowed projection for the mobile LIST views (Today / Sites): only the
// columns SiteCard renders and the status/time filters read. Keeps these hot,
// frequently-refetched fetches lean — no equipment_details JSONB, notes,
// stringing_details, etc. (Detail views still fetch the full row via getSiteById.)
export type InstallerSite = Pick<
  Database['public']['Tables']['sites']['Row'],
  'id' | 'code' | 'status' | 'client_name' | 'address' | 'scheduled_start' | 'actual_start' | 'kwp' | 'kwh'
  | 'site_type'
>;

const INSTALLER_SITE_COLUMNS =
  'id, code, status, client_name, address, scheduled_start, actual_start, kwp, kwh, site_type';

export async function getInstallerSites(
  installerId: string,
  opts: { ascending?: boolean } = {},
): Promise<InstallerSite[]> {
  const { ascending = true } = opts;

  const { data: profileData, error: profileError } = await supabase
    .from('user_profiles')
    .select('team_id')
    .eq('id', installerId)
    .single();

  if (profileError) throw new Error(profileError.message);

  const userTeamId = profileData?.team_id;
  if (!userTeamId) {
    return [];
  }

  // Order on the ROOT table (sites.scheduled_start) server-side — this works;
  // only ordering on JOINED tables was unsupported (hence the old JS sort).
  // nullsFirst:false keeps unscheduled sites last in BOTH directions, exactly
  // matching the previous Array.sort() behaviour in Today.tsx / Sites.tsx.
  const { data, error } = await supabase
    .from('sites')
    .select(INSTALLER_SITE_COLUMNS)
    .eq('team_id', userTeamId)
    .or(INSTALLER_VISIBLE_SITE_STATUS_FILTER)
    .order('scheduled_start', { ascending, nullsFirst: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── SolarGrade Checklist helpers ─────────────────────────────────────────────

export type SiteChecklistSession = Database['public']['Tables']['site_checklists']['Row'] & {
  items: Database['public']['Tables']['site_checklist_items']['Row'][];
};

/** Fetch the QC session for a site (first/only one), including all item snapshots. */
export async function getSiteChecklistSession(siteId: string): Promise<SiteChecklistSession | null> {
  const { data, error } = await supabase
    .from('site_checklists')
    .select('*, items:site_checklist_items(*)')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function getChecklistTemplateGroupsForSiteType(
  siteType: SiteType,
): Promise<ChecklistTemplateGroup[]> {
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('id, category, phase, requires_photo')
    .order('phase', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return groupChecklistTemplatesForSiteType(data ?? [], siteType);
}

type ChecklistTemplatePhaseRow = Database['public']['Tables']['checklist_template_work_phases']['Row'];
type ChecklistTemplateRow = Database['public']['Tables']['checklist_templates']['Row'];

async function getChecklistTemplateWorkPhasesForCategory(
  category: string,
  options: { activeOnly?: boolean } = {},
): Promise<ChecklistTemplatePhaseRow[]> {
  let query = supabase
    .from('checklist_template_work_phases')
    .select('*')
    .ilike('category', category)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (options.activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getSiteType(siteId: string): Promise<SiteType> {
  const { data, error } = await supabase
    .from('sites')
    .select('site_type')
    .eq('id', siteId)
    .single();

  if (error) throw new Error(error.message);
  return normalizeSiteType(data?.site_type);
}

async function createSiteWorkPhasesFromTemplate(
  siteId: string,
  category: string,
): Promise<Map<string, string>> {
  const templatePhases = await getChecklistTemplateWorkPhasesForCategory(category, { activeOnly: true });
  if (templatePhases.length === 0) return new Map();

  const { error: upsertError } = await supabase
    .from('site_work_phases')
    .upsert(
      templatePhases.map((phase) => ({
        site_id: siteId,
        code: phase.code,
        label: phase.label,
        sort_order: phase.sort_order,
        is_active: true,
      })),
      { onConflict: 'site_id,code', ignoreDuplicates: true },
    );

  if (upsertError) throw new Error(upsertError.message);

  const { data: sitePhases, error: phasesError } = await supabase
    .from('site_work_phases')
    .select('id, code')
    .eq('site_id', siteId)
    .in('code', templatePhases.map((phase) => phase.code));

  if (phasesError) throw new Error(phasesError.message);

  const sitePhaseIdByCode = new Map((sitePhases ?? []).map((phase) => [phase.code, phase.id]));
  return new Map(
    templatePhases
      .map((phase) => [phase.id, sitePhaseIdByCode.get(phase.code)] as const)
      .filter((entry): entry is readonly [string, string] => !!entry[1]),
  );
}

/** Assign a checklist template category to a site that has no session yet. */
export async function assignChecklistToSite(
  siteId: string,
  category: string,
): Promise<void> {
  const requestedCategory = category.trim();
  if (!requestedCategory) throw new Error('Pasirinkite checklist šabloną.');

  const { data: existing, error: existingErr } = await supabase
    .from('site_checklists')
    .select('id')
    .eq('site_id', siteId)
    .limit(1)
    .maybeSingle();

  if (existingErr) throw new Error(existingErr.message);
  if (existing) return;

  const siteType = await getSiteType(siteId);

  // Fetch all template items for this category.
  const { data: templates, error: tplErr } = await supabase
    .from('checklist_templates')
    .select('*')
    .order('phase', { ascending: true })
    .order('name', { ascending: true });

  if (tplErr) throw new Error(tplErr.message);
  const matchingTemplates = (templates ?? []).filter(
    (template) => normalizeChecklistCategory(template.category) === normalizeChecklistCategory(requestedCategory),
  );
  if (matchingTemplates.length === 0) throw new Error('Šablonų kategorijoje nėra elementų.');
  if (!templates || templates.length === 0) throw new Error('Šablonų kategorijoje nėra elementų.');

  const workPhaseIdByTemplatePhaseId =
    siteType === 'b2b'
      ? await createSiteWorkPhasesFromTemplate(siteId, requestedCategory)
      : new Map<string, string>();

  // Create the session
  const { data: session, error: sessionErr } = await supabase
    .from('site_checklists')
    .insert({ site_id: siteId, status: 'pending', template_id: matchingTemplates[0]?.id ?? null })
    .select()
    .single();

  if (sessionErr) throw new Error(sessionErr.message);

  // Snapshot items
  const items = matchingTemplates.map((t: ChecklistTemplateRow) => {
    const photoRequirement = normalizePhotoRequirement(t.requires_photo, t.min_photo_count);
    return {
      site_checklist_id: session.id,
      question_text: t.name,
      category: t.category ?? null,
      phase: t.phase ?? null,
      is_required: t.is_required ?? true,
      requires_photo: photoRequirement.requiresPhoto,
      min_photo_count: photoRequirement.minPhotoCount,
      work_phase_id: t.template_work_phase_id
        ? workPhaseIdByTemplatePhaseId.get(t.template_work_phase_id) ?? null
        : null,
      status: 'pending' as const,
    };
  });

  const { error: itemsErr } = await supabase
    .from('site_checklist_items')
    .insert(items);

  if (itemsErr) throw new Error(itemsErr.message);
}

// ── Fetch installer photos for admin view ────────────────────────────────────

export interface InstallerPhoto {
  id: string;
  storage_path: string;
  signedUrl: string;
  created_at: string;
  section_name: string | null;
  site_checklist_item_id: string | null;
}

/**
 * Fetches all photos uploaded by installers for a site and batch-signs their
 * storage URLs so the admin can display them regardless of bucket privacy.
 */
export async function getSiteInstallerPhotos(siteId: string): Promise<InstallerPhoto[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, storage_path, created_at, section_name, site_checklist_item_id')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  const paths = data.map((p) => p.storage_path);
  const { data: signed, error: signErr } = await supabase.storage
    .from('site-photos')
    .createSignedUrls(paths, 3600);

  if (signErr) throw new Error(signErr.message);

  return data.map((p, i) => ({
    id: p.id,
    storage_path: p.storage_path,
    signedUrl: signed?.[i]?.signedUrl ?? '',
    created_at: p.created_at ?? '',
    section_name: p.section_name ?? null,
    site_checklist_item_id: p.site_checklist_item_id ?? null,
  }));
}

// ── Update client info + re-geocode address ───────────────────────────────────
export async function updateClientInfo(
  id: string,
  data: {
    client_name: string;
    contact_person: string | null;
    client_phone: string | null;
    client_email: string | null;
    address: string;
  },
): Promise<void> {
  const coords = data.address.trim() ? await geocodeAddress(data.address) : null;

  const { error } = await supabase
    .from('sites')
    .update({
      client_name:    data.client_name.trim(),
      contact_person: data.contact_person?.trim() || null,
      client_phone:   data.client_phone?.trim()   || null,
      client_email:   data.client_email?.trim()   || null,
      address:        data.address.trim(),
      ...(coords && { latitude: coords.latitude, longitude: coords.longitude }),
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// ── Update technical data ──────────────────────────────────────────────────────
export async function updateSiteType(id: string, siteType: SiteType): Promise<void> {
  const { error } = await supabase
    .from('sites')
    .update(buildSiteTypeUpdate(siteType))
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function updateTechData(
  id: string,
  data: {
    kwp: number | null;
    kwh: number | null;
    system_type: string;
    scheduled_start: string | null;
    roof_type: string | null;
    roof_material: string | null;
    roof_angle: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from('sites')
    .update({
      kwp:             data.kwp,
      kwh:             data.kwh,
      system_type:     data.system_type,
      scheduled_start: data.scheduled_start,
      roof_type:       data.roof_type      || null,
      roof_material:   data.roof_material  || null,
      roof_angle:      data.roof_angle     || null,
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// ══════════════════════════════════════════════════════════════════════════════
// Admin "Visi objektai" list — one consolidated query (no N+1), enriched client-side.
// ══════════════════════════════════════════════════════════════════════════════

/** Raw row from getSitesList — embeds team + the aggregate sources for the list. */
export interface RawSiteListItem {
  id: string;
  code: string;
  client_name: string;
  address: string | null;
  status: string | null;
  scheduled_start: string | null;
  actual_start: string | null;
  actual_end: string | null;
  system_type: string | null;
  site_type: SiteType;
  kwp: number | null;
  kwh: number | null;
  equipment_details: unknown;
  team_id: string | null;
  created_at: string;
  team: { name: string } | null;
  site_checklists: { id: string; site_checklist_items: { status: string | null }[] }[];
  time_entries: { duration_minutes: number | null; start_time: string; end_time: string | null; installer_id: string }[];
  photos: { id: string }[];
  site_assignments: { installer_id: string }[];
}

/**
 * Single request that returns everything the admin object list needs: core site
 * fields, team name, and the embedded rows used to derive progress/time/warnings.
 * Capped to keep payload bounded as the list grows.
 */
export async function getSitesList(): Promise<RawSiteListItem[]> {
  const { data, error } = await supabase
    .from('sites')
    .select(
      'id, code, client_name, address, status, scheduled_start, actual_start, actual_end, ' +
        'system_type, site_type, kwp, kwh, equipment_details, team_id, created_at, ' +
        'team:teams(name), ' +
        'site_checklists(id, site_checklist_items(status)), ' +
        'time_entries(duration_minutes, start_time, end_time, installer_id), ' +
        'photos(id), site_assignments(installer_id)',
    )
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RawSiteListItem[];
}

/** Related-data counts that BLOCK a hard delete. Zero across the board → safe to delete. */
export interface SiteDeletionBlockers {
  timeEntries: number;
  checklistItems: number;
  photos: number;
  files: number;
  snapshots: number;
  earnings: number;
}

async function countFor(table: string, column: string, siteId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table as never)
    .select('*', { count: 'exact', head: true })
    .eq(column, siteId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getSiteDeletionBlockers(siteId: string): Promise<SiteDeletionBlockers> {
  const [timeEntries, photos, snapshots, earnings] = await Promise.all([
    countFor('time_entries', 'site_id', siteId),
    countFor('photos', 'site_id', siteId),
    countFor('payroll_site_snapshots', 'site_id', siteId),
    // earnings_entries links to a site via its snapshot; count any rows joined to this site.
    supabase
      .from('earnings_entries')
      .select('id, snapshot:payroll_site_snapshots!inner(site_id)', { count: 'exact', head: true })
      .eq('snapshot.site_id', siteId)
      .then(({ count, error }) => { if (error) throw new Error(error.message); return count ?? 0; }),
  ]);
  // Checklist items live under site_checklists(site_id) → count via the parent.
  const { data: checklists, error: clErr } = await supabase
    .from('site_checklists')
    .select('id, site_checklist_items(id)')
    .eq('site_id', siteId);
  if (clErr) throw new Error(clErr.message);
  const checklistItems = (checklists ?? []).reduce(
    (n, c) => n + ((c.site_checklist_items as { id: string }[] | null)?.length ?? 0),
    0,
  );
  // Storage files (SITE_FILES_BUCKET, prefixed by site id). A previous hyphen
  // spelling here pointed at a nonexistent bucket and silently returned 0,
  // so files never blocked deletion — always use the canonical constant.
  let files = 0;
  try {
    const { data: list } = await supabase.storage.from(SITE_FILES_BUCKET).list(siteId, { limit: 1 });
    files = list?.length ?? 0;
  } catch { /* bucket optional */ }

  return { timeEntries, checklistItems, photos, files, snapshots, earnings };
}

export const hasDeletionBlockers = (b: SiteDeletionBlockers): boolean =>
  b.timeEntries > 0 || b.checklistItems > 0 || b.photos > 0 || b.files > 0 || b.snapshots > 0 || b.earnings > 0;

/** Hard delete, but only after confirming the site has no related data. */
export async function deleteSiteSafe(siteId: string): Promise<void> {
  const blockers = await getSiteDeletionBlockers(siteId);
  if (hasDeletionBlockers(blockers)) {
    throw new Error('SITE_HAS_RELATED_DATA');
  }
  const { error } = await supabase.from('sites').delete().eq('id', siteId);
  if (error) throw new Error(error.message);
}

/** Soft archive — reversible. Stored as a status so no schema change is needed. */
export async function archiveSite(siteId: string): Promise<void> {
  const { error } = await supabase.from('sites').update({ status: 'archived' }).eq('id', siteId);
  if (error) throw new Error(error.message);
}

export async function setSiteStatus(siteId: string, status: string): Promise<void> {
  const { error } = await supabase.from('sites').update({ status }).eq('id', siteId);
  if (error) throw new Error(error.message);
}

export async function assignSiteTeam(siteId: string, teamId: string | null): Promise<void> {
  const { error } = await supabase.from('sites').update({ team_id: teamId }).eq('id', siteId);
  if (error) throw new Error(error.message);
}

export type ScheduleSite = Pick<
  Database['public']['Tables']['sites']['Row'],
  | 'id'
  | 'code'
  | 'client_name'
  | 'address'
  | 'status'
  | 'scheduled_start'
  | 'kwp'
  | 'kwh'
  | 'team_id'
  | 'system_type'
  | 'equipment_details'
>;

export async function getScheduleSites(): Promise<ScheduleSite[]> {
  const { data, error } = await supabase
    .from('sites')
    .select('id, code, client_name, address, status, scheduled_start, kwp, kwh, team_id, system_type, equipment_details')
    .in('status', ['pending', 'in_progress', 'paused', 'completed'])
    .order('scheduled_start', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function assignSiteToSchedule(
  siteId: string,
  teamId: string,
  scheduledStart: string,
  status = 'pending',
): Promise<void> {
  const { error } = await supabase
    .from('sites')
    .update({ team_id: teamId, scheduled_start: scheduledStart, status })
    .eq('id', siteId);
  if (error) throw new Error(error.message);
}

export async function unassignSiteFromSchedule(siteId: string): Promise<void> {
  const { error } = await supabase
    .from('sites')
    .update({ team_id: null, scheduled_start: null, status: 'pending' })
    .eq('id', siteId);
  if (error) throw new Error(error.message);
}
