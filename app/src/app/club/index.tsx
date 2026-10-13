import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { Club, ClubEvent, ClubMember, RsvpStatus, SavedRoute } from '../../../../shared/types';
import { Button, Card, ErrorText, Field, styles as ui } from '../../components/ui';
import { useAppState } from '../../context/AppState';
import { useClub } from '../../context/ClubState';
import { clubApi, type StoredClubSession } from '../../lib/clubApi';
import { formatDateTime, formatDistance, formatDuration } from '../../lib/format';
import { getAppUserId } from '../../lib/premium';
import { colors, radius } from '../../lib/theme';

const TABS = ['Events', 'Routes', 'History', 'Members'] as const;
type Tab = (typeof TABS)[number];

export default function ClubScreen() {
  const { club, session, loading, error, refresh } = useClub();
  const [tab, setTab] = useState<Tab>('Events');

  // Pick up RSVPs and new events from other members whenever the screen opens.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  if (!session) return <NoClub />;
  if (!club) {
    return (
      <View style={[ui.screen, { padding: 16, gap: 12 }]}>
        <Text style={ui.muted}>{loading ? 'Loading your club…' : "Couldn't load your club."}</Text>
        <ErrorText>{error}</ErrorText>
        {!loading && <Button title="Try again" onPress={refresh} />}
      </View>
    );
  }

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.muted} />}
    >
      <ClubHeader club={club} />
      <View style={s.segment}>
        {TABS.map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[s.segmentItem, tab === t && s.segmentActive]}>
            <Text style={[s.segmentText, tab === t && s.segmentTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <ErrorText>{error}</ErrorText>
      {tab === 'Events' && <EventsTab club={club} session={session} />}
      {tab === 'Routes' && <RoutesTab club={club} session={session} />}
      {tab === 'History' && <HistoryTab club={club} />}
      {tab === 'Members' && <MembersTab club={club} session={session} />}
    </ScrollView>
  );
}

/** Runs a club API call, applies the updated club and surfaces errors. */
function useClubAction() {
  const { update } = useClub();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, fn: () => Promise<Club>) => {
    setBusy(id);
    try {
      update(await fn());
    } catch (e) {
      Alert.alert('Something went wrong', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

function NoClub() {
  const { premium, driverName, setDriverName } = useAppState();
  const { enter } = useClub();
  const [clubName, setClubName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (kind: 'create' | 'join') => {
    setBusy(kind);
    setError(null);
    try {
      const res =
        kind === 'create'
          ? await clubApi.create(clubName, driverName, await getAppUserId())
          : await clubApi.join(code.trim(), driverName);
      enter({ clubId: res.club.id, memberId: res.memberId, token: res.token }, res.club);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={ui.muted}>
        Clubs keep your events, routes and drive history in one place. Joining a club is free. Creating and running one needs
        Premium.
      </Text>
      <Field label="Your name" value={driverName} onChangeText={setDriverName} placeholder="Shown to your club" autoCapitalize="words" />

      <Card>
        <Text style={ui.h2}>Join a club</Text>
        <Field
          label="Invite code"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="ABC234"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
        />
        <Button title="Join club" onPress={() => go('join')} loading={busy === 'join'} disabled={code.trim().length !== 6 || !driverName.trim()} />
      </Card>

      <Card>
        <Text style={ui.h2}>
          Start a club <Text style={{ color: colors.premium, fontSize: 14 }}>★ PREMIUM</Text>
        </Text>
        {premium ? (
          <>
            <Field label="Club name" value={clubName} onChangeText={setClubName} placeholder="e.g. Klang Valley Drivers" />
            <Button title="Create club" onPress={() => go('create')} loading={busy === 'create'} disabled={!clubName.trim() || !driverName.trim()} />
          </>
        ) : (
          <>
            <Text style={ui.muted}>Run club events with sign-ups, use convoy tools, build a route library and keep a drive history.</Text>
            <Button title="Get Premium" variant="premium" onPress={() => router.push('/premium')} />
          </>
        )}
      </Card>
      <ErrorText>{error}</ErrorText>
    </ScrollView>
  );
}

function ClubHeader({ club }: { club: Club }) {
  const invite = () =>
    Share.share({
      message: `Join ${club.name} on B-Roads! Open the Club screen and enter invite code ${club.inviteCode}.`,
    });
  return (
    <Card>
      <Text style={ui.h1}>{club.name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={ui.label}>Invite code</Text>
          <Text style={s.code}>{club.inviteCode}</Text>
        </View>
        <Button title="Invite" variant="secondary" onPress={invite} />
      </View>
    </Card>
  );
}

// ---- Events -----------------------------------------------------------------

function EventsTab({ club, session }: { club: Club; session: StoredClubSession }) {
  const { isOrganiser } = useClub();
  // Keep events on screen until the day after they happen.
  const [cutoff] = useState(() => Date.now() - 12 * 60 * 60 * 1000);
  const upcoming = club.events.filter((e) => e.meetAt >= cutoff);
  return (
    <View style={{ gap: 12 }}>
      {isOrganiser && <Button title="New event" icon="📅" onPress={() => router.push('/club/new-event')} />}
      {upcoming.length === 0 && <Text style={ui.muted}>No upcoming drives yet.</Text>}
      {upcoming.map((e) => (
        <EventCard key={e.id} club={club} event={e} session={session} />
      ))}
    </View>
  );
}

const RSVP_LABELS: [RsvpStatus, string][] = [
  ['going', 'Going'],
  ['maybe', 'Maybe'],
  ['no', "Can't"],
];

function EventCard({ club, event, session }: { club: Club; event: ClubEvent; session: StoredClubSession }) {
  const { isOrganiser } = useClub();
  const { setStart, setDestination, setRoutes, setSelectedRouteId } = useAppState();
  const { busy, run } = useClubAction();
  const route = club.routes.find((r) => r.id === event.routeId);
  const mine = event.rsvps.find((r) => r.memberId === session.memberId)?.status;
  const going = event.rsvps.filter((r) => r.status === 'going');
  const maybe = event.rsvps.filter((r) => r.status === 'maybe');

  const startDrive = () => {
    if (!route) return;
    setStart(route.start);
    setDestination(route.destination);
    setRoutes([route.route]);
    setSelectedRouteId(route.route.id);
    router.push({ pathname: '/new-drive', params: { eventId: event.id, name: event.title } });
  };

  const remove = () =>
    Alert.alert('Delete this event?', event.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run('delete', () => clubApi.deleteEvent(session, event.id)) },
    ]);

  return (
    <Card>
      <Text style={s.eventDate}>{formatDateTime(event.meetAt)}</Text>
      <Text style={ui.h2}>{event.title}</Text>
      <Text style={ui.muted}>📍 Meet at {event.meetingPoint.name}</Text>
      {route && (
        <Text style={ui.muted}>
          🗺️ {route.name} · {formatDistance(route.route.distanceM)}
        </Text>
      )}
      {event.description ? <Text style={ui.body}>{event.description}</Text> : null}
      <Text style={ui.muted}>
        {going.length} going{maybe.length ? ` · ${maybe.length} maybe` : ''}
        {going.length ? `: ${going.map((r) => r.name).join(', ')}` : ''}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {RSVP_LABELS.map(([status, label]) => (
          <Pressable
            key={status}
            disabled={busy !== null}
            onPress={() => run(status, () => clubApi.rsvp(session, event.id, status))}
            style={[s.rsvp, mine === status && s.rsvpOn]}
          >
            <Text style={[s.rsvpText, mine === status && s.rsvpTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {event.driveCode && (
        <Button title="Join the live drive" onPress={() => router.push({ pathname: '/join', params: { code: event.driveCode } })} />
      )}
      {isOrganiser && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {route && !event.driveCode && <Button title="Start drive" style={{ flex: 1 }} onPress={startDrive} />}
          <Button title="Delete" variant="secondary" style={{ flex: route && !event.driveCode ? 0 : 1 }} loading={busy === 'delete'} onPress={remove} />
        </View>
      )}
    </Card>
  );
}

// ---- Routes -----------------------------------------------------------------

function RoutesTab({ club, session }: { club: Club; session: StoredClubSession }) {
  const { isOrganiser } = useClub();
  return (
    <View style={{ gap: 12 }}>
      <Text style={ui.muted}>
        {isOrganiser
          ? 'To add a route, plan it on the map and tap "Save to club".'
          : 'Routes your organisers have saved for the club.'}
      </Text>
      {club.routes.length === 0 && <Text style={ui.muted}>No saved routes yet.</Text>}
      {club.routes.map((r) => (
        <RouteItem key={r.id} route={r} session={session} />
      ))}
    </View>
  );
}

function RouteItem({ route, session }: { route: SavedRoute; session: StoredClubSession }) {
  const { isOrganiser } = useClub();
  const { setStart, setDestination, setRoutes, setSelectedRouteId } = useAppState();
  const { busy, run } = useClubAction();

  const driveIt = () => {
    setStart(route.start);
    setDestination(route.destination);
    setRoutes([route.route]);
    setSelectedRouteId(route.route.id);
    router.dismissTo('/');
  };

  const remove = () =>
    Alert.alert('Delete this route?', route.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run('delete', () => clubApi.deleteRoute(session, route.id)) },
    ]);

  return (
    <Card>
      <Text style={ui.h2}>{route.name}</Text>
      <Text style={ui.muted}>
        {route.start.name} → {route.destination.name} · {formatDistance(route.route.distanceM)} · about{' '}
        {formatDuration(route.route.durationS * 1000, true)}
      </Text>
      {route.notes ? <Text style={ui.body}>{route.notes}</Text> : null}
      <Text style={[ui.muted, { fontSize: 12 }]}>Saved by {route.savedBy}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Drive it" style={{ flex: 1 }} onPress={driveIt} />
        {isOrganiser && <Button title="Delete" variant="secondary" loading={busy === 'delete'} onPress={remove} />}
      </View>
    </Card>
  );
}

// ---- History ----------------------------------------------------------------

function HistoryTab({ club }: { club: Club }) {
  if (club.history.length === 0) {
    return <Text style={ui.muted}>Finished club drives will show up here.</Text>;
  }
  return (
    <View style={{ gap: 12 }}>
      {club.history.map((h) => (
        <Card key={h.driveCode}>
          <Text style={s.eventDate}>{formatDateTime(h.startedAt)}</Text>
          <Text style={ui.h2}>{h.name}</Text>
          <Text style={ui.muted}>
            {h.start.name} → {h.destination.name} · {formatDistance(h.distanceM)}
          </Text>
          <Text style={ui.body}>Group time: {formatDuration(h.groupElapsedMs)}</Text>
          {h.participants.map((p) => (
            <View key={p.name} style={s.historyRow}>
              <Text style={[ui.body, { flex: 1 }]}>{p.name}</Text>
              <Text style={ui.muted}>{p.elapsedMs != null ? formatDuration(p.elapsedMs) : 'Did not finish'}</Text>
            </View>
          ))}
        </Card>
      ))}
    </View>
  );
}

// ---- Members ----------------------------------------------------------------

const ROLE_LABEL = { owner: 'Owner', organiser: 'Organiser', member: 'Member' } as const;

function MembersTab({ club, session }: { club: Club; session: StoredClubSession }) {
  const { me, forget } = useClub();
  const { busy, run } = useClubAction();
  const [leaving, setLeaving] = useState(false);

  const changeRole = (m: ClubMember) => {
    const next = m.role === 'organiser' ? 'member' : 'organiser';
    Alert.alert(
      next === 'organiser' ? `Make ${m.name} an organiser?` : `Remove ${m.name} as organiser?`,
      'Organisers can create events, start club drives and manage the route library.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => run(m.id, () => clubApi.setRole(session, m.id, next)) },
      ],
    );
  };

  const leave = () =>
    Alert.alert(`Leave ${club.name}?`, 'You can rejoin later with the invite code.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setLeaving(true);
          try {
            await clubApi.leave(session);
            forget();
          } catch (e) {
            Alert.alert('Something went wrong', e instanceof Error ? e.message : String(e));
          } finally {
            setLeaving(false);
          }
        },
      },
    ]);

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 4 }}>
        {club.members.map((m) => {
          const canChange = me?.role === 'owner' && m.role !== 'owner';
          return (
            <Pressable key={m.id} disabled={!canChange || busy !== null} onPress={() => changeRole(m)} style={s.memberRow}>
              <Text style={[ui.body, { flex: 1 }]}>
                {m.name}
                {m.id === session.memberId ? ' (you)' : ''}
              </Text>
              <Text style={[s.role, m.role !== 'member' && { color: colors.accent }]}>{ROLE_LABEL[m.role]}</Text>
              {canChange && <Text style={ui.muted}>›</Text>}
            </Pressable>
          );
        })}
      </Card>
      {me?.role === 'owner' && <Text style={ui.muted}>Tap a member to make them an organiser.</Text>}
      {me?.role !== 'owner' && <Button title="Leave club" variant="secondary" loading={leaving} onPress={leave} />}
    </View>
  );
}

const s = StyleSheet.create({
  code: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: 5 },
  segment: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.sm, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm - 2 },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  segmentTextActive: { color: colors.accentText },
  eventDate: { color: colors.accent, fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  rsvp: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.sm, backgroundColor: colors.cardRaised },
  rsvpOn: { backgroundColor: colors.good },
  rsvpText: { color: colors.text, fontWeight: '700' },
  rsvpTextOn: { color: '#062510' },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  role: { color: colors.muted, fontWeight: '700', fontSize: 13 },
});
