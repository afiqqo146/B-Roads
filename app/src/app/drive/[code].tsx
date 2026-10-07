import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Drive } from '../../../../shared/types';
import { MemberRow, memberColor } from '../../components/MemberRow';
import { Button, ErrorText, styles as ui } from '../../components/ui';
import { useAppState } from '../../context/AppState';
import { useDrive } from '../../hooks/useDrive';
import { useLocation } from '../../hooks/useLocation';
import { formatDistance, formatDuration } from '../../lib/format';
import { guidanceAt, toMapCoord } from '../../lib/geo';
import { colors, radius } from '../../lib/theme';

const OFF_ROUTE_M = 120;

function KeepAwake() {
  useKeepAwake();
  return null;
}

/** Re-renders every second while running so the clock ticks. */
function useNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return now;
}

export default function DriveScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { driverName, premium } = useAppState();
  const { fix, error: locationError } = useLocation(true, true);
  const { drive, me, isHost, connected, error, start, end, leave } = useDrive(code, driverName, fix);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const map = useRef<MapView>(null);
  const now = useNow(drive?.status === 'driving');

  const guidance = useMemo(() => {
    if (!drive || !fix || drive.status !== 'driving' || me?.arrivedAt) return null;
    return guidanceAt(drive.route, fix);
  }, [drive, fix, me?.arrivedAt]);

  // Frame the whole route once we have it.
  const framed = useRef(false);
  useEffect(() => {
    if (!drive || framed.current) return;
    framed.current = true;
    setTimeout(
      () =>
        map.current?.fitToCoordinates(drive.route.path.map(toMapCoord), {
          edgePadding: { top: 180, bottom: 360, left: 40, right: 40 },
          animated: false,
        }),
      300,
    );
  }, [drive]);

  // While driving, follow our own car.
  useEffect(() => {
    if (drive?.status === 'driving' && fix && !me?.arrivedAt) {
      map.current?.animateCamera({ center: { latitude: fix.lat, longitude: fix.lng }, heading: fix.heading ?? 0, zoom: 15 }, { duration: 800 });
    }
  }, [fix, drive?.status, me?.arrivedAt]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const exit = () => {
    const go = () => {
      leave();
      router.dismissTo('/');
    };
    if (drive?.status === 'driving') {
      Alert.alert('Leave this drive?', "You won't get a time and the group won't wait for you.", [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: go },
      ]);
    } else go();
  };

  const invite = () =>
    Share.share({
      message: `Join my B-Roads drive "${drive?.name}" to ${drive?.destination.name}! Code: ${code}\nbroads://join?code=${code}`,
    });

  const pitStop = () => router.push(premium ? { pathname: '/pitstop', params: { code } } : '/premium');

  if (!drive) {
    return (
      <SafeAreaView style={[ui.screen, { padding: 16, gap: 12 }]}>
        <Text style={ui.h2}>{error ? "Couldn't open drive" : 'Connecting…'}</Text>
        <ErrorText>{error}</ErrorText>
        <Button title="Back" variant="secondary" onPress={() => router.dismissTo('/')} />
      </SafeAreaView>
    );
  }

  const elapsed = drive.startedAt ? (drive.finishedAt ?? now) - drive.startedAt : 0;
  const arrived = drive.members.filter((m) => m.arrivedAt).length;

  return (
    <View style={ui.screen}>
      {drive.status === 'driving' && <KeepAwake />}
      <MapView ref={map} style={StyleSheet.absoluteFill} showsUserLocation userInterfaceStyle="dark" showsCompass={false}>
        <Polyline coordinates={drive.route.path.map(toMapCoord)} strokeColor={colors.accent} strokeWidth={6} />
        <Marker coordinate={toMapCoord(drive.destination.location)} title={drive.destination.name} />
        {drive.members
          .filter((m) => m.position && m.id !== me?.id)
          .map((m) => (
            <Marker
              key={m.id}
              coordinate={toMapCoord(m.position!)}
              title={m.name}
              pinColor={memberColor(drive, m.id)}
              description={m.distanceToGoalM != null ? `${formatDistance(m.distanceToGoalM)} to go` : undefined}
            />
          ))}
      </MapView>

      <SafeAreaView edges={['top']} style={s.top} pointerEvents="box-none">
        <View style={s.topRow}>
          <Pressable onPress={exit} style={s.chip}>
            <Text style={s.chipText}>✕</Text>
          </Pressable>
          <View style={[s.chip, { flex: 1 }]}>
            <Text style={s.chipText} numberOfLines={1}>
              {drive.name}
            </Text>
          </View>
          {!connected && (
            <View style={[s.chip, { backgroundColor: colors.danger }]}>
              <Text style={[s.chipText, { color: colors.accentText }]}>Offline</Text>
            </View>
          )}
        </View>
        {guidance && <GuidanceBanner {...guidance} />}
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={s.sheet}>
        <ScrollView contentContainerStyle={{ gap: 12 }}>
          {drive.status === 'lobby' && (
            <>
              <View style={s.codeRow}>
                <View>
                  <Text style={ui.label}>Drive code</Text>
                  <Text style={s.code}>{drive.code}</Text>
                </View>
                <Button title="Invite" variant="secondary" onPress={invite} />
              </View>
              <Text style={ui.muted}>
                {isHost ? 'Start when everyone is at the meeting point.' : 'Waiting for the host to start the drive…'}
              </Text>
            </>
          )}

          {drive.status !== 'lobby' && (
            <View style={s.statsRow}>
              <Stat label={drive.status === 'finished' ? 'Drive time' : 'Elapsed'} value={formatDuration(me?.arrivedAt && drive.startedAt ? me.arrivedAt - drive.startedAt : elapsed)} />
              <Stat label="To go" value={me?.arrivedAt ? 'Arrived' : me?.distanceToGoalM != null ? formatDistance(me.distanceToGoalM) : '—'} />
              <Stat label="Arrived" value={`${arrived}/${drive.members.length}`} />
            </View>
          )}

          {drive.status === 'finished' ? (
            <Results drive={drive} myId={me?.id} />
          ) : (
            <View>
              {drive.members.map((m) => (
                <MemberRow key={m.id} drive={drive} member={m} isMe={m.id === me?.id} />
              ))}
            </View>
          )}

          <ErrorText>{actionError ?? locationError}</ErrorText>

          <View style={s.actions}>
            {drive.status !== 'lobby' && (
              <Button title={premium ? 'Pit stop photo' : 'Pit stop photo ★'} icon="📸" variant={premium ? 'secondary' : 'premium'} style={{ flex: 1 }} onPress={pitStop} />
            )}
            {isHost && drive.status === 'lobby' && <Button title="Start drive" style={{ flex: 1 }} loading={busy} onPress={() => run(start)} />}
            {isHost && drive.status === 'driving' && drive.members.length > 1 && (
              <Button
                title="End for all"
                variant="danger"
                loading={busy}
                onPress={() =>
                  Alert.alert('End the drive for everyone?', "Drivers who haven't arrived won't get a time.", [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'End drive', style: 'destructive', onPress: () => run(end) },
                  ])
                }
              />
            )}
            {drive.status === 'finished' && <Button title="Done" style={{ flex: 1 }} onPress={exit} />}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function GuidanceBanner({ step, distanceToStepM, offRouteM }: { step: Drive['route']['steps'][number]; distanceToStepM: number; offRouteM: number }) {
  return (
    <View style={s.banner}>
      <Text style={s.bannerDistance}>{formatDistance(distanceToStepM)}</Text>
      <Text style={s.bannerText}>{step.instruction}</Text>
      {offRouteM > OFF_ROUTE_M && <Text style={s.offRoute}>{"You're off the planned route - head back to the orange line."}</Text>}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={ui.label}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

function Results({ drive, myId }: { drive: Drive; myId?: string }) {
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <View style={{ gap: 6 }}>
      <Text style={ui.h2}>🏁 Results</Text>
      {(drive.results ?? []).map((r) => (
        <View key={r.memberId} style={s.resultRow}>
          <Text style={s.resultRank}>{r.rank ? (medals[r.rank - 1] ?? `${r.rank}.`) : '—'}</Text>
          <Text style={[s.resultName, r.memberId === myId && { color: colors.accent }]} numberOfLines={1}>
            {r.name}
          </Text>
          <Text style={s.resultTime}>{r.elapsedMs != null ? formatDuration(r.elapsedMs) : 'DNF'}</Text>
        </View>
      ))}
      <Text style={ui.muted}>
        {drive.start.name} → {drive.destination.name} · {formatDistance(drive.route.distanceM)}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, gap: 8 },
  topRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chip: { backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  banner: { backgroundColor: colors.accent, borderRadius: radius.lg, padding: 16, gap: 2 },
  bannerDistance: { color: colors.accentText, fontSize: 28, fontWeight: '900' },
  bannerText: { color: colors.accentText, fontSize: 18, fontWeight: '700' },
  offRoute: { color: colors.accentText, fontSize: 14, marginTop: 6, fontWeight: '600' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '55%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: 6 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 10, paddingBottom: 8 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  resultRank: { width: 32, fontSize: 20, color: colors.text, textAlign: 'center' },
  resultName: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
  resultTime: { color: colors.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
