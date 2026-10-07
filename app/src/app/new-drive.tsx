import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import type { Drive, JoinedDrive } from '../../../shared/types';
import { MY_LOCATION_NAME } from '../components/PlaceSearch';
import { Button, Card, ErrorText, Field, styles } from '../components/ui';
import { useAppState } from '../context/AppState';
import { formatDistance, formatDuration } from '../lib/format';
import { call, getSocket } from '../lib/socket';
import { keys, save } from '../lib/storage';

export default function NewDriveScreen() {
  const { solo } = useLocalSearchParams<{ solo?: string }>();
  const isSolo = solo === '1';
  const { driverName, setDriverName, start, destination, routes, selectedRouteId } = useAppState();
  const route = routes.find((r) => r.id === selectedRouteId);
  const [name, setName] = useState(destination ? `Run to ${destination.name}` : '');
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
        <Field label="Your name" value={driverName} onChangeText={setDriverName} placeholder="e.g. Aiman" autoCapitalize="words" />
        <Field label="Drive name" value={name} onChangeText={setName} placeholder="Sunday morning run" />
        <ErrorText>{error}</ErrorText>
        <Button title={isSolo ? 'Go!' : 'Create drive'} onPress={create} loading={busy} disabled={!driverName.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
