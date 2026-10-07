import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Place, ScenicRoute } from '../../../shared/types';
import { billingEnabled, configureBilling } from '../lib/premium';
import { keys, load, save } from '../lib/storage';

interface AppState {
  ready: boolean;
  driverName: string;
  setDriverName: (name: string) => void;
  premium: boolean;
  /** Only used when billing isn't configured (development builds). */
  setDevPremium: (on: boolean) => void;
  setPremium: (on: boolean) => void;

  // Planner selections shared between the planner and drive screens.
  start: Place | null;
  setStart: (p: Place | null) => void;
  destination: Place | null;
  setDestination: (p: Place | null) => void;
  routes: ScenicRoute[];
  setRoutes: (r: ScenicRoute[]) => void;
  selectedRouteId: string | null;
  setSelectedRouteId: (id: string | null) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [driverName, setName] = useState('');
  const [premium, setPremium] = useState(false);
  const [start, setStart] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [routes, setRoutes] = useState<ScenicRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setName((await load(keys.driverName)) ?? '');
      if (billingEnabled) configureBilling(setPremium);
      else setPremium((await load(keys.devPremium)) === '1');
      setReady(true);
    })();
  }, []);

  const setDriverName = useCallback((name: string) => {
    setName(name);
    void save(keys.driverName, name.trim() || null);
  }, []);

  const setDevPremium = useCallback((on: boolean) => {
    setPremium(on);
    void save(keys.devPremium, on ? '1' : null);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      driverName,
      setDriverName,
      premium,
      setPremium,
      setDevPremium,
      start,
      setStart,
      destination,
      setDestination,
      routes,
      setRoutes,
      selectedRouteId,
      setSelectedRouteId,
    }),
    [ready, driverName, setDriverName, premium, setDevPremium, start, destination, routes, selectedRouteId],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
