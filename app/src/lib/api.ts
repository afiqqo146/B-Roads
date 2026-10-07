import type { Drive, LatLng, Place, ScenicRoute } from '../../../shared/types';
import { API_URL } from './config';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new Error(`Can't reach the B-Roads server at ${API_URL}`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function searchPlaces(q: string, near?: LatLng) {
  const params = new URLSearchParams({ q });
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lng', String(near.lng));
  }
  return request<Place[]>(`/api/places?${params}`);
}

export function findRoutes(start: LatLng, end: LatLng, adventure: number) {
  return request<ScenicRoute[]>('/api/routes', {
    method: 'POST',
    body: JSON.stringify({ start, end, adventure }),
  });
}

export function getDrive(code: string) {
  return request<Drive>(`/api/drives/${encodeURIComponent(code)}`);
}
