import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, Vibration, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ConvoyRole, Drive, DriveMember } from '../../../../shared/types';
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
  const { driverName } = useAppState();
  const { fix, error: locationError } = useLocation(true, true);
  const { drive, me, isHost, connected, error, start, end, leave, setConvoyRole, addRegroup, removeRegroup } = useDrive(
    code,
    driverName,
    fix,
  );
  const [busy, setBusy] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
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

  const pitStop = () => router.push({ pathname: '/pitstop', params: { code } });

  // ---- Convoy tools (club drives) ----
  const convoy = !!drive?.club && drive.status !== 'finished';
  const canManageConvoy = convoy && isHost;
  const behind = drive?.members.filter((m) => m.fallingBehind && m.id !== me?.id) ?? [];

  // Buzz the people looking after the convoy when a car newly drops back.
  const alerted = useRef(new Set<string>());
  const behindKey = behind.map((m) => m.id).join(',');
  useEffect(() => {
    const ids = behindKey ? behindKey.split(',') : [];
    const fresh = ids.filter((id) => !alerted.current.has(id));
    alerted.current = new Set(ids);
    if (fresh.length && (isHost || me?.convoyRole)) Vibration.vibrate(400);
  }, [behindKey, isHost, me?.convoyRole]);

  const onMapLongPress = (coordinate: { latitude: number; longitude: number }) => {
    if (!canManageConvoy || !drive) return;
    const name = `Regroup ${drive.regroupPoints.length + 1}`;
    Alert.alert('Add a regroup point here?', 'Everyone will see it on their map, with a count of cars that have reached it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add', onPress: () => run(() => addRegroup(name, { lat: coordinate.latitude, lng: coordinate.longitude })) },
    ]);
  };

  const assignRole = (member: DriveMember, role: ConvoyRole | null) => {
    setSelectedMember(null);
    void run(() => setConvoyRole(member.id, role));
  };

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
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        showsUserLocation
        userInterfaceStyle="dark"
        showsCompass={false}
        onLongPress={(e) => onMapLongPress(e.nativeEvent.coordinate)}
      >
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
        {drive.regroupPoints.map((p) => (
          <Marker
            key={p.id}
            coordinate={toMapCoord(p.location)}
            title={`🚩 ${p.name}`}
            description={canManageConvoy ? 'Tap here to remove' : `${p.reachedBy.length}/${drive.members.length} cars here`}
            pinColor={colors.premium}
            onCalloutPress={() =>
              canManageConvoy &&
              Alert.alert(`Remove ${p.name}?`, undefined, [
                { text: 'Keep', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => run(() => removeRegroup(p.id)) },
              ])
            }
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
        {behind.length > 0 && (
          <View style={s.alert}>
            <Text style={s.alertText}>
              ⚠ {behind.map((m) => `${m.name} (${formatDistance(m.behindM ?? 0)})`).join(', ')}{' '}
              {behind.length === 1 ? 'is' : 'are'} falling behind
            </Text>
          </View>
        )}
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
              {canManageConvoy && (
                <Text style={[ui.muted, { color: colors.premium }]}>
                  Convoy tools: tap a driver to make them lead car or back-marker. Long-press the map to add regroup points.
                </Text>
              )}
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
                <View key={m.id}>
                  <Pressable
                    disabled={!canManageConvoy}
                    onPress={() => setSelectedMember(selectedMember === m.id ? null : m.id)}
                  >
                    <MemberRow drive={drive} member={m} isMe={m.id === me?.id} />
                  </Pressable>
                  {canManageConvoy && selectedMember === m.id && (
                    <View style={s.roleRow}>
                      <RoleChip label="Lead car" on={m.convoyRole === 'lead'} onPress={() => assignRole(m, 'lead')} />
                      <RoleChip label="Back-marker" on={m.convoyRole === 'sweep'} onPress={() => assignRole(m, 'sweep')} />
                      <RoleChip label="No role" on={!m.convoyRole} onPress={() => assignRole(m, null)} />
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {convoy && drive.regroupPoints.length > 0 && (
            <View style={{ gap: 4 }}>
              <Text style={ui.label}>Regroup points</Text>
              {drive.regroupPoints.map((p) => (
                <Text key={p.id} style={ui.muted}>
                  🚩 {p.name}: {p.reachedBy.length}/{drive.members.length} cars here
                </Text>
              ))}
            </View>
          )}

          <ErrorText>{actionError ?? locationError}</ErrorText>

          <View style={s.actions}>
            {drive.status !== 'lobby' && (
              <Button title="Pit stop photo" icon="📸" variant="secondary" style={{ flex: 1 }} onPress={pitStop} />
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

function RoleChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.roleChip, on && s.roleChipOn]}>
      <Text style={[s.roleChipText, on && { color: colors.accentText }]}>{label}</Text>
    </Pressable>
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
  alert: { backgroundColor: colors.danger, borderRadius: radius.md, padding: 12 },
  alertText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  roleRow: { flexDirection: 'row', gap: 8, paddingLeft: 22, paddingBottom: 8 },
  roleChip: { backgroundColor: colors.cardRaised, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  roleChipOn: { backgroundColor: colors.premium },
  roleChipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
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
