export async function getCurrentPositionWithTimeout(timeoutMs = 10000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    let hasReturned = false;

    const timeoutId = setTimeout(() => {
      if (!hasReturned) {
        hasReturned = true;
        resolve(null);
      }
    }, timeoutMs);

    if (!navigator.geolocation) {
      if (!hasReturned) {
        hasReturned = true;
        clearTimeout(timeoutId);
        resolve(null);
      }
      return;
    }

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!hasReturned) {
            hasReturned = true;
            clearTimeout(timeoutId);
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          }
        },
        (err) => {
          if (!hasReturned) {
            hasReturned = true;
            clearTimeout(timeoutId);
            console.warn("Geolocation error:", err);
            resolve(null);
          }
        },
        {
          // We only need neighbourhood-level accuracy to confirm the worker is
          // at the job site — not lane-level precision. Low accuracy gets a much
          // faster lock on a roof (cell/wifi vs. cold GPS fix) and drains far
          // less battery. A 60 s cached fix is fine for clock-in/out.
          enableHighAccuracy: false,
          timeout: timeoutMs,
          maximumAge: 60000,
        }
      );
    } catch (e) {
      if (!hasReturned) {
        hasReturned = true;
        clearTimeout(timeoutId);
        console.warn("Geolocation synchronous error:", e);
        resolve(null);
      }
    }
  });
}
