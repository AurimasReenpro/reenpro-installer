import { supabase } from "../lib/supabase";

/**
 * Thrown when the server-side QC gate rejects completion. The UI already gates
 * via validateJobCompletion(), so this is the backstop for any request that
 * bypassed the client. Normalised to exactly 'QC_FAILED' for clean branching.
 */
export class QcFailedError extends Error {
  constructor(message = 'QC_FAILED') {
    super(message);
    this.name = 'QcFailedError';
  }
}

// All time-tracking writes go through SECURITY DEFINER RPCs. The `time_entries`
// table and the workflow columns of `sites` (status/timestamps) are locked down
// by RLS + a guard trigger, so the client can no longer mutate them directly —
// it can only invoke these authoritative functions. The DB validates assignment
// and (on completion) the full QC checklist before changing anything.

/** Begin or resume work on a site (records an open time entry + sets status). */
export async function startWork(siteId: string, lat?: number | null, lng?: number | null) {
  const { error } = await supabase.rpc('start_work', {
    p_site_id: siteId,
    p_start_lat: lat ?? undefined,
    p_start_lng: lng ?? undefined,
  });
  if (error) throw error;
}

/** Pause work: closes the caller's open time entry + sets the site to paused. */
export async function pauseWork(siteId: string) {
  const { error } = await supabase.rpc('pause_work', { p_site_id: siteId });
  if (error) throw error;
}

/**
 * Complete work. The RPC re-runs the QC checklist on the server and RAISEs
 * 'QC_FAILED: …' if anything is unmet; otherwise it closes the open time entry
 * and stamps the site completed. Throws QcFailedError on a QC rejection.
 */
export async function completeWork(siteId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const { data, error } = await supabase.rpc('complete_site_work', {
    p_site_id: siteId,
    p_user_id: user.id,
  });
  if (error) {
    if (error.message?.includes('QC_FAILED')) throw new QcFailedError();
    throw error;
  }
  return data;
}

/** Resume is identical to start (re-opens a time entry). */
export async function resumeWork(siteId: string, lat?: number | null, lng?: number | null) {
  return startWork(siteId, lat, lng);
}
