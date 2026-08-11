// ── Stale / forgotten open-timer detection (pure, shared by admin + mobile) ──
// Thresholds are on OPEN entries only (end_time == null); closed entries are
// the payroll/reports concern and are flagged separately (needs_review in DB).

/** Minimal shape the helpers need — matches time_entries rows everywhere. */
export interface OpenTimerLike {
  start_time: string;
  end_time: string | null;
}

export const LONG_OPEN_HOURS = 10;
export const FORGOTTEN_OPEN_HOURS = 12;
export const SEVERE_STALE_HOURS = 24;

const HOUR_MS = 3_600_000;

function openElapsedMs(entry: OpenTimerLike, nowMs: number): number | null {
  if (entry.end_time != null) return null;
  const started = Date.parse(entry.start_time);
  if (Number.isNaN(started)) return null;
  return Math.max(0, nowMs - started);
}

/** Open longer than 10h — worth a look. */
export function isLongOpenTimeEntry(entry: OpenTimerLike, nowMs: number): boolean {
  const ms = openElapsedMs(entry, nowMs);
  return ms != null && ms > LONG_OPEN_HOURS * HOUR_MS;
}

/** Open longer than 12h — probably a forgotten stop. */
export function isLikelyForgottenTimeEntry(entry: OpenTimerLike, nowMs: number): boolean {
  const ms = openElapsedMs(entry, nowMs);
  return ms != null && ms > FORGOTTEN_OPEN_HOURS * HOUR_MS;
}

/** Open longer than 24h — severe; poisons stats until corrected. */
export function isSevereStaleTimeEntry(entry: OpenTimerLike, nowMs: number): boolean {
  const ms = openElapsedMs(entry, nowMs);
  return ms != null && ms > SEVERE_STALE_HOURS * HOUR_MS;
}

/**
 * Lithuanian review reason for the worst matching threshold, or null when the
 * entry is closed / within normal bounds. Never auto-closes anything.
 */
export function getTimeEntryReviewReason(entry: OpenTimerLike, nowMs: number): string | null {
  if (isSevereStaleTimeEntry(entry, nowMs)) return 'Ilgas atviras laiko įrašas.';
  if (isLikelyForgottenTimeEntry(entry, nowMs)) return 'Patikrinkite, ar darbas nebuvo pamirštas sustabdyti.';
  if (isLongOpenTimeEntry(entry, nowMs)) return 'Darbas tęsiasi ilgai.';
  return null;
}
