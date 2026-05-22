import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';
import type { EquipmentItem } from '../types/equipment.types';

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

// ── Update equipment_details JSONB (new structured array format) ─────────────
export async function updateEquipment(
  id: string,
  equipment: EquipmentItem[]
): Promise<void> {
  const { error } = await supabase
    .from('sites')
    .update({ equipment_details: equipment as unknown as Record<string, string> })
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
