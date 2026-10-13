import { randomInt, randomUUID } from 'node:crypto';
import type {
  ConvoyRole,
  CreateDrivePayload,
  Drive,
  DriveMember,
  DriveResult,
  JoinedDrive,
  LatLng,
  PositionPayload,
} from '../../shared/types.ts';
import { distanceM } from './geo.ts';

/** A member counts as arrived once they're this close to the destination. */
export const ARRIVAL_RADIUS_M = 150;
/** Club drives: alert when a car drops this far behind the front of the convoy. */
export const CONVOY_GAP_M = 2000;
/** A car has reached a regroup point within this distance. */
export const REGROUP_RADIUS_M = 150;
const MAX_REGROUP_POINTS = 10;
/** Drives are forgotten this long after they were last touched. */
export const DRIVE_TTL_MS = 24 * 60 * 60 * 1000;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const CODE_LENGTH = 6;

export class DriveError extends Error {}

interface Options {
  now?: () => number;
  newId?: () => string;
  newCode?: () => string;
  /** Called once when a drive finishes, e.g. to save it to club history. */
  onFinish?: (drive: Drive) => void;
}

export type CreateOptions = Omit<CreateDrivePayload, 'club'> & {
  club?: { id: string; name: string; eventId?: string };
};

const randomCode = () =>
  Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

const cleanName = (name: string) => {
  const trimmed = name.trim().slice(0, 32);
  if (!trimmed) throw new DriveError('Please enter your name');
  return trimmed;
};

/** In-memory store and rules for group drives. */
export class DriveStore {
  private drives = new Map<string, Drive>();
  private touchedAt = new Map<string, number>();
  /** Cumulative metres along each drive's route path, for convoy progress. */
  private pathDistances = new Map<string, number[]>();
  private now: () => number;
  private newId: () => string;
  private newCode: () => string;
  private onFinish?: (drive: Drive) => void;

  constructor(opts: Options = {}) {
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? randomUUID;
    this.newCode = opts.newCode ?? randomCode;
    this.onFinish = opts.onFinish;
  }

  get(code: string): Drive | undefined {
    return this.drives.get(code.trim().toUpperCase());
  }

  create(p: CreateOptions): JoinedDrive {
    if (!p.route?.path?.length) throw new DriveError('A route is required to start a drive');
    let code = this.newCode();
    while (this.drives.has(code)) code = this.newCode();

    const host: DriveMember = { id: this.newId(), name: cleanName(p.memberName), isHost: true, connected: true };
    const drive: Drive = {
      code,
      name: p.name.trim().slice(0, 60) || `Drive to ${p.destination.name}`,
      hostId: host.id,
      start: p.start,
      destination: p.destination,
      route: p.route,
      status: 'lobby',
      createdAt: this.now(),
      members: [host],
      club: p.club,
      regroupPoints: [],
    };
    this.drives.set(code, drive);
    this.touch(code);
    return { drive, memberId: host.id };
  }

  join(code: string, memberName: string, memberId?: string): JoinedDrive {
    const drive = this.require(code);
    const existing = memberId ? drive.members.find((m) => m.id === memberId) : undefined;
    if (existing) {
      existing.connected = true;
      this.touch(drive.code);
      return { drive, memberId: existing.id };
    }
    if (drive.status === 'finished') throw new DriveError('This drive has already finished');
    if (drive.members.length >= 50) throw new DriveError('This drive is full');

    const member: DriveMember = { id: this.newId(), name: cleanName(memberName), isHost: false, connected: true };
    drive.members.push(member);
    this.touch(drive.code);
    return { drive, memberId: member.id };
  }

  start(code: string, memberId: string): Drive {
    const drive = this.require(code);
    this.requireHost(drive, memberId);
    if (drive.status !== 'lobby') throw new DriveError('This drive has already started');
    drive.status = 'driving';
    drive.startedAt = this.now();
    // Anyone already parked at the destination when the flag drops is done.
    for (const m of drive.members) this.checkArrival(drive, m);
    this.maybeFinish(drive);
    this.touch(drive.code);
    return drive;
  }

  updatePosition(code: string, memberId: string, pos: PositionPayload): Drive {
    const drive = this.require(code);
    const member = this.requireMember(drive, memberId);
    if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) throw new DriveError('Invalid position');

    member.position = {
      lat: pos.lat,
      lng: pos.lng,
      speedKmh: pos.speedKmh,
      heading: pos.heading,
      updatedAt: this.now(),
    };
    member.distanceToGoalM = Math.round(distanceM(member.position, drive.destination.location));
    if (drive.status === 'driving') {
      member.progressM = Math.round(this.progressAlong(drive, member.position));
      this.checkArrival(drive, member);
      if (drive.club) this.updateConvoy(drive, member);
      this.maybeFinish(drive);
    }
    this.touch(drive.code);
    return drive;
  }

  /** Host ends the drive early; anyone still on the road gets no time. */
  end(code: string, memberId: string): Drive {
    const drive = this.require(code);
    this.requireHost(drive, memberId);
    if (drive.status === 'finished') return drive;
    if (drive.status === 'lobby') drive.startedAt = this.now();
    this.finish(drive);
    return drive;
  }

  /** Club drives: the host names the lead car and the back-marker (sweep). */
  setConvoyRole(code: string, hostId: string, memberId: string, role: ConvoyRole | null): Drive {
    const drive = this.requireClubHost(code, hostId);
    const member = this.requireMember(drive, memberId);
    if (role !== null && role !== 'lead' && role !== 'sweep') throw new DriveError('Unknown convoy role');
    // One lead and one sweep at a time.
    if (role) for (const m of drive.members) if (m.convoyRole === role) delete m.convoyRole;
    if (role) member.convoyRole = role;
    else delete member.convoyRole;
    if (drive.status === 'driving') this.updateConvoy(drive);
    this.touch(drive.code);
    return drive;
  }

  addRegroupPoint(code: string, hostId: string, name: string, location: LatLng): Drive {
    const drive = this.requireClubHost(code, hostId);
    if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lng)) throw new DriveError('Invalid location');
    if (drive.regroupPoints.length >= MAX_REGROUP_POINTS) throw new DriveError('That is the maximum number of regroup points');
    drive.regroupPoints.push({
      id: this.newId(),
      name: String(name ?? '').trim().slice(0, 40) || `Regroup ${drive.regroupPoints.length + 1}`,
      location: { lat: location.lat, lng: location.lng },
      reachedBy: [],
    });
    this.touch(drive.code);
    return drive;
  }

  removeRegroupPoint(code: string, hostId: string, id: string): Drive {
    const drive = this.requireClubHost(code, hostId);
    drive.regroupPoints = drive.regroupPoints.filter((p) => p.id !== id);
    this.touch(drive.code);
    return drive;
  }

  setConnected(code: string, memberId: string, connected: boolean): Drive | undefined {
    const drive = this.get(code);
    const member = drive?.members.find((m) => m.id === memberId);
    if (!drive || !member) return undefined;
    member.connected = connected;
    this.touch(drive.code);
    return drive;
  }

  /**
   * A member leaving no longer holds the group up. Returns the updated drive,
   * or undefined if the drive was dropped because nobody is left.
   */
  leave(code: string, memberId: string): Drive | undefined {
    const drive = this.get(code);
    if (!drive) return undefined;
    if (drive.status === 'finished') return drive; // keep them on the results board
    drive.members = drive.members.filter((m) => m.id !== memberId);
    if (drive.members.length === 0) {
      this.drives.delete(drive.code);
      this.touchedAt.delete(drive.code);
      this.pathDistances.delete(drive.code);
      return undefined;
    }
    if (drive.hostId === memberId) {
      drive.hostId = drive.members[0].id;
      drive.members[0].isHost = true;
    }
    if (drive.club && drive.status === 'driving') this.updateConvoy(drive);
    this.maybeFinish(drive);
    this.touch(drive.code);
    return drive;
  }

  /** Drops drives nobody has touched for DRIVE_TTL_MS. */
  sweep(): number {
    const cutoff = this.now() - DRIVE_TTL_MS;
    let removed = 0;
    for (const [code, at] of this.touchedAt) {
      if (at < cutoff) {
        this.drives.delete(code);
        this.touchedAt.delete(code);
        this.pathDistances.delete(code);
        removed++;
      }
    }
    return removed;
  }

  private checkArrival(drive: Drive, member: DriveMember) {
    if (member.arrivedAt || !member.position) return;
    const d = distanceM(member.position, drive.destination.location);
    member.distanceToGoalM = Math.round(d);
    if (d <= ARRIVAL_RADIUS_M) member.arrivedAt = this.now();
  }

  private maybeFinish(drive: Drive) {
    if (drive.status === 'driving' && drive.members.every((m) => m.arrivedAt)) this.finish(drive);
  }

  private finish(drive: Drive) {
    drive.status = 'finished';
    drive.finishedAt = this.now();
    drive.results = computeResults(drive);
    for (const m of drive.members) delete m.fallingBehind;
    this.touch(drive.code);
    try {
      this.onFinish?.(drive);
    } catch (err) {
      console.error('onFinish failed', err);
    }
  }

  /** Metres along the planned route to the path point nearest `pos`. */
  private progressAlong(drive: Drive, pos: LatLng): number {
    const path = drive.route.path;
    let cumulative = this.pathDistances.get(drive.code);
    if (!cumulative) {
      cumulative = [0];
      for (let i = 1; i < path.length; i++) cumulative.push(cumulative[i - 1] + distanceM(path[i - 1], path[i]));
      this.pathDistances.set(drive.code, cumulative);
    }
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = distanceM(pos, path[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return cumulative[best];
  }

  /**
   * Works out each car's gap to the front of the convoy - the lead car if one
   * is set, otherwise whoever is furthest along - and ticks off regroup points.
   */
  private updateConvoy(drive: Drive, moved?: DriveMember) {
    if (moved?.position) {
      for (const point of drive.regroupPoints) {
        if (!point.reachedBy.includes(moved.id) && distanceM(moved.position, point.location) <= REGROUP_RADIUS_M) {
          point.reachedBy.push(moved.id);
        }
      }
    }
    const onRoad = drive.members.filter((m) => !m.arrivedAt && m.progressM !== undefined);
    const lead = onRoad.find((m) => m.convoyRole === 'lead');
    const front = lead?.progressM ?? Math.max(0, ...onRoad.map((m) => m.progressM!));
    for (const m of drive.members) {
      if (m.arrivedAt || m.progressM === undefined) {
        delete m.behindM;
        delete m.fallingBehind;
        continue;
      }
      m.behindM = Math.max(0, Math.round(front - m.progressM));
      m.fallingBehind = m.behindM > CONVOY_GAP_M;
    }
  }

  private touch(code: string) {
    this.touchedAt.set(code, this.now());
  }

  private require(code: string): Drive {
    const drive = this.get(code);
    if (!drive) throw new DriveError('No drive found with that code');
    return drive;
  }

  private requireMember(drive: Drive, memberId: string): DriveMember {
    const member = drive.members.find((m) => m.id === memberId);
    if (!member) throw new DriveError('You are not part of this drive');
    return member;
  }

  private requireClubHost(code: string, hostId: string): Drive {
    const drive = this.require(code);
    this.requireHost(drive, hostId);
    if (!drive.club) throw new DriveError('Convoy tools are available on club drives (Premium)');
    if (drive.status === 'finished') throw new DriveError('This drive has finished');
    return drive;
  }

  private requireHost(drive: Drive, memberId: string) {
    this.requireMember(drive, memberId);
    if (drive.hostId !== memberId) throw new DriveError('Only the host can do that');
  }
}

export function computeResults(drive: Drive): DriveResult[] {
  const startedAt = drive.startedAt ?? drive.createdAt;
  const rows = drive.members.map((m) => ({
    memberId: m.id,
    name: m.name,
    elapsedMs: m.arrivedAt ? m.arrivedAt - startedAt : null,
  }));
  rows.sort((a, b) => {
    if (a.elapsedMs === null) return b.elapsedMs === null ? a.name.localeCompare(b.name) : 1;
    if (b.elapsedMs === null) return -1;
    return a.elapsedMs - b.elapsedMs;
  });
  let rank = 0;
  return rows.map((r) => ({ ...r, rank: r.elapsedMs === null ? null : ++rank }));
}
