import { supabase } from "../lib/supabase";
import { getSiteWorkPhases } from './workPhases';
import { FORGOTTEN_OPEN_HOURS } from '../lib/timeEntryReview';
import {
  resolveWorkPhaseForStart,
  WorkPhaseRequiredError,
  WorkPhaseUnavailableError,
} from '../lib/workPhases';

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

export { WorkPhaseRequiredError, WorkPhaseUnavailableError };

/** Begin or resume work on a site (records an open time entry + sets status). */
export async function startWork(
  siteId: string,
  lat?: number | null,
  lng?: number | null,
  workPhaseId?: string | null,
) {
  const { error } = await supabase.rpc('start_work', {
    p_site_id: siteId,
    p_start_lat: lat ?? undefined,
    p_start_lng: lng ?? undefined,
    p_work_phase_id: workPhaseId ?? undefined,
  });
  if (error) throw error;
}

export async function startTimeEntry(
  siteId: string,
  installerId: string,
  workPhaseId?: string | null,
  lat?: number | null,
  lng?: number | null,
) {
  if (!installerId) throw new Error('User not authenticated');

  const [{ data: site, error }, activePhases] = await Promise.all([
    supabase.from('sites').select('site_type').eq('id', siteId).single(),
    getSiteWorkPhases(siteId, { activeOnly: true }),
  ]);
  if (error) throw new Error(error.message);

  const resolvedWorkPhaseId = resolveWorkPhaseForStart(site?.site_type, workPhaseId, activePhases);
  return startWork(siteId, lat, lng, resolvedWorkPhaseId);
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
export async function resumeWork(
  siteId: string,
  lat?: number | null,
  lng?: number | null,
  workPhaseId?: string | null,
) {
  return startWork(siteId, lat, lng, workPhaseId);
}

// ══════════════════════════════════════════════════════════════════════════════
// Admin time corrections + stale-timer queries. ADMIN-ONLY: every RPC re-checks
// public.is_admin() server-side; never wire these into installer/mobile UI.
// ══════════════════════════════════════════════════════════════════════════════

/** One time entry row + the joins the admin review UI renders. */
export interface AdminTimeEntry {
  id: string;
  site_id: string;
  installer_id: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  work_phase_id: string | null;
  needs_review: boolean;
  review_reason: string | null;
  reviewed_at: string | null;
  corrected_at: string | null;
  correction_reason: string | null;
  original_start_time: string | null;
  original_end_time: string | null;
  original_duration_minutes: number | null;
  installer: { full_name: string | null } | null;
}

const ADMIN_ENTRY_SELECT =
  'id, site_id, installer_id, start_time, end_time, duration_minutes, work_phase_id, ' +
  'needs_review, review_reason, reviewed_at, corrected_at, correction_reason, ' +
  'original_start_time, original_end_time, original_duration_minutes, ' +
  'installer:user_profiles(full_name)';

/** All time entries of one site, newest first (admin Site Details list). */
export async function getSiteTimeEntries(siteId: string): Promise<AdminTimeEntry[]> {
  const { data, error } = await supabase
    .from('time_entries')
    .select(ADMIN_ENTRY_SELECT)
    .eq('site_id', siteId)
    .order('start_time', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminTimeEntry[];
}

/**
 * Open entries older than the forgotten threshold (default 12h) plus anything
 * already flagged needs_review — the admin attention feed.
 */
export async function getStaleOpenTimeEntries(): Promise<AdminTimeEntry[]> {
  const cutoffIso = new Date(Date.now() - FORGOTTEN_OPEN_HOURS * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from('time_entries')
    .select(ADMIN_ENTRY_SELECT)
    .or(`and(end_time.is.null,start_time.lt.${cutoffIso}),needs_review.eq.true`)
    .order('start_time', { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminTimeEntry[];
}

/** Close a forgotten OPEN entry at an admin-chosen end time (audited). */
export async function adminCloseTimeEntry(entryId: string, endedAt: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('admin_close_time_entry', {
    p_entry_id: entryId,
    p_ended_at: endedAt,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

/** Correct start/end of an entry; originals are preserved server-side once (audited). */
export async function adminCorrectTimeEntry(input: {
  entryId: string;
  startedAt: string;
  endedAt: string;
  reason: string;
  markReviewed?: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc('admin_correct_time_entry', {
    p_entry_id: input.entryId,
    p_started_at: input.startedAt,
    p_ended_at: input.endedAt,
    p_reason: input.reason,
    p_mark_reviewed: input.markReviewed ?? true,
  });
  if (error) throw new Error(error.message);
}

/** Clear the needs_review flag without touching times (audited). */
export async function markTimeEntryReviewed(entryId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('mark_time_entry_reviewed', {
    p_entry_id: entryId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}
