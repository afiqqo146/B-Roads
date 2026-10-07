import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export interface Fix {
  lat: number;
  lng: number;
  speedKmh?: number;
  heading?: number;
}

/** Follows the device's position while `active` is true. */
export function useLocation(active = true, highAccuracy = false) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;

    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) {
        setError('Location permission is needed to find routes and track your drive.');
        return;
      }
      const watcher = await Location.watchPositionAsync(
        {
          accuracy: highAccuracy ? Location.Accuracy.BestForNavigation : Location.Accuracy.Balanced,
          distanceInterval: highAccuracy ? 10 : 50,
          timeInterval: highAccuracy ? 2000 : 10_000,
        },
        ({ coords }) =>
          setFix({
            lat: coords.latitude,
            lng: coords.longitude,
            // speed is m/s and -1/null when unknown
            speedKmh: coords.speed != null && coords.speed >= 0 ? coords.speed * 3.6 : undefined,
            heading: coords.heading != null && coords.heading >= 0 ? coords.heading : undefined,
          }),
        (reason) => setError(reason),
      );
      if (cancelled) watcher.remove();
      else sub = watcher;
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active, highAccuracy]);

  return { fix, error };
}
