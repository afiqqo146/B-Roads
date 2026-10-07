import type { LatLng, RouteRequest, RouteStep, ScenicRoute } from '../../shared/types.ts';
import { decodePolyline, twistiness } from './geo.ts';

// Subset of the Valhalla /route response we rely on.
// https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/
export interface ValhallaManeuver {
  instruction: string;
  street_names?: string[];
  length: number; // km
  time: number; // s
  begin_shape_index: number;
  end_shape_index: number;
  highway?: boolean;
  toll?: boolean;
}

export interface ValhallaTrip {
  legs: { shape: string; maneuvers: ValhallaManeuver[] }[];
  summary: { length: number; time: number };
}

export interface ValhallaResponse {
  trip: ValhallaTrip;
  alternates?: { trip: ValhallaTrip }[];
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Builds the Valhalla request. B-road routing comes from three levers:
 *  - use_highways ≈ 0: motorways and trunk roads are a last resort
 *  - use_tolls ≈ 0: toll expressways are avoided
 *  - use_distance = 0: optimise purely for road preference, not shortest path
 * We also ask for alternates so the scorer has several candidates to rank.
 */
export function buildValhallaRequest(req: RouteRequest) {
  const adventure = clamp01(req.adventure ?? 0.7);
  return {
    locations: [
      { lat: req.start.lat, lon: req.start.lng },
      { lat: req.end.lat, lon: req.end.lng },
    ],
    costing: 'auto',
    costing_options: {
      auto: {
        // Even "relaxed" mode keeps highways heavily penalised.
        use_highways: Number((0.15 * (1 - adventure)).toFixed(2)),
        use_tolls: 0,
        use_ferry: 0.2,
        use_distance: 0,
        // Unpaved tracks are only fair game at full adventure.
        exclude_unpaved: adventure < 0.95,
      },
    },
    alternates: 3,
    units: 'kilometers',
    directions_options: { units: 'kilometers', language: 'en-GB' },
  };
}

/**
 * Converts a Valhalla trip into a ScenicRoute and scores it. The score blends
 * how twisty the road is with how little of it is motorway or toll road.
 * Twistiness saturates at 120 deg/km - beyond that it's all good fun.
 */
export function toScenicRoute(trip: ValhallaTrip, id: string, adventure = 0.7): ScenicRoute {
  const path: LatLng[] = [];
  const steps: RouteStep[] = [];
  let highwayKm = 0;
  let tollKm = 0;

  for (const leg of trip.legs) {
    const offset = path.length;
    const shape = decodePolyline(leg.shape, 6);
    path.push(...shape);
    for (const m of leg.maneuvers) {
      if (m.highway) highwayKm += m.length;
      if (m.toll) tollKm += m.length;
      const pathIndex = offset + m.begin_shape_index;
      steps.push({
        instruction: m.instruction,
        streetNames: m.street_names ?? [],
        distanceM: Math.round(m.length * 1000),
        durationS: Math.round(m.time),
        location: path[pathIndex] ?? shape[shape.length - 1],
        pathIndex,
      });
    }
  }

  const totalKm = trip.summary.length || 1;
  const twist = twistiness(path);
  const highwayShare = clamp01(highwayKm / totalKm);
  const tollShare = clamp01(tollKm / totalKm);

  // At higher adventure the twistiness matters more than avoiding big roads.
  const twistWeight = 0.5 + 0.3 * clamp01(adventure);
  const roadWeight = 1 - twistWeight;
  const score =
    100 *
    (twistWeight * clamp01(twist / 120) +
      roadWeight * (1 - Math.max(highwayShare, tollShare)));

  return {
    id,
    path,
    distanceM: Math.round(trip.summary.length * 1000),
    durationS: Math.round(trip.summary.time),
    steps,
    twistiness: Math.round(twist),
    highwayShare: Number(highwayShare.toFixed(3)),
    tollShare: Number(tollShare.toFixed(3)),
    scenicScore: Math.round(score),
  };
}

export function rankRoutes(res: ValhallaResponse, adventure = 0.7): ScenicRoute[] {
  const trips = [res.trip, ...(res.alternates ?? []).map((a) => a.trip)];
  return trips
    .map((trip, i) => toScenicRoute(trip, `r${i}`, adventure))
    .sort((a, b) => b.scenicScore - a.scenicScore || a.durationS - b.durationS);
}

export class RoutingError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

export async function findScenicRoutes(
  req: RouteRequest,
  valhallaUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ScenicRoute[]> {
  const res = await fetchImpl(`${valhallaUrl.replace(/\/$/, '')}/route`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildValhallaRequest(req)),
  });
  const body = (await res.json().catch(() => null)) as
    | (ValhallaResponse & { error?: string })
    | null;
  if (!res.ok || !body?.trip) {
    // Valhalla answers 400 with e.g. "No path could be found for input".
    const message = body?.error ?? `Routing service returned ${res.status}`;
    throw new RoutingError(message, res.status === 400 ? 422 : 502);
  }
  return rankRoutes(body, req.adventure);
}
