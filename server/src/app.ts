import { createServer } from 'node:http';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import { Server, type Socket } from 'socket.io';
import type {
  Ack,
  ClientToServerEvents,
  Drive,
  LatLng,
  RouteRequest,
  ServerToClientEvents,
} from '../../shared/types.ts';
import { ClubError, ClubStore } from './clubs.ts';
import { DriveError, DriveStore } from './drives.ts';
import { searchPlaces } from './geocode.ts';
import type { PremiumCheck } from './premium.ts';
import { RoutingError, findScenicRoutes } from './scenic.ts';

export interface Config {
  valhallaUrl: string;
  photonUrl: string;
  fetchImpl?: typeof fetch;
  clubs?: ClubStore;
  /** Gate for creating clubs. Defaults to allowing everyone (development). */
  premiumCheck?: PremiumCheck;
}

interface SocketData {
  code?: string;
  memberId?: string;
}

type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const isLatLng = (v: unknown): v is LatLng =>
  typeof v === 'object' &&
  v !== null &&
  Number.isFinite((v as LatLng).lat) &&
  Number.isFinite((v as LatLng).lng) &&
  Math.abs((v as LatLng).lat) <= 90 &&
  Math.abs((v as LatLng).lng) <= 180;

export function createApp(config: Config) {
  const clubs = config.clubs ?? new ClubStore();
  const premiumCheck = config.premiumCheck ?? (async () => true);
  // Finished club drives go into the club's history.
  const store = new DriveStore({
    onFinish: (drive) => {
      if (!drive.club || !drive.startedAt || !drive.finishedAt) return;
      clubs.recordDrive(drive.club.id, {
        driveCode: drive.code,
        name: drive.name,
        eventId: drive.club.eventId,
        startedAt: drive.startedAt,
        finishedAt: drive.finishedAt,
        start: drive.start,
        destination: drive.destination,
        distanceM: drive.route.distanceM,
        groupElapsedMs: drive.finishedAt - drive.startedAt,
        participants: (drive.results ?? []).map((r) => ({ name: r.name, elapsedMs: r.elapsedMs })),
      });
    },
  });
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' })); // routes carry their full path

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/places', async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) {
      res.json([]);
      return;
    }
    const near = { lat: Number(req.query.lat), lng: Number(req.query.lng) };
    try {
      res.json(await searchPlaces(q, config.photonUrl, isLatLng(near) ? near : undefined, config.fetchImpl));
    } catch (err) {
      console.error('place search failed', err);
      res.status(502).json({ error: 'Place search is unavailable right now' });
    }
  });

  app.post('/api/routes', async (req, res) => {
    const body = req.body as Partial<RouteRequest>;
    if (!isLatLng(body.start) || !isLatLng(body.end)) {
      res.status(400).json({ error: 'start and end must be {lat, lng}' });
      return;
    }
    try {
      const routes = await findScenicRoutes(
        { start: body.start, end: body.end, adventure: Number(body.adventure ?? 0.7) },
        config.valhallaUrl,
        config.fetchImpl,
      );
      res.json(routes);
    } catch (err) {
      if (err instanceof RoutingError) {
        res.status(err.status).json({ error: err.message });
      } else {
        console.error('routing failed', err);
        res.status(502).json({ error: 'Routing is unavailable right now' });
      }
    }
  });

  app.get('/api/drives/:code', (req, res) => {
    const drive = store.get(req.params.code);
    if (drive) res.json(drive);
    else res.status(404).json({ error: 'No drive found with that code' });
  });

  // ---- Clubs (Premium) ----------------------------------------------------

  const token = (req: Request) => req.header('x-club-token') ?? undefined;
  /** Runs a club operation and maps ClubErrors to HTTP statuses. */
  const club =
    (fn: (req: Request) => unknown | Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        res.json(await fn(req));
      } catch (err) {
        if (err instanceof ClubError) {
          res.status(err.status).json({ error: err.message });
        } else {
          console.error(err);
          res.status(500).json({ error: 'Something went wrong' });
        }
      }
    };
  const id = (req: Request, key: string) => String(req.params[key]);

  app.post(
    '/api/clubs',
    club(async (req) => {
      const allowed = await premiumCheck(req.body?.appUserId).catch(() => false);
      if (!allowed) throw new ClubError('Creating a club needs B-Roads Premium', 402);
      return clubs.create(req.body?.name, req.body?.ownerName);
    }),
  );
  app.post('/api/clubs/join', club((req) => clubs.join(req.body?.inviteCode, req.body?.name)));
  app.get('/api/clubs/:clubId', club((req) => clubs.get(id(req, 'clubId'), token(req))));
  app.post(
    '/api/clubs/:clubId/leave',
    club((req) => {
      clubs.leave(id(req, 'clubId'), token(req));
      return { ok: true };
    }),
  );
  app.post(
    '/api/clubs/:clubId/members/:memberId/role',
    club((req) => clubs.setRole(id(req, 'clubId'), token(req), id(req, 'memberId'), req.body?.role)),
  );
  app.post('/api/clubs/:clubId/routes', club((req) => clubs.saveRoute(id(req, 'clubId'), token(req), req.body ?? {})));
  app.delete(
    '/api/clubs/:clubId/routes/:routeId',
    club((req) => clubs.deleteRoute(id(req, 'clubId'), token(req), id(req, 'routeId'))),
  );
  app.post('/api/clubs/:clubId/events', club((req) => clubs.createEvent(id(req, 'clubId'), token(req), req.body ?? {})));
  app.delete(
    '/api/clubs/:clubId/events/:eventId',
    club((req) => clubs.deleteEvent(id(req, 'clubId'), token(req), id(req, 'eventId'))),
  );
  app.post(
    '/api/clubs/:clubId/events/:eventId/rsvp',
    club((req) => clubs.rsvp(id(req, 'clubId'), token(req), id(req, 'eventId'), req.body?.status)),
  );

  const httpServer = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    httpServer,
    // Creating a drive uploads the full route geometry.
    { cors: { origin: '*' }, maxHttpBufferSize: 5e6 },
  );

  const broadcast = (drive: Drive | undefined) => {
    if (drive) io.to(drive.code).emit('drive:update', drive);
  };

  /** Runs a store operation and reports DriveErrors back through the ack. */
  const handle = <T>(ack: Ack<T> | undefined, fn: () => T) => {
    // Clients are untrusted: a missing or bogus ack must not throw.
    const reply = typeof ack === 'function' ? ack : undefined;
    let result: Parameters<Ack<T>>[0];
    try {
      result = { ok: true, data: fn() };
    } catch (err) {
      const known = err instanceof DriveError || err instanceof ClubError;
      if (!known) console.error(err);
      result = { ok: false, error: known ? (err as Error).message : 'Something went wrong' };
    }
    reply?.(result);
  };

  /** Runs a host-only convoy action for the caller's current drive. */
  const hostAction = (socket: IOSocket, ack: Ack<Drive> | undefined, fn: (code: string, memberId: string) => Drive) =>
    handle(ack, () => {
      const { code, memberId } = socket.data;
      if (!code || !memberId) throw new DriveError('Join a drive first');
      const drive = fn(code, memberId);
      broadcast(drive);
      return drive;
    });

  const enter = (socket: IOSocket, code: string, memberId: string) => {
    if (socket.data.code && socket.data.code !== code) void socket.leave(socket.data.code);
    socket.data = { code, memberId };
    void socket.join(code);
  };

  io.on('connection', (socket: IOSocket) => {
    socket.on('drive:create', (payload, ack) =>
      handle(ack, () => {
        const { club: clubAuth, ...rest } = payload ?? ({} as typeof payload);
        let clubInfo: { id: string; name: string; eventId?: string } | undefined;
        if (clubAuth) {
          const { club } = clubs.requireOrganiser(clubAuth.clubId, clubAuth.token);
          const eventId = club.events.some((e) => e.id === clubAuth.eventId) ? clubAuth.eventId : undefined;
          clubInfo = { id: club.id, name: club.name, eventId };
        }
        const joined = store.create({ ...rest, club: clubInfo });
        if (clubInfo?.eventId) clubs.linkEventDrive(clubInfo.id, clubInfo.eventId, joined.drive.code);
        enter(socket, joined.drive.code, joined.memberId);
        return joined;
      }),
    );

    socket.on('drive:setRole', (p, ack) =>
      hostAction(socket, ack, (code, memberId) => store.setConvoyRole(code, memberId, p?.memberId, p?.role ?? null)),
    );
    socket.on('drive:addRegroup', (p, ack) =>
      hostAction(socket, ack, (code, memberId) => store.addRegroupPoint(code, memberId, p?.name, p?.location)),
    );
    socket.on('drive:removeRegroup', (p, ack) =>
      hostAction(socket, ack, (code, memberId) => store.removeRegroupPoint(code, memberId, p?.id)),
    );

    socket.on('drive:join', (payload, ack) =>
      handle(ack, () => {
        const joined = store.join(payload.code, payload.memberName, payload.memberId);
        enter(socket, joined.drive.code, joined.memberId);
        broadcast(joined.drive);
        return joined;
      }),
    );

    socket.on('drive:start', (ack) =>
      handle(ack, () => {
        const { code, memberId } = socket.data;
        if (!code || !memberId) throw new DriveError('Join a drive first');
        const drive = store.start(code, memberId);
        broadcast(drive);
        return drive;
      }),
    );

    socket.on('drive:end', (ack) =>
      handle(ack, () => {
        const { code, memberId } = socket.data;
        if (!code || !memberId) throw new DriveError('Join a drive first');
        const drive = store.end(code, memberId);
        broadcast(drive);
        return drive;
      }),
    );

    socket.on('drive:position', (pos) => {
      const { code, memberId } = socket.data;
      if (!code || !memberId) return;
      handle(undefined, () => broadcast(store.updatePosition(code, memberId, pos)));
    });

    socket.on('drive:leave', () => {
      const { code, memberId } = socket.data;
      if (!code || !memberId) return;
      void socket.leave(code);
      socket.data = {};
      broadcast(store.leave(code, memberId));
    });

    socket.on('disconnect', () => {
      const { code, memberId } = socket.data;
      if (code && memberId) broadcast(store.setConnected(code, memberId, false));
    });
  });

  const sweeper = setInterval(() => store.sweep(), 60 * 60 * 1000);
  sweeper.unref();

  return { app, httpServer, io, store, clubs };
}
