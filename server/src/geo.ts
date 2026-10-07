import type { LatLng } from '../../shared/types.ts';

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing from a to b, 0..360. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Decodes a Google-style encoded polyline. Valhalla uses precision 6. */
export function decodePolyline(encoded: string, precision = 6): LatLng[] {
  const factor = 10 ** precision;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

export function encodePolyline(points: LatLng[], precision = 6): string {
  const factor = 10 ** precision;
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  const encode = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * factor);
    const lng = Math.round(p.lng * factor);
    encode(lat - prevLat);
    encode(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

/**
 * How twisty a path is: total absolute heading change in degrees per km.
 * Points closer than `minSegmentM` are merged first so GPS-level jitter in the
 * shape doesn't count as corners. A motorway sits around 5-15 deg/km; a good
 * mountain B-road is well over 100.
 */
export function twistiness(path: LatLng[], minSegmentM = 25): number {
  if (path.length < 3) return 0;

  const simplified: LatLng[] = [path[0]];
  for (const p of path.slice(1)) {
    if (distanceM(simplified[simplified.length - 1], p) >= minSegmentM) simplified.push(p);
  }
  const last = path[path.length - 1];
  if (simplified[simplified.length - 1] !== last) simplified.push(last);

  let totalTurn = 0;
  let totalM = 0;
  let prevBearing: number | null = null;
  for (let i = 1; i < simplified.length; i++) {
    const a = simplified[i - 1];
    const b = simplified[i];
    totalM += distanceM(a, b);
    const bearing = bearingDeg(a, b);
    if (prevBearing !== null) {
      let delta = Math.abs(bearing - prevBearing);
      if (delta > 180) delta = 360 - delta;
      // Ignore U-turn-like spikes, which come from shape artefacts at junctions.
      if (delta < 150) totalTurn += delta;
    }
    prevBearing = bearing;
  }
  return totalM > 0 ? totalTurn / (totalM / 1000) : 0;
}
