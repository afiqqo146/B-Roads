import { beforeEach, describe, expect, it } from 'vitest';
import type { CreateOptions } from '../src/drives.ts';
import { CONVOY_GAP_M, DRIVE_TTL_MS, DriveError, DriveStore } from '../src/drives.ts';
import { rankRoutes } from '../src/scenic.ts';
import { trip, twistyPath } from './fixtures.ts';

const destination = { name: 'Bukit Tinggi', location: { lat: 3.4, lng: 101.8 } };
const payload: CreateOptions = {
  name: 'Sunday run',
  memberName: 'Aiman',
  start: { name: 'Home', location: { lat: 3.1, lng: 101.6 } },
  destination,
  route: rankRoutes({ trip: trip(twistyPath) })[0],
};
const nearGoal = { lat: 3.4005, lng: 101.8 }; // ~55 m away
const farAway = { lat: 3.2, lng: 101.7 };

describe('DriveStore', () => {
  let t: number;
  let store: DriveStore;
  let ids: number;

  beforeEach(() => {
    t = 1_000_000;
    ids = 0;
    store = new DriveStore({ now: () => t, newId: () => `m${++ids}`, newCode: () => 'ABC234' });
  });

  it('creates a drive with the creator as host', () => {
    const { drive, memberId } = store.create(payload);
    expect(drive.code).toBe('ABC234');
    expect(drive.status).toBe('lobby');
    expect(drive.hostId).toBe(memberId);
    expect(drive.members).toEqual([expect.objectContaining({ name: 'Aiman', isHost: true })]);
  });

  it('lets people join by code, case-insensitively, and rejoin by id', () => {
    store.create(payload);
    const { memberId } = store.join('abc234', 'Farah');
    expect(store.get('ABC234')!.members).toHaveLength(2);
    store.setConnected('ABC234', memberId, false);
    const again = store.join('ABC234', 'Farah', memberId);
    expect(again.memberId).toBe(memberId);
    expect(again.drive.members).toHaveLength(2);
    expect(again.drive.members[1].connected).toBe(true);
    expect(() => store.join('NOPE00', 'X')).toThrow(DriveError);
    expect(() => store.join('ABC234', '   ')).toThrow(/name/);
  });

  it('only lets the host start', () => {
    store.create(payload);
    const { memberId } = store.join('ABC234', 'Farah');
    expect(() => store.start('ABC234', memberId)).toThrow(/host/);
    expect(store.start('ABC234', 'm1').status).toBe('driving');
    expect(() => store.start('ABC234', 'm1')).toThrow(/already/);
  });

  it('times everyone from start to arrival and finishes when all have arrived', () => {
    store.create(payload);
    const farah = store.join('ABC234', 'Farah').memberId;
    t = 2_000_000;
    store.start('ABC234', 'm1');

    t += 30 * 60_000;
    let drive = store.updatePosition('ABC234', farah, farAway);
    expect(drive.members[1].arrivedAt).toBeUndefined();
    expect(drive.members[1].distanceToGoalM).toBeGreaterThan(10_000);

    t += 10 * 60_000;
    drive = store.updatePosition('ABC234', farah, nearGoal);
    expect(drive.members[1].arrivedAt).toBe(t);
    expect(drive.status).toBe('driving');

    t += 5 * 60_000;
    drive = store.updatePosition('ABC234', 'm1', nearGoal);
    expect(drive.status).toBe('finished');
    // Listed by name with each driver's own time - no ranking.
    expect(drive.results).toEqual([
      { memberId: 'm1', name: 'Aiman', elapsedMs: 45 * 60_000 },
      { memberId: farah, name: 'Farah', elapsedMs: 40 * 60_000 },
    ]);
  });

  it('does not count arrival in the lobby until the drive starts', () => {
    store.create(payload);
    store.join('ABC234', 'Farah');
    expect(store.updatePosition('ABC234', 'm1', nearGoal).members[0].arrivedAt).toBeUndefined();
    t += 1000;
    const drive = store.start('ABC234', 'm1');
    expect(drive.members[0].arrivedAt).toBe(t); // already parked at the destination
  });

  it('lets the host end early, leaving stragglers without a time', () => {
    store.create(payload);
    const farah = store.join('ABC234', 'Farah').memberId;
    store.start('ABC234', 'm1');
    t += 60_000;
    store.updatePosition('ABC234', 'm1', nearGoal);
    expect(() => store.end('ABC234', farah)).toThrow(/host/);
    const drive = store.end('ABC234', 'm1');
    expect(drive.status).toBe('finished');
    expect(drive.results!.map((r) => [r.name, r.elapsedMs])).toEqual([
      ['Aiman', 60_000],
      ['Farah', null],
    ]);
  });

  it('finishes when the last driver still on the road leaves, and hands over host', () => {
    store.create(payload);
    const farah = store.join('ABC234', 'Farah').memberId;
    store.start('ABC234', 'm1');
    store.updatePosition('ABC234', farah, nearGoal);
    const drive = store.leave('ABC234', 'm1')!;
    expect(drive.hostId).toBe(farah);
    expect(drive.members[0].isHost).toBe(true);
    expect(drive.status).toBe('finished');
    expect(store.leave('ABC234', farah)?.status).toBe('finished'); // results kept
  });

  it('forgets idle drives', () => {
    store.create(payload);
    t += DRIVE_TTL_MS + 1;
    expect(store.sweep()).toBe(1);
    expect(store.get('ABC234')).toBeUndefined();
  });

  describe('convoy tools (club drives)', () => {
    const club = { id: 'c1', name: 'Klang Valley Drivers' };
    const path = payload.route.path;

    it('are not available on ordinary drives', () => {
      store.create(payload);
      expect(() => store.addRegroupPoint('ABC234', 'm1', 'Cafe', path[10])).toThrow(/club drives/);
    });

    it('lets the host assign one lead and one sweep', () => {
      store.create({ ...payload, club });
      const farah = store.join('ABC234', 'Farah').memberId;
      const dan = store.join('ABC234', 'Dan').memberId;
      expect(() => store.setConvoyRole('ABC234', farah, dan, 'lead')).toThrow(/host/);
      store.setConvoyRole('ABC234', 'm1', farah, 'lead');
      let drive = store.setConvoyRole('ABC234', 'm1', dan, 'lead');
      expect(drive.members.map((m) => m.convoyRole)).toEqual([undefined, undefined, 'lead']);
      drive = store.setConvoyRole('ABC234', 'm1', farah, 'sweep');
      expect(drive.members.map((m) => m.convoyRole)).toEqual([undefined, 'sweep', 'lead']);
      drive = store.setConvoyRole('ABC234', 'm1', dan, null);
      expect(drive.members[2].convoyRole).toBeUndefined();
    });

    it('flags cars that fall behind the lead car', () => {
      store.create({ ...payload, club });
      const farah = store.join('ABC234', 'Farah').memberId;
      store.setConvoyRole('ABC234', 'm1', 'm1', 'lead');
      store.start('ABC234', 'm1');

      store.updatePosition('ABC234', farah, path[2]);
      let drive = store.updatePosition('ABC234', 'm1', path[path.length - 3]);
      const [lead, behind] = drive.members;
      expect(lead.behindM).toBe(0);
      expect(behind.behindM).toBeGreaterThan(CONVOY_GAP_M);
      expect(behind.fallingBehind).toBe(true);

      drive = store.updatePosition('ABC234', farah, path[path.length - 4]);
      expect(drive.members[1].fallingBehind).toBe(false);
    });

    it('ticks off regroup points as cars reach them', () => {
      store.create({ ...payload, club });
      const farah = store.join('ABC234', 'Farah').memberId;
      let drive = store.addRegroupPoint('ABC234', 'm1', '  Petrol station ', path[20]);
      const point = drive.regroupPoints[0];
      expect(point.name).toBe('Petrol station');
      store.start('ABC234', 'm1');
      drive = store.updatePosition('ABC234', farah, path[20]);
      expect(drive.regroupPoints[0].reachedBy).toEqual([farah]);
      drive = store.removeRegroupPoint('ABC234', 'm1', point.id);
      expect(drive.regroupPoints).toEqual([]);
    });

    it('reports finished drives', () => {
      const finished: string[] = [];
      store = new DriveStore({ now: () => t, newId: () => `m${++ids}`, newCode: () => 'ABC234', onFinish: (d) => finished.push(d.code) });
      store.create({ ...payload, club });
      store.start('ABC234', 'm1');
      store.updatePosition('ABC234', 'm1', nearGoal);
      expect(finished).toEqual(['ABC234']);
    });
  });
});
