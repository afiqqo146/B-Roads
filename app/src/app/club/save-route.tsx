import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { MY_LOCATION_NAME } from '../../components/PlaceSearch';
import { Button, Card, ErrorText, Field, styles as ui } from '../../components/ui';
import { useAppState } from '../../context/AppState';
import { useClub } from '../../context/ClubState';
import { clubApi } from '../../lib/clubApi';
import { formatDistance } from '../../lib/format';

/** Saves the route selected on the planner to the club's route library. */
export default function SaveRouteScreen() {
  const { session, club, update } = useClub();
  const { start, destination, routes, selectedRouteId } = useAppState();
  const route = routes.find((r) => r.id === selectedRouteId);
  const [name, setName] = useState(destination ? `${destination.name} run` : '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session || !club || !route || !start || !destination) {
    return (
      <Card style={{ margin: 16 }}>
        <Text style={ui.body}>Pick a route on the map first.</Text>
        <Button title="Back" onPress={() => router.back()} />
      </Card>
    );
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      update(
        await clubApi.saveRoute(session, {
          name,
          notes: notes.trim() || undefined,
          // "My location" means nothing to other members; give it a neutral name.
          start: start.name === MY_LOCATION_NAME ? { ...start, name: 'Start' } : start,
          destination,
          route,
        }),
      );
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={ui.muted}>
          Saving to {club.name}: {destination.name} · {formatDistance(route.distanceM)}
        </Text>
        <Field label="Route name" value={name} onChangeText={setName} placeholder="Hill road loop" />
        <Field
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Best early morning, watch for gravel after the bridge…"
          multiline
          style={{ minHeight: 80, textAlignVertical: 'top' }}
        />
        <ErrorText>{error}</ErrorText>
        <Button title="Save route" onPress={save} loading={busy} disabled={!name.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
