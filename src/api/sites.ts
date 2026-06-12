import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';
import type { EquipmentItem } from '../types/equipment.types';
import { isBatteryCategory } from '../types/equipment.types';

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
const BUCKET = 'site_files';

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
export async function getInstallerSites(installerId: string): Promise<Database['public']['Tables']['sites']['Row'][]> {
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

  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('team_id', userTeamId);

  if (error) throw new Error(error.message);
  console.log('Gauti montuotojo objektai:', data);
  return data || [];
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

/** Assign a checklist template category to a site that has no session yet. */
export async function assignChecklistToSite(
  siteId: string,
  category: string,
): Promise<void> {
  // Fetch all template items for this category
  const { data: templates, error: tplErr } = await supabase
    .from('checklist_templates')
    .select('*')
    .eq('category', category)
    .order('phase', { ascending: true })
    .order('name', { ascending: true });

  if (tplErr) throw new Error(tplErr.message);
  if (!templates || templates.length === 0) throw new Error('Šablonų kategorijoje nėra elementų.');

  // Create the session
  const { data: session, error: sessionErr } = await supabase
    .from('site_checklists')
    .insert({ site_id: siteId, status: 'pending' })
    .select()
    .single();

  if (sessionErr) throw new Error(sessionErr.message);

  // Snapshot items
  const items = templates.map(t => ({
    site_checklist_id: session.id,
    question_text: t.name,
    category: t.category ?? null,
    phase: t.phase ?? null,
    is_required: t.requires_photo ?? false,
    status: 'pending' as const,
  }));

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
}

/**
 * Fetches all photos uploaded by installers for a site and batch-signs their
 * storage URLs so the admin can display them regardless of bucket privacy.
 */
export async function getSiteInstallerPhotos(siteId: string): Promise<InstallerPhoto[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, storage_path, created_at, section_name')
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
