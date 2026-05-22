interface OsrmResponse {
  code: string;
  routes: Array<{
    distance: number;
    duration: number;
  }>;
}

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
}

/**
 * Fetch driving distance & duration between two coordinates using
 * the free OSRM public routing API (no API key needed).
 *
 * @param base   { lat, lng } of the company warehouse / base
 * @param site   { lat, lng } of the installation site
 * @returns      distance in km and duration in minutes, or null on failure
 */
export async function getRouteDistance(
  base: { lat: number; lng: number },
  site: { lat: number; lng: number }
): Promise<RouteResult | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${base.lng},${base.lat};${site.lng},${site.lat}` +
      `?overview=false&steps=false`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const json = (await res.json()) as OsrmResponse;
    if (json.code !== 'Ok' || !json.routes?.length) return null;

    const route = json.routes[0];
    if (!route) return null;
    return {
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
      durationMin: Math.round(route.duration / 60),
    };
  } catch {
    return null;
  }
}

/** Human-readable duration string: "45 min" | "1 val. 20 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} val. ${m} min` : `${h} val.`;
}
