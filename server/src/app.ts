import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import type {
  Ack,
  ClientToServerEvents,
  Drive,
  LatLng,
  RouteRequest,
  ServerToClientEvents,
} from '../../shared/types.ts';
import { DriveError, DriveStore } from './drives.ts';
import { searchPlaces } from './geocode.ts';
import { RoutingError, findScenicRoutes } from './scenic.ts';

export interface Config {
  valhallaUrl: string;
  photonUrl: string;
  fetchImpl?: typeof fetch;
  store?: DriveStore;
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
  const store = config.store ?? new DriveStore();
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
      if (!(err instanceof DriveError)) console.error(err);
      result = { ok: false, error: err instanceof DriveError ? err.message : 'Something went wrong' };
    }
    reply?.(result);
  };

  const enter = (socket: IOSocket, code: string, memberId: string) => {
    if (socket.data.code && socket.data.code !== code) void socket.leave(socket.data.code);
    socket.data = { code, memberId };
    void socket.join(code);
  };

  io.on('connection', (socket: IOSocket) => {
    socket.on('drive:create', (payload, ack) =>
      handle(ack, () => {
        const joined = store.create(payload);
        enter(socket, joined.drive.code, joined.memberId);
        return joined;
      }),
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

  return { app, httpServer, io, store };
}
