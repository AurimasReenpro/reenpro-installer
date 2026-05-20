import { supabase } from "../lib/supabase";

export async function startWork(siteId: string, lat?: number | null, lng?: number | null) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const nowStr = new Date().toISOString();

  // Insert time entry
  const { error: insertError } = await supabase
    .from('time_entries')
    .insert({
      site_id: siteId,
      installer_id: user.id,
      start_time: nowStr,
      start_lat: lat ?? null,
      start_lng: lng ?? null
    });
  if (insertError) throw insertError;

  // Get current site to check actual_start
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('actual_start')
    .eq('id', siteId)
    .single();

  if (siteError) throw siteError;

  // Update site status to 'in_progress', and actual_start if null
  const updateData: { status: string; actual_start?: string } = { status: 'in_progress' };
  if (!site.actual_start) {
    updateData.actual_start = nowStr;
  }

  const { error: updateSiteError } = await supabase
    .from('sites')
    .update(updateData)
    .eq('id', siteId);
  if (updateSiteError) throw updateSiteError;
}

export async function pauseWork(siteId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  // Close active time entry
  const { data: activeEntry, error: activeError } = await supabase
    .from('time_entries')
    .select('id')
    .match({ site_id: siteId, installer_id: user.id })
    .is('end_time', null)
    .maybeSingle();

  if (activeError) throw activeError;

  if (activeEntry) {
    const { error: updateTimeError } = await supabase
      .from('time_entries')
      .update({ end_time: new Date().toISOString() })
      .eq('id', activeEntry.id);
    if (updateTimeError) throw updateTimeError;
  }

  // Update site status to paused
  const { error: siteError } = await supabase
    .from('sites')
    .update({ status: 'paused' })
    .eq('id', siteId);
  if (siteError) throw siteError;
}

export async function completeWork(siteId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  // Get current site to check actual_start
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('actual_start')
    .eq('id', siteId)
    .single();

  if (siteError) throw siteError;

  // If actual_start is null, update it to now
  if (!site.actual_start) {
    const nowStr = new Date().toISOString();
    const { error: updateStartError } = await supabase
      .from('sites')
      .update({ actual_start: nowStr })
      .eq('id', siteId);
    
    if (updateStartError) throw updateStartError;
  }

  // Check if there is an active time entry for this user and site
  const { data: activeEntry, error: activeError } = await supabase
    .from('time_entries')
    .select('id')
    .match({ site_id: siteId, installer_id: user.id })
    .is('end_time', null)
    .maybeSingle();

  if (activeError) throw activeError;

  const nowStr = new Date().toISOString();
  if (activeEntry) {
    // If active entry exists, close it
    const { error: updateTimeError } = await supabase
      .from('time_entries')
      .update({ end_time: nowStr })
      .eq('id', activeEntry.id);
    
    if (updateTimeError) throw updateTimeError;
  } else {
    // If no active entry exists, create a closed one
    const { error: insertTimeError } = await supabase
      .from('time_entries')
      .insert({
        site_id: siteId,
        installer_id: user.id,
        start_time: nowStr,
        end_time: nowStr
      });
    
    if (insertTimeError) throw insertTimeError;
  }

  const { data, error } = await supabase.rpc("complete_work", {
    p_site_id: siteId,
  });
  if (error) throw error;
  return data;
}

export async function resumeWork(siteId: string, lat?: number | null, lng?: number | null) {
  return startWork(siteId, lat, lng);
}
