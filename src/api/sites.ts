import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';
import type { EquipmentItem } from '../types/equipment.types';

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
}

/**
 * Fetches all photos uploaded by installers for a site and batch-signs their
 * storage URLs so the admin can display them regardless of bucket privacy.
 */
export async function getSiteInstallerPhotos(siteId: string): Promise<InstallerPhoto[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, storage_path, created_at')
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

