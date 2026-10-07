import { randomInt, randomUUID } from 'node:crypto';
import type {
  CreateDrivePayload,
  Drive,
  DriveMember,
  DriveResult,
  JoinedDrive,
  PositionPayload,
} from '../../shared/types.ts';
import { distanceM } from './geo.ts';

/** A member counts as arrived once they're this close to the destination. */
export const ARRIVAL_RADIUS_M = 150;
/** Drives are forgotten this long after they were last touched. */
export const DRIVE_TTL_MS = 24 * 60 * 60 * 1000;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const CODE_LENGTH = 6;

export class DriveError extends Error {}

interface Options {
  now?: () => number;
  newId?: () => string;
  newCode?: () => string;
}

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
  private now: () => number;
  private newId: () => string;
  private newCode: () => string;

  constructor(opts: Options = {}) {
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? randomUUID;
    this.newCode = opts.newCode ?? randomCode;
  }

  get(code: string): Drive | undefined {
    return this.drives.get(code.trim().toUpperCase());
  }

  create(p: CreateDrivePayload): JoinedDrive {
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
      this.checkArrival(drive, member);
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
      return undefined;
    }
    if (drive.hostId === memberId) {
      drive.hostId = drive.members[0].id;
      drive.members[0].isHost = true;
    }
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
    this.touch(drive.code);
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
