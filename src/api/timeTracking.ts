import { supabase } from "../lib/supabase";

export async function startWork(siteId: string, lat?: number | null, lng?: number | null) {
  const { data, error } = await supabase.rpc("start_work", {
    p_site_id: siteId,
    p_start_lat: lat ?? undefined,
    p_start_lng: lng ?? undefined,
  });
  if (error) throw error;
  return data;
}

export async function pauseWork(siteId: string) {
  const { data, error } = await supabase.rpc("pause_work", {
    p_site_id: siteId,
  });
  if (error) throw error;
  return data;
}

export async function completeWork(siteId: string) {
  const { data, error } = await supabase.rpc("complete_work", {
    p_site_id: siteId,
  });
  if (error) throw error;
  return data;
}

export async function resumeWork(siteId: string, lat?: number | null, lng?: number | null) {
  return startWork(siteId, lat, lng);
}
