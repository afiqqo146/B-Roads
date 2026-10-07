import { useCallback, useEffect, useRef, useState } from 'react';
import type { Drive, JoinedDrive } from '../../../shared/types';
import { call, getSocket } from '../lib/socket';
import { keys, load, save } from '../lib/storage';
import type { Fix } from './useLocation';

/**
 * Keeps this phone in a group drive: (re)joins on every socket connect,
 * mirrors the server's drive state and streams our position.
 */
export function useDrive(code: string, driverName: string, fix: Fix | null) {
  const [drive, setDrive] = useState<Drive | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const memberIdRef = useRef<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    let active = true;

    const join = async () => {
      const storedId = memberIdRef.current ?? (await load(keys.memberId(code)));
      try {
        const joined = await call<JoinedDrive>((ack) =>
          socket.emit('drive:join', { code, memberName: driverName, memberId: storedId ?? undefined }, ack),
        );
        if (!active) return;
        memberIdRef.current = joined.memberId;
        setMemberId(joined.memberId);
        setDrive(joined.drive);
        setError(null);
        void save(keys.memberId(code), joined.memberId);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      }
    };

    const onConnect = () => {
      setConnected(true);
      void join();
    };
    const onDisconnect = () => setConnected(false);
    const onUpdate = (d: Drive) => d.code === code && setDrive(d);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('drive:update', onUpdate);
    if (socket.connected) onConnect();
    else socket.connect();

    return () => {
      active = false;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('drive:update', onUpdate);
    };
  }, [code, driverName]);

  // Stream our position. The server ignores it once the drive is finished.
  useEffect(() => {
    if (!fix || !memberId || drive?.status === 'finished') return;
    getSocket().emit('drive:position', fix);
  }, [fix, memberId, drive?.status]);

  const start = useCallback(() => call<Drive>((ack) => getSocket().emit('drive:start', ack)).then(setDrive), []);
  const end = useCallback(() => call<Drive>((ack) => getSocket().emit('drive:end', ack)).then(setDrive), []);
  const leave = useCallback(() => {
    getSocket().emit('drive:leave');
    memberIdRef.current = null;
    void save(keys.memberId(code), null);
  }, [code]);

  const me = drive?.members.find((m) => m.id === memberId);
  return { drive, memberId, me, isHost: !!me && drive?.hostId === me.id, connected, error, start, end, leave };
}
