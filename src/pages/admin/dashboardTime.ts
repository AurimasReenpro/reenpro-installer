const MINUTE_MS = 60_000;

function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatElapsedWorkTimer(startIso: string | null, nowMs: number): string {
  if (!startIso) return '—';
  const startedAt = new Date(startIso).getTime();
  if (Number.isNaN(startedAt)) return '—';

  const totalMinutes = Math.max(0, Math.floor((nowMs - startedAt) / MINUTE_MS));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  return `${hours}h ${String(minutes).padStart(2, '0')}min`;
}

export function formatStartedLabel(startIso: string | null): string {
  if (!startIso) return '—';
  const clock = formatClock(startIso);
  return clock === '—' ? '—' : `nuo ${clock}`;
}

export function formatStartedTitle(startIso: string | null): string | undefined {
  if (!startIso) return undefined;
  const date = new Date(startIso);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${formatClock(startIso)}`;
}
