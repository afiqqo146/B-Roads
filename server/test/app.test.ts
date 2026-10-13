import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, Club, ClubSession, Drive, JoinedDrive, ScenicRoute, ServerToClientEvents } from '../../shared/types.ts';
import { createApp } from '../src/app.ts';
import { trip, twistyPath } from './fixtures.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const fakeFetch = (async (input: string | URL | Request) => {
  const url = String(input);
  if (url.endsWith('/route')) return Response.json({ trip: trip(twistyPath) });
  if (url.includes('/api/?q=')) {
    return Response.json({
      features: [{ geometry: { coordinates: [101.8, 3.4] }, properties: { name: 'Bukit Tinggi', state: 'Pahang', country: 'Malaysia' } }],
    });
  }
  throw new Error(`unexpected ${url}`);
}) as typeof fetch;

describe('server', () => {
  const { httpServer, io } = createApp({ valhallaUrl: 'http://valhalla', photonUrl: 'http://photon', fetchImpl: fakeFetch });
  let base = '';
  const clients: Client[] = [];

  beforeAll(async () => {
    await new Promise<void>((r) => httpServer.listen(0, r));
    base = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    clients.forEach((c) => c.close());
    await io.close();
  });

  const client = () => {
    const c: Client = connect(base, { transports: ['websocket'] });
    clients.push(c);
    return c;
  };
  const call = <T>(fn: (ack: (r: { ok: boolean; data?: T; error?: string }) => void) => void) =>
    new Promise<T>((resolve, reject) => fn((r) => (r.ok ? resolve(r.data as T) : reject(new Error(r.error)))));

  it('searches places and finds routes over HTTP', async () => {
    const places = await (await fetch(`${base}/api/places?q=bukit`)).json();
    expect(places).toEqual([{ name: 'Bukit Tinggi', detail: 'Pahang, Malaysia', location: { lat: 3.4, lng: 101.8 } }]);

    const bad = await fetch(`${base}/api/routes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(bad.status).toBe(400);
  });

  it('runs a group drive end to end over sockets', async () => {
    const routes: ScenicRoute[] = await (
      await fetch(`${base}/api/routes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start: { lat: 3, lng: 101 }, end: { lat: 3.4, lng: 101.8 } }),
      })
    ).json();
    expect(routes[0].path.length).toBeGreaterThan(0);

    const host = client();
    const guest = client();
    const destination = { name: 'Bukit Tinggi', location: { lat: 3.4, lng: 101.8 } };
    const created = await call<JoinedDrive>((ack) =>
      host.emit('drive:create', { name: 'Run', memberName: 'Host', start: { name: 'A', location: { lat: 3, lng: 101 } }, destination, route: routes[0] }, ack as never),
    );
    const joined = await call<JoinedDrive>((ack) =>
      guest.emit('drive:join', { code: created.drive.code.toLowerCase(), memberName: 'Guest' }, ack as never),
    );
    expect(joined.drive.members.map((m) => m.name)).toEqual(['Host', 'Guest']);

    await expect(call<Drive>((ack) => guest.emit('drive:start', ack as never))).rejects.toThrow(/host/);
    await call<Drive>((ack) => host.emit('drive:start', ack as never));

    const finished = new Promise<Drive>((resolve) =>
      host.on('drive:update', (d) => d.status === 'finished' && resolve(d)),
    );
    host.emit('drive:position', { lat: 3.4001, lng: 101.8 });
    guest.emit('drive:position', { lat: 3.4002, lng: 101.8001 });
    const drive = await finished;
    expect(drive.results).toHaveLength(2);
    expect(drive.results!.every((r) => r.elapsedMs !== null)).toBe(true);
    expect(drive.results![0]).not.toHaveProperty('rank');

    const snapshot = await (await fetch(`${base}/api/drives/${drive.code}`)).json();
    expect(snapshot.status).toBe('finished');
  });

  const post = async <T>(path: string, body: unknown, token?: string) => {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { 'x-club-token': token } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as T };
  };

  it('runs a club: events, route library, a convoy drive and its history', async () => {
    const owner = (await post<ClubSession>('/api/clubs', { name: 'Klang Valley Drivers', ownerName: 'Afiq' })).body;
    const member = (await post<ClubSession>('/api/clubs/join', { inviteCode: owner.club.inviteCode, name: 'Farah' })).body;
    expect(member.club.members).toHaveLength(2);

    expect((await fetch(`${base}/api/clubs/${owner.club.id}`)).status).toBe(401);
    const denied = await post(`/api/clubs/${owner.club.id}/events`, { title: 'x' }, member.token);
    expect(denied.status).toBe(403);

    const routes: ScenicRoute[] = await (
      await fetch(`${base}/api/routes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start: { lat: 3, lng: 101 }, end: { lat: 3.4, lng: 101.8 } }),
      })
    ).json();
    const start = { name: 'A', location: { lat: 3, lng: 101 } };
    const destination = { name: 'Bukit Tinggi', location: { lat: 3.4, lng: 101.8 } };
    let club = (await post<Club>(`/api/clubs/${owner.club.id}/routes`, { name: 'Hill run', start, destination, route: routes[0] }, owner.token)).body;
    club = (
      await post<Club>(
        `/api/clubs/${owner.club.id}/events`,
        { title: 'Sunday run', meetAt: Date.now() + 86_400_000, meetingPoint: start, routeId: club.routes[0].id },
        owner.token,
      )
    ).body;
    const eventId = club.events[0].id;
    club = (await post<Club>(`/api/clubs/${owner.club.id}/events/${eventId}/rsvp`, { status: 'going' }, member.token)).body;
    expect(club.events[0].rsvps).toHaveLength(2);

    // Members can't start club drives; organisers can.
    const host = client();
    const guest = client();
    const drivePayload = { name: 'Sunday run', memberName: 'Afiq', start, destination, route: routes[0] };
    await expect(
      call<JoinedDrive>((ack) => guest.emit('drive:create', { ...drivePayload, club: { clubId: owner.club.id, token: member.token } }, ack as never)),
    ).rejects.toThrow(/organisers/);
    const created = await call<JoinedDrive>((ack) =>
      host.emit('drive:create', { ...drivePayload, club: { clubId: owner.club.id, token: owner.token, eventId } }, ack as never),
    );
    expect(created.drive.club).toEqual({ id: owner.club.id, name: 'Klang Valley Drivers', eventId });
    const linked = await (await fetch(`${base}/api/clubs/${owner.club.id}`, { headers: { 'x-club-token': owner.token } })).json();
    expect(linked.events[0].driveCode).toBe(created.drive.code);

    const joined = await call<JoinedDrive>((ack) => guest.emit('drive:join', { code: created.drive.code, memberName: 'Farah' }, ack as never));
    const withRole = await call<Drive>((ack) => host.emit('drive:setRole', { memberId: joined.memberId, role: 'sweep' }, ack as never));
    expect(withRole.members[1].convoyRole).toBe('sweep');
    await call<Drive>((ack) => host.emit('drive:addRegroup', { name: 'Petrol', location: routes[0].path[10] }, ack as never));
    await call<Drive>((ack) => host.emit('drive:start', ack as never));

    const finished = new Promise<Drive>((resolve) => host.on('drive:update', (d) => d.status === 'finished' && resolve(d)));
    host.emit('drive:position', { lat: 3.4001, lng: 101.8 });
    guest.emit('drive:position', { lat: 3.4002, lng: 101.8001 });
    await finished;

    const after = await (await fetch(`${base}/api/clubs/${owner.club.id}`, { headers: { 'x-club-token': member.token } })).json();
    expect(after.history).toHaveLength(1);
    expect(after.history[0]).toMatchObject({ name: 'Sunday run', eventId, driveCode: created.drive.code });
    expect(after.history[0].participants).toHaveLength(2);
  });

  it('asks for Premium to create a club when billing is checked', async () => {
    const gated = createApp({ valhallaUrl: 'x', photonUrl: 'x', premiumCheck: async (id) => id === 'paid' });
    await new Promise<void>((r) => gated.httpServer.listen(0, r));
    const url = `http://localhost:${(gated.httpServer.address() as AddressInfo).port}/api/clubs`;
    const req = (body: object) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await req({ name: 'C', ownerName: 'A' })).status).toBe(402);
    expect((await req({ name: 'C', ownerName: 'A', appUserId: 'paid' })).status).toBe(200);
    await gated.io.close();
  });
});
