// Types shared by the B-Roads app and server. The app only imports these with
// `import type`, so nothing here may contain runtime code.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place {
  name: string;
  /** Secondary line for search results, e.g. "Ipoh, Perak, Malaysia". */
  detail?: string;
  location: LatLng;
}

/** 0 = relaxed back roads, 1 = as twisty and remote as we can find. */
export type AdventureLevel = number;

export interface RouteRequest {
  start: LatLng;
  end: LatLng;
  adventure?: AdventureLevel;
}

export interface RouteStep {
  instruction: string;
  streetNames: string[];
  /** Metres covered by this step. */
  distanceM: number;
  /** Seconds this step is expected to take. */
  durationS: number;
  /** Where the manoeuvre happens. */
  location: LatLng;
  /** Index into ScenicRoute.path where this step starts. */
  pathIndex: number;
}

export interface ScenicRoute {
  id: string;
  path: LatLng[];
  distanceM: number;
  durationS: number;
  steps: RouteStep[];
  /** Average absolute heading change in degrees per kilometre. */
  twistiness: number;
  /** Fraction (0..1) of distance on motorways / dual-carriageway trunk roads. */
  highwayShare: number;
  /** Fraction (0..1) of distance on toll roads. */
  tollShare: number;
  /** 0..100, higher is more scenic/adventurous. Routes are sorted by this. */
  scenicScore: number;
}

export type DriveStatus = 'lobby' | 'driving' | 'finished';

export interface MemberPosition extends LatLng {
  speedKmh?: number;
  heading?: number;
  updatedAt: number;
}

export interface DriveMember {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  position?: MemberPosition;
  distanceToGoalM?: number;
  /** Epoch ms when the member reached the destination. */
  arrivedAt?: number;
}

export interface DriveResult {
  memberId: string;
  name: string;
  /** Null when the member did not finish before the drive was ended. */
  elapsedMs: number | null;
  rank: number | null;
}

export interface Drive {
  code: string;
  name: string;
  hostId: string;
  start: Place;
  destination: Place;
  route: ScenicRoute;
  status: DriveStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  members: DriveMember[];
  results?: DriveResult[];
}

// ---- Socket.IO contract -------------------------------------------------

export type Ack<T> = (res: { ok: true; data: T } | { ok: false; error: string }) => void;

export interface JoinedDrive {
  drive: Drive;
  memberId: string;
}

export interface CreateDrivePayload {
  name: string;
  memberName: string;
  start: Place;
  destination: Place;
  route: ScenicRoute;
}

export interface JoinDrivePayload {
  code: string;
  memberName: string;
  /** Pass a previous memberId to rejoin after a reconnect. */
  memberId?: string;
}

export interface PositionPayload {
  lat: number;
  lng: number;
  speedKmh?: number;
  heading?: number;
}

export interface ClientToServerEvents {
  'drive:create': (p: CreateDrivePayload, ack: Ack<JoinedDrive>) => void;
  'drive:join': (p: JoinDrivePayload, ack: Ack<JoinedDrive>) => void;
  'drive:start': (ack: Ack<Drive>) => void;
  'drive:end': (ack: Ack<Drive>) => void;
  'drive:leave': () => void;
  'drive:position': (p: PositionPayload) => void;
}

export interface ServerToClientEvents {
  'drive:update': (drive: Drive) => void;
}
