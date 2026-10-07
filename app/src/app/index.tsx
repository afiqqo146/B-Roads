import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MY_LOCATION_NAME, PlaceSearch } from '../components/PlaceSearch';
import { RouteCard } from '../components/RouteCard';
import { Button, ErrorText } from '../components/ui';
import { useAppState } from '../context/AppState';
import { useLocation } from '../hooks/useLocation';
import { findRoutes } from '../lib/api';
import { toMapCoord } from '../lib/geo';
import { colors, radius } from '../lib/theme';

const ADVENTURE = [
  { label: 'Relaxed', value: 0.3 },
  { label: 'Balanced', value: 0.7 },
  { label: 'Wild', value: 1 },
] as const;

export default function PlanScreen() {
  const app = useAppState();
  const { start, setStart, destination, setDestination, routes, setRoutes, selectedRouteId, setSelectedRouteId } = app;
  const { fix, error: locationError } = useLocation();
  const [adventure, setAdventure] = useState<number>(0.7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const map = useRef<MapView>(null);

  const lat = fix?.lat;
  const lng = fix?.lng;
  const here = useMemo(() => (lat != null && lng != null ? { lat, lng } : undefined), [lat, lng]);

  // On the first fix, centre the map and default the start to where we are.
  const centred = useRef(false);
  useEffect(() => {
    if (!here) return;
    if (!start) setStart({ name: MY_LOCATION_NAME, location: here });
    if (!centred.current && routes.length === 0) {
      centred.current = true;
      map.current?.animateToRegion({ latitude: here.lat, longitude: here.lng, latitudeDelta: 0.3, longitudeDelta: 0.3 });
    }
  }, [here, start, setStart, routes.length]);

  const selected = routes.find((r) => r.id === selectedRouteId) ?? null;

  const fit = (coords: { latitude: number; longitude: number }[]) =>
    map.current?.fitToCoordinates(coords, {
      edgePadding: { top: 260, bottom: 300, left: 40, right: 40 },
      animated: true,
    });

  const search = async () => {
    if (!start || !destination) return;
    setLoading(true);
    setError(null);
    try {
      const found = await findRoutes(start.location, destination.location, adventure);
      setRoutes(found);
      setSelectedRouteId(found[0]?.id ?? null);
      if (found[0]) fit(found.flatMap((r) => r.path).map(toMapCoord));
    } catch (e) {
      setRoutes([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const clearRoutes = () => {
    setRoutes([]);
    setSelectedRouteId(null);
  };

  return (
    <View style={s.screen}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        showsUserLocation
        userInterfaceStyle="dark"
        initialRegion={{ latitude: 3.139, longitude: 101.6869, latitudeDelta: 0.6, longitudeDelta: 0.6 }}
      >
        {routes
          .filter((r) => r.id !== selectedRouteId)
          .map((r) => (
            <Polyline
              key={r.id}
              coordinates={r.path.map(toMapCoord)}
              strokeColor="#6B7280"
              strokeWidth={4}
              tappable
              onPress={() => setSelectedRouteId(r.id)}
            />
          ))}
        {selected && <Polyline coordinates={selected.path.map(toMapCoord)} strokeColor={colors.accent} strokeWidth={6} zIndex={2} />}
        {start && start.name !== MY_LOCATION_NAME && <Marker coordinate={toMapCoord(start.location)} title={start.name} pinColor="green" />}
        {destination && <Marker coordinate={toMapCoord(destination.location)} title={destination.name} />}
      </MapView>

      <SafeAreaView edges={['top']} style={s.top} pointerEvents="box-none">
        <View style={s.brandRow}>
          <Text style={s.brand}>
            B<Text style={{ color: colors.accent }}>-</Text>ROADS
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable style={s.chip} onPress={() => router.push('/join')}>
              <Text style={s.chipText}>Join drive</Text>
            </Pressable>
            <Pressable style={s.chip} onPress={() => router.push('/settings')} accessibilityLabel="Settings">
              <Text style={s.chipText}>☰</Text>
            </Pressable>
          </View>
        </View>
        <View style={s.panel}>
          <PlaceSearch
            icon="🟢"
            placeholder="Start"
            value={start}
            onChange={(p) => {
              setStart(p);
              clearRoutes();
            }}
            near={here}
            currentLocation={here}
          />
          <PlaceSearch
            icon="🏁"
            placeholder="Where are we heading?"
            value={destination}
            onChange={(p) => {
              setDestination(p);
              clearRoutes();
            }}
            near={here}
          />
          <View style={s.segment}>
            {ADVENTURE.map((a) => (
              <Pressable
                key={a.label}
                onPress={() => {
                  setAdventure(a.value);
                  clearRoutes();
                }}
                style={[s.segmentItem, adventure === a.value && s.segmentActive]}
              >
                <Text style={[s.segmentText, adventure === a.value && s.segmentTextActive]}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
          {routes.length === 0 && (
            <Button title="Find B-roads" onPress={search} loading={loading} disabled={!start || !destination} />
          )}
          <ErrorText>{error ?? locationError}</ErrorText>
        </View>
      </SafeAreaView>

      {routes.length > 0 && (
        <SafeAreaView edges={['bottom']} style={s.bottom}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
            {routes.map((r, i) => (
              <RouteCard key={r.id} route={r} best={i === 0} selected={r.id === selectedRouteId} onPress={() => setSelectedRouteId(r.id)} />
            ))}
          </ScrollView>
          <View style={s.actions}>
            <Button
              title="Drive solo"
              variant="secondary"
              style={{ flex: 1 }}
              disabled={!selected}
              onPress={() => router.push({ pathname: '/new-drive', params: { solo: '1' } })}
            />
            <Button
              title="Group drive"
              style={{ flex: 1 }}
              disabled={!selected}
              onPress={() => router.push('/new-drive')}
            />
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, gap: 8 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  brand: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: 1, textShadowColor: '#000', textShadowRadius: 6 },
  chip: { backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { color: colors.text, fontWeight: '700' },
  panel: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 12, gap: 8 },
  segment: { flexDirection: 'row', backgroundColor: colors.cardRaised, borderRadius: radius.sm, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm - 2 },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { color: colors.muted, fontWeight: '700' },
  segmentTextActive: { color: colors.accentText },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 10, paddingBottom: 8 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
});
