import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ClubError, ClubStore } from '../src/clubs.ts';
import { rankRoutes } from '../src/scenic.ts';
import { trip, twistyPath } from './fixtures.ts';

const place = (name: string) => ({ name, location: { lat: 3.1, lng: 101.6 } });
const route = rankRoutes({ trip: trip(twistyPath) })[0];

describe('ClubStore', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('creates a club with the creator as owner and lets others join by invite code', () => {
    const store = new ClubStore();
    const owner = store.create('Klang Valley Drivers', 'Afiq');
    expect(owner.club.members).toEqual([expect.objectContaining({ name: 'Afiq', role: 'owner' })]);
    expect(owner.club.inviteCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(owner.club).not.toHaveProperty('tokens');

    const member = store.join(owner.club.inviteCode.toLowerCase(), 'Farah');
    expect(member.club.members.map((m) => [m.name, m.role])).toEqual([
      ['Afiq', 'owner'],
      ['Farah', 'member'],
    ]);
    expect(() => store.join('NOPE00', 'X')).toThrow(/invite code/);
  });

  it('rejects requests with a bad token', () => {
    const store = new ClubStore();
    const { club } = store.create('Club', 'Afiq');
    expect(() => store.get(club.id, 'wrong')).toThrow(ClubError);
    expect(() => store.get(club.id, undefined)).toThrow(/not a member/);
  });

  it('only lets organisers manage routes and events, and only the owner change roles', () => {
    const store = new ClubStore();
    const owner = store.create('Club', 'Afiq');
    const farah = store.join(owner.club.inviteCode, 'Farah');
    const id = owner.club.id;

    expect(() => store.saveRoute(id, farah.token, { name: 'Hill run', start: place('A'), destination: place('B'), route })).toThrow(
      /organisers/,
    );
    expect(() => store.setRole(id, farah.token, farah.memberId, 'organiser')).toThrow(/owner/);

    store.setRole(id, owner.token, farah.memberId, 'organiser');
    const club = store.saveRoute(id, farah.token, { name: 'Hill run', notes: 'Fuel up first', start: place('A'), destination: place('B'), route });
    expect(club.routes[0]).toMatchObject({ name: 'Hill run', notes: 'Fuel up first', savedBy: 'Farah' });
    expect(() => store.setRole(id, owner.token, owner.memberId, 'member')).toThrow(/owner's role/);
  });

  it('runs events with sign-ups', () => {
    const store = new ClubStore();
    const owner = store.create('Club', 'Afiq');
    const farah = store.join(owner.club.inviteCode, 'Farah');
    const id = owner.club.id;
    const routeId = store.saveRoute(id, owner.token, { name: 'Hill run', start: place('A'), destination: place('B'), route }).routes[0].id;

    expect(() => store.createEvent(id, owner.token, { title: 'Run', meetAt: 'soon', meetingPoint: place('Cafe') })).toThrow(/date/);
    expect(() => store.createEvent(id, owner.token, { title: 'Run', meetAt: 1, meetingPoint: place('Cafe'), routeId: 'nope' })).toThrow(/library/);

    let club = store.createEvent(id, owner.token, { title: 'Sunday run', meetAt: 2000, meetingPoint: place('Cafe'), routeId });
    store.createEvent(id, owner.token, { title: 'Earlier run', meetAt: 1000, meetingPoint: place('Cafe') });
    const event = club.events[0];
    expect(event.rsvps).toEqual([{ memberId: owner.memberId, name: 'Afiq', status: 'going' }]);

    store.rsvp(id, farah.token, event.id, 'maybe');
    club = store.rsvp(id, farah.token, event.id, 'going');
    const sunday = club.events.find((e) => e.id === event.id)!;
    expect(sunday.rsvps.map((r) => [r.name, r.status])).toEqual([
      ['Afiq', 'going'],
      ['Farah', 'going'],
    ]);
    expect(club.events.map((e) => e.title)).toEqual(['Earlier run', 'Sunday run']); // sorted by date
    expect(() => store.rsvp(id, farah.token, event.id, 'yes please')).toThrow(/Invalid/);
    expect(() => store.deleteEvent(id, farah.token, event.id)).toThrow(/organisers/);
  });

  it('lets members leave but not the owner', () => {
    const store = new ClubStore();
    const owner = store.create('Club', 'Afiq');
    const farah = store.join(owner.club.inviteCode, 'Farah');
    store.leave(owner.club.id, farah.token);
    expect(store.get(owner.club.id, owner.token).members).toHaveLength(1);
    expect(() => store.get(owner.club.id, farah.token)).toThrow(/not a member/);
    expect(() => store.leave(owner.club.id, owner.token)).toThrow(/owner/);
  });

  it('saves clubs to disk and loads them back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clubs-'));
    dirs.push(dir);
    const file = join(dir, 'nested', 'clubs.json');
    const owner = new ClubStore({ file }).create('Club', 'Afiq');
    const reloaded = new ClubStore({ file });
    expect(reloaded.get(owner.club.id, owner.token).name).toBe('Club');
  });
});
