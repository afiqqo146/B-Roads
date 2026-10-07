import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, Drive, JoinedDrive, ScenicRoute, ServerToClientEvents } from '../../shared/types.ts';
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
    expect(drive.results!.every((r) => r.elapsedMs !== null && r.rank !== null)).toBe(true);

    const snapshot = await (await fetch(`${base}/api/drives/${drive.code}`)).json();
    expect(snapshot.status).toBe('finished');
  });
});
