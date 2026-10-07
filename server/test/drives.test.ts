import { beforeEach, describe, expect, it } from 'vitest';
import type { CreateDrivePayload } from '../../shared/types.ts';
import { DRIVE_TTL_MS, DriveError, DriveStore } from '../src/drives.ts';
import { rankRoutes } from '../src/scenic.ts';
import { trip, twistyPath } from './fixtures.ts';

const destination = { name: 'Bukit Tinggi', location: { lat: 3.4, lng: 101.8 } };
const payload: CreateDrivePayload = {
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
    expect(drive.results).toEqual([
      { memberId: farah, name: 'Farah', elapsedMs: 40 * 60_000, rank: 1 },
      { memberId: 'm1', name: 'Aiman', elapsedMs: 45 * 60_000, rank: 2 },
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

  it('lets the host end early, leaving stragglers unranked', () => {
    store.create(payload);
    const farah = store.join('ABC234', 'Farah').memberId;
    store.start('ABC234', 'm1');
    t += 60_000;
    store.updatePosition('ABC234', 'm1', nearGoal);
    expect(() => store.end('ABC234', farah)).toThrow(/host/);
    const drive = store.end('ABC234', 'm1');
    expect(drive.status).toBe('finished');
    expect(drive.results!.map((r) => [r.name, r.rank])).toEqual([
      ['Aiman', 1],
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
});
