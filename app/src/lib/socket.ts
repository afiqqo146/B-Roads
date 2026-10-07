import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/types';
import { API_URL } from './config';

export type DriveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: DriveSocket | undefined;

export function getSocket(): DriveSocket {
  socket ??= io(API_URL, { transports: ['websocket'], reconnectionDelayMax: 5000 });
  return socket;
}

type AckResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Emits an event that takes an ack callback and resolves with its data. */
export function call<T>(send: (ack: (res: AckResult<T>) => void) => void, timeoutMs = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The server didn't answer. Check your connection.")), timeoutMs);
    send((res) => {
      clearTimeout(timer);
      if (res.ok) resolve(res.data);
      else reject(new Error(res.error));
    });
  });
}
