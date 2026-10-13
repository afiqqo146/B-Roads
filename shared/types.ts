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

/** Convoy roles, available on club drives (Premium). */
export type ConvoyRole = 'lead' | 'sweep';

export interface DriveMember {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  position?: MemberPosition;
  distanceToGoalM?: number;
  /** Epoch ms when the member reached the destination. */
  arrivedAt?: number;
  convoyRole?: ConvoyRole;
  /** Metres driven along the planned route. */
  progressM?: number;
  /** Club drives: how far this car is behind the front of the convoy. */
  behindM?: number;
  /** Club drives: true once the gap to the front is over the alert threshold. */
  fallingBehind?: boolean;
}

export interface RegroupPoint {
  id: string;
  name: string;
  location: LatLng;
  /** Members who have reached it. */
  reachedBy: string[];
}

export interface DriveResult {
  memberId: string;
  name: string;
  /** Null when the member did not finish before the drive was ended. */
  elapsedMs: number | null;
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
  /** Set on club drives, which unlock the convoy tools. */
  club?: { id: string; name: string; eventId?: string };
  regroupPoints: RegroupPoint[];
}

// ---- Clubs (Premium) ------------------------------------------------------

export type ClubRole = 'owner' | 'organiser' | 'member';

export interface ClubMember {
  id: string;
  name: string;
  role: ClubRole;
  joinedAt: number;
}

export interface SavedRoute {
  id: string;
  name: string;
  notes?: string;
  start: Place;
  destination: Place;
  route: ScenicRoute;
  savedBy: string;
  createdAt: number;
}

export type RsvpStatus = 'going' | 'maybe' | 'no';

export interface ClubEvent {
  id: string;
  title: string;
  description?: string;
  /** Epoch ms when drivers meet. */
  meetAt: number;
  meetingPoint: Place;
  routeId?: string;
  createdBy: string;
  rsvps: { memberId: string; name: string; status: RsvpStatus }[];
  /** Code of the live drive once an organiser starts it. */
  driveCode?: string;
}

export interface DriveRecord {
  driveCode: string;
  name: string;
  eventId?: string;
  startedAt: number;
  finishedAt: number;
  start: Place;
  destination: Place;
  distanceM: number;
  /** Start to the last car arriving (or the drive being ended). */
  groupElapsedMs: number;
  participants: { name: string; elapsedMs: number | null }[];
}

/** What members see; secrets such as member tokens never leave the server. */
export interface Club {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: number;
  members: ClubMember[];
  routes: SavedRoute[];
  events: ClubEvent[];
  history: DriveRecord[];
}

/** Returned when creating or joining a club. Keep the token secret on the device. */
export interface ClubSession {
  club: Club;
  memberId: string;
  token: string;
}

export interface ClubAuth {
  clubId: string;
  token: string;
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
  /** Makes it a club drive; the caller must be an organiser of that club. */
  club?: ClubAuth & { eventId?: string };
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
  // Club drives only, host only.
  'drive:setRole': (p: { memberId: string; role: ConvoyRole | null }, ack: Ack<Drive>) => void;
  'drive:addRegroup': (p: { name: string; location: LatLng }, ack: Ack<Drive>) => void;
  'drive:removeRegroup': (p: { id: string }, ack: Ack<Drive>) => void;
}

export interface ServerToClientEvents {
  'drive:update': (drive: Drive) => void;
}
