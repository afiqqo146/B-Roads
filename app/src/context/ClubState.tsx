import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Club, ClubMember } from '../../../shared/types';
import { clubApi, type StoredClubSession } from '../lib/clubApi';
import { keys, load, save } from '../lib/storage';

interface ClubState {
  session: StoredClubSession | null;
  club: Club | null;
  me: ClubMember | null;
  isOrganiser: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Saves a session from creating or joining a club. */
  enter: (session: StoredClubSession, club: Club) => void;
  /** Applies a club returned by an API call. */
  update: (club: Club) => void;
  forget: () => void;
}

const Ctx = createContext<ClubState | null>(null);

export function ClubStateProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredClubSession | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const forget = useCallback(() => {
    setSession(null);
    setClub(null);
    void save(keys.clubSession, null);
  }, []);

  const fetchClub = useCallback(
    async (s: StoredClubSession) => {
      setLoading(true);
      try {
        setClub(await clubApi.get(s));
        setError(null);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // Removed from the club, or the club is gone: drop the stale session.
        if (/not a member|not found/i.test(message)) forget();
        else setError(message);
      } finally {
        setLoading(false);
      }
    },
    [forget],
  );

  useEffect(() => {
    (async () => {
      const raw = await load(keys.clubSession);
      const stored = raw ? (JSON.parse(raw) as StoredClubSession) : null;
      setSession(stored);
      if (stored) await fetchClub(stored);
      else setLoading(false);
    })().catch(() => setLoading(false));
  }, [fetchClub]);

  const refresh = useCallback(async () => {
    if (session) await fetchClub(session);
  }, [session, fetchClub]);

  const enter = useCallback((s: StoredClubSession, c: Club) => {
    setSession(s);
    setClub(c);
    setError(null);
    void save(keys.clubSession, JSON.stringify(s));
  }, []);

  const me = club?.members.find((m) => m.id === session?.memberId) ?? null;

  const value = useMemo(
    () => ({
      session,
      club,
      me,
      isOrganiser: !!me && me.role !== 'member',
      loading,
      error,
      refresh,
      enter,
      update: setClub,
      forget,
    }),
    [session, club, me, loading, error, refresh, enter, forget],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useClub(): ClubState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useClub must be used inside ClubStateProvider');
  return ctx;
}
