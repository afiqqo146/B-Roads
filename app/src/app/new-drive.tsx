import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from 'react-native';
import type { Drive, JoinedDrive } from '../../../shared/types';
import { MY_LOCATION_NAME } from '../components/PlaceSearch';
import { Button, Card, ErrorText, Field, styles } from '../components/ui';
import { useAppState } from '../context/AppState';
import { useClub } from '../context/ClubState';
import { formatDistance, formatDuration } from '../lib/format';
import { call, getSocket } from '../lib/socket';
import { keys, save } from '../lib/storage';
import { colors } from '../lib/theme';

export default function NewDriveScreen() {
  // eventId is set when an organiser starts a drive from a club event.
  const params = useLocalSearchParams<{ solo?: string; eventId?: string; name?: string }>();
  const isSolo = params.solo === '1';
  const { driverName, setDriverName, start, destination, routes, selectedRouteId } = useAppState();
  const { club, session, isOrganiser } = useClub();
  const route = routes.find((r) => r.id === selectedRouteId);
  const [name, setName] = useState(params.name ?? (destination ? `Run to ${destination.name}` : ''));
  const canClubDrive = !isSolo && !!club && !!session && isOrganiser;
  const [clubDrive, setClubDrive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!route || !start || !destination) {
    return (
      <Card style={{ margin: 16 }}>
        <Text style={styles.body}>Pick a route on the map first.</Text>
        <Button title="Back to map" onPress={() => router.back()} />
      </Card>
    );
  }

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const socket = getSocket();
      if (!socket.connected) socket.connect();
      const { drive, memberId } = await call<JoinedDrive>((ack) =>
        socket.emit(
          'drive:create',
          {
            name,
            memberName: driverName,
            // The server doesn't know where "My location" is; give it a real label.
            start: start.name === MY_LOCATION_NAME ? { ...start, name: 'Start' } : start,
            destination,
            route,
            club:
              canClubDrive && clubDrive && session
                ? { clubId: session.clubId, token: session.token, eventId: params.eventId }
                : undefined,
          },
          ack,
        ),
      );
      await save(keys.memberId(drive.code), memberId);
      if (isSolo) await call<Drive>((ack) => socket.emit('drive:start', ack));
      router.dismissTo({ pathname: '/drive/[code]', params: { code: drive.code } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.h2}>{isSolo ? 'Solo run' : 'Group drive'}</Text>
          <Text style={styles.muted}>
            {start.name} → {destination.name} · {formatDistance(route.distanceM)} · about{' '}
            {formatDuration(route.durationS * 1000, true)}
          </Text>
          <Text style={styles.muted}>
            {isSolo
              ? 'The clock starts as soon as you tap Go and stops when you reach the destination.'
              : "You'll get a code to share with your club. The clock starts for everyone when you start the drive, and each driver's time stops when they reach the destination."}
          </Text>
        </Card>
        {canClubDrive && (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.h2}>{club.name} drive</Text>
                <Text style={styles.muted}>
                  Convoy tools: lead car, back-marker, regroup points and falling-behind alerts. Saved to the club history.
                </Text>
              </View>
              <Switch value={clubDrive} onValueChange={setClubDrive} trackColor={{ true: colors.premium }} />
            </View>
          </Card>
        )}
        <Field label="Your name" value={driverName} onChangeText={setDriverName} placeholder="e.g. Aiman" autoCapitalize="words" />
        <Field label="Drive name" value={name} onChangeText={setName} placeholder="Sunday morning run" />
        <ErrorText>{error}</ErrorText>
        <Button title={isSolo ? 'Go!' : 'Create drive'} onPress={create} loading={busy} disabled={!driverName.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
