import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  Club,
  ClubEvent,
  ClubMember,
  ClubRole,
  ClubSession,
  DriveRecord,
  Place,
  RsvpStatus,
  SavedRoute,
  ScenicRoute,
} from '../../shared/types.ts';

export class ClubError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** A club as stored: the public view plus member tokens. */
interface StoredClub extends Club {
  tokens: Record<string, string>;
}

const LIMITS = { routes: 200, events: 200, history: 200, members: 500 };
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const text = (v: unknown, field: string, max: number, required = true): string | undefined => {
  const s = typeof v === 'string' ? v.trim().slice(0, max) : '';
  if (!s && required) throw new ClubError(`${field} is required`);
  return s || undefined;
};

const isPlace = (p: unknown): p is Place => {
  const place = p as Place;
  return (
    typeof place?.name === 'string' &&
    Number.isFinite(place.location?.lat) &&
    Number.isFinite(place.location?.lng)
  );
};

interface Options {
  /** JSON file clubs are saved to. Omit to keep clubs in memory only (tests). */
  file?: string;
  now?: () => number;
}

/**
 * Clubs, their members, saved routes, events and drive history. Everything in
 * here is the Premium "club organiser" feature set.
 *
 * Members don't have accounts: joining a club issues a random token that the
 * phone keeps and sends with every request.
 */
export class ClubStore {
  private clubs = new Map<string, StoredClub>();
  private file?: string;
  private now: () => number;

  constructor(opts: Options = {}) {
    this.file = opts.file;
    this.now = opts.now ?? Date.now;
    if (this.file && existsSync(this.file)) {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as StoredClub[];
      for (const c of saved) this.clubs.set(c.id, c);
    }
  }

  create(name: unknown, ownerName: unknown): ClubSession {
    let inviteCode = this.newCode();
    while ([...this.clubs.values()].some((c) => c.inviteCode === inviteCode)) inviteCode = this.newCode();
    const owner = this.newMember(ownerName, 'owner');
    const token = randomBytes(24).toString('hex');
    const club: StoredClub = {
      id: randomUUID(),
      name: text(name, 'Club name', 60)!,
      inviteCode,
      createdAt: this.now(),
      members: [owner],
      routes: [],
      events: [],
      history: [],
      tokens: { [owner.id]: token },
    };
    this.clubs.set(club.id, club);
    this.save();
    return { club: view(club), memberId: owner.id, token };
  }

  join(inviteCode: unknown, name: unknown): ClubSession {
    const code = String(inviteCode ?? '').trim().toUpperCase();
    const club = [...this.clubs.values()].find((c) => c.inviteCode === code);
    if (!club) throw new ClubError('No club found with that invite code', 404);
    if (club.members.length >= LIMITS.members) throw new ClubError('This club is full');
    const member = this.newMember(name, 'member');
    const token = randomBytes(24).toString('hex');
    club.members.push(member);
    club.tokens[member.id] = token;
    this.save();
    return { club: view(club), memberId: member.id, token };
  }

  /** Looks up the caller from their token. Throws 401/404 if it doesn't check out. */
  auth(clubId: string, token: string | undefined): { club: StoredClub; member: ClubMember } {
    const club = this.clubs.get(clubId);
    if (!club) throw new ClubError('Club not found', 404);
    const memberId = token ? Object.keys(club.tokens).find((id) => club.tokens[id] === token) : undefined;
    const member = club.members.find((m) => m.id === memberId);
    if (!member) throw new ClubError('You are not a member of this club', 401);
    return { club, member };
  }

  requireOrganiser(clubId: string, token: string | undefined) {
    const caller = this.auth(clubId, token);
    if (caller.member.role === 'member') throw new ClubError('Only club organisers can do that', 403);
    return caller;
  }

  get(clubId: string, token: string | undefined): Club {
    return view(this.auth(clubId, token).club);
  }

  leave(clubId: string, token: string | undefined): void {
    const { club, member } = this.auth(clubId, token);
    if (member.role === 'owner') throw new ClubError("The club owner can't leave the club");
    club.members = club.members.filter((m) => m.id !== member.id);
    delete club.tokens[member.id];
    this.save();
  }

  setRole(clubId: string, token: string | undefined, memberId: string, role: unknown): Club {
    const { club, member } = this.auth(clubId, token);
    if (member.role !== 'owner') throw new ClubError('Only the club owner can change roles', 403);
    if (role !== 'organiser' && role !== 'member') throw new ClubError('Role must be organiser or member');
    const target = club.members.find((m) => m.id === memberId);
    if (!target) throw new ClubError('Member not found', 404);
    if (target.role === 'owner') throw new ClubError("The owner's role can't be changed");
    target.role = role;
    this.save();
    return view(club);
  }

  saveRoute(
    clubId: string,
    token: string | undefined,
    body: { name?: unknown; notes?: unknown; start?: unknown; destination?: unknown; route?: unknown },
  ): Club {
    const { club, member } = this.requireOrganiser(clubId, token);
    const route = body.route as ScenicRoute | undefined;
    if (!isPlace(body.start) || !isPlace(body.destination) || !route?.path?.length) {
      throw new ClubError('A start, destination and route are required');
    }
    if (club.routes.length >= LIMITS.routes) throw new ClubError('Route library is full; delete an old route first');
    const saved: SavedRoute = {
      id: randomUUID(),
      name: text(body.name, 'Route name', 60)!,
      notes: text(body.notes, 'Notes', 500, false),
      start: body.start,
      destination: body.destination,
      route,
      savedBy: member.name,
      createdAt: this.now(),
    };
    club.routes.unshift(saved);
    this.save();
    return view(club);
  }

  deleteRoute(clubId: string, token: string | undefined, routeId: string): Club {
    const { club } = this.requireOrganiser(clubId, token);
    club.routes = club.routes.filter((r) => r.id !== routeId);
    this.save();
    return view(club);
  }

  createEvent(
    clubId: string,
    token: string | undefined,
    body: { title?: unknown; description?: unknown; meetAt?: unknown; meetingPoint?: unknown; routeId?: unknown },
  ): Club {
    const { club, member } = this.requireOrganiser(clubId, token);
    const meetAt = Number(body.meetAt);
    if (!Number.isFinite(meetAt)) throw new ClubError('A meeting date and time is required');
    if (!isPlace(body.meetingPoint)) throw new ClubError('A meeting point is required');
    const routeId = typeof body.routeId === 'string' && body.routeId ? body.routeId : undefined;
    if (routeId && !club.routes.some((r) => r.id === routeId)) throw new ClubError('That route is not in the club library');
    if (club.events.length >= LIMITS.events) throw new ClubError('Too many events; delete an old one first');
    const event: ClubEvent = {
      id: randomUUID(),
      title: text(body.title, 'Title', 80)!,
      description: text(body.description, 'Description', 1000, false),
      meetAt,
      meetingPoint: body.meetingPoint,
      routeId,
      createdBy: member.name,
      // The organiser is going to their own event.
      rsvps: [{ memberId: member.id, name: member.name, status: 'going' }],
    };
    club.events.push(event);
    club.events.sort((a, b) => a.meetAt - b.meetAt);
    this.save();
    return view(club);
  }

  deleteEvent(clubId: string, token: string | undefined, eventId: string): Club {
    const { club } = this.requireOrganiser(clubId, token);
    club.events = club.events.filter((e) => e.id !== eventId);
    this.save();
    return view(club);
  }

  rsvp(clubId: string, token: string | undefined, eventId: string, status: unknown): Club {
    const { club, member } = this.auth(clubId, token);
    if (status !== 'going' && status !== 'maybe' && status !== 'no') throw new ClubError('Invalid response');
    const event = club.events.find((e) => e.id === eventId);
    if (!event) throw new ClubError('Event not found', 404);
    event.rsvps = event.rsvps.filter((r) => r.memberId !== member.id);
    event.rsvps.push({ memberId: member.id, name: member.name, status: status as RsvpStatus });
    this.save();
    return view(club);
  }

  /** Remembers which live drive an event turned into, so members can jump in. */
  linkEventDrive(clubId: string, eventId: string, driveCode: string) {
    const event = this.clubs.get(clubId)?.events.find((e) => e.id === eventId);
    if (!event) return;
    event.driveCode = driveCode;
    this.save();
  }

  recordDrive(clubId: string, record: DriveRecord) {
    const club = this.clubs.get(clubId);
    if (!club) return;
    club.history = [record, ...club.history.filter((h) => h.driveCode !== record.driveCode)].slice(0, LIMITS.history);
    this.save();
  }

  clubName(clubId: string): string | undefined {
    return this.clubs.get(clubId)?.name;
  }

  private newMember(name: unknown, role: ClubRole): ClubMember {
    return { id: randomUUID(), name: text(name, 'Your name', 32)!, role, joinedAt: this.now() };
  }

  private newCode() {
    return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  }

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    // Write to a temp file first so a crash mid-write can't corrupt the data.
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify([...this.clubs.values()]));
    renameSync(tmp, this.file);
  }
}

function view(club: StoredClub): Club {
  const { tokens: _tokens, ...rest } = club;
  return structuredClone(rest);
}
