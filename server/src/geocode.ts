import type { LatLng, Place } from '../../shared/types.ts';

// Photon (https://photon.komoot.io) is an OpenStreetMap geocoder built for
// search-as-you-type, which Nominatim's usage policy does not allow.
interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

export function photonToPlace(f: PhotonFeature): Place {
  const p = f.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const name = p.name ?? (street || p.city || 'Unnamed place');
  const detail = [p.name ? street : undefined, p.city, p.state, p.country]
    .filter((s): s is string => Boolean(s) && s !== name)
    .join(', ');
  const [lng, lat] = f.geometry.coordinates;
  return { name, detail: detail || undefined, location: { lat, lng } };
}

export async function searchPlaces(
  query: string,
  photonUrl: string,
  near?: LatLng,
  fetchImpl: typeof fetch = fetch,
): Promise<Place[]> {
  const url = new URL('/api/', photonUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '8');
  if (near) {
    url.searchParams.set('lat', String(near.lat));
    url.searchParams.set('lon', String(near.lng));
  }
  const res = await fetchImpl(url, { headers: { 'user-agent': 'B-Roads/1.0' } });
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);
  const body = (await res.json()) as { features: PhotonFeature[] };
  return body.features.map(photonToPlace);
}
