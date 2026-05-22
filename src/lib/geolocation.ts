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
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 0,
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
