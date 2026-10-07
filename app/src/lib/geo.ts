import type { LatLng, RouteStep, ScenicRoute } from '../../../shared/types';

const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const toMapCoord = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

export interface Guidance {
  /** The next manoeuvre ahead of the driver. */
  step: RouteStep;
  distanceToStepM: number;
  /** How far the driver is from the planned line; large means off-route. */
  offRouteM: number;
}

/** Finds where the driver is along the route and what's coming up next. */
export function guidanceAt(route: ScenicRoute, pos: LatLng): Guidance {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < route.path.length; i++) {
    const d = distanceM(pos, route.path[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const step =
    route.steps.find((s) => s.pathIndex > best) ?? route.steps[route.steps.length - 1];
  return { step, distanceToStepM: distanceM(pos, step.location), offRouteM: bestD };
}
