import type { Club, ClubSession, Place, RsvpStatus, ScenicRoute } from '../../../shared/types';
import { request } from './api';

/** What the phone remembers about its club membership. */
export interface StoredClubSession {
  clubId: string;
  memberId: string;
  token: string;
}

const authed = <T>(s: StoredClubSession, path: string, method = 'GET', body?: unknown) =>
  request<T>(`/api/clubs/${s.clubId}${path}`, {
    method,
    headers: { 'x-club-token': s.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const clubApi = {
  create: (name: string, ownerName: string, appUserId?: string) =>
    request<ClubSession>('/api/clubs', { method: 'POST', body: JSON.stringify({ name, ownerName, appUserId }) }),
  join: (inviteCode: string, name: string) =>
    request<ClubSession>('/api/clubs/join', { method: 'POST', body: JSON.stringify({ inviteCode, name }) }),
  get: (s: StoredClubSession) => authed<Club>(s, ''),
  leave: (s: StoredClubSession) => authed<{ ok: true }>(s, '/leave', 'POST', {}),
  setRole: (s: StoredClubSession, memberId: string, role: 'organiser' | 'member') =>
    authed<Club>(s, `/members/${memberId}/role`, 'POST', { role }),
  saveRoute: (s: StoredClubSession, body: { name: string; notes?: string; start: Place; destination: Place; route: ScenicRoute }) =>
    authed<Club>(s, '/routes', 'POST', body),
  deleteRoute: (s: StoredClubSession, routeId: string) => authed<Club>(s, `/routes/${routeId}`, 'DELETE'),
  createEvent: (
    s: StoredClubSession,
    body: { title: string; description?: string; meetAt: number; meetingPoint: Place; routeId?: string },
  ) => authed<Club>(s, '/events', 'POST', body),
  deleteEvent: (s: StoredClubSession, eventId: string) => authed<Club>(s, `/events/${eventId}`, 'DELETE'),
  rsvp: (s: StoredClubSession, eventId: string, status: RsvpStatus) => authed<Club>(s, `/events/${eventId}/rsvp`, 'POST', { status }),
};
