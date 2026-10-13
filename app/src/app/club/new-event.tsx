import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Place } from '../../../../shared/types';
import { PlaceSearch } from '../../components/PlaceSearch';
import { Button, ErrorText, Field, styles as ui } from '../../components/ui';
import { useClub } from '../../context/ClubState';
import { clubApi } from '../../lib/clubApi';
import { formatDateTime, formatDistance } from '../../lib/format';
import { colors, radius } from '../../lib/theme';

/** Next Sunday at 7:30 am: a sensible default for a club drive. */
function defaultMeetTime() {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  d.setHours(7, 30, 0, 0);
  return d;
}

export default function NewEventScreen() {
  const { session, club, update } = useClub();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [meetAt, setMeetAt] = useState(defaultMeetTime);
  const [meetingPoint, setMeetingPoint] = useState<Place | null>(null);
  const [routeId, setRouteId] = useState<string | undefined>(club?.routes[0]?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session || !club) return null;

  // Android shows separate date and time dialogs; iOS has a combined inline picker.
  const pickAndroid = () =>
    DateTimePickerAndroid.open({
      value: meetAt,
      mode: 'date',
      minimumDate: new Date(),
      onValueChange: (_e, date) =>
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          onValueChange: (_e2, time) => setMeetAt(time),
        }),
    });

  const save = async () => {
    if (!meetingPoint) return;
    setBusy(true);
    setError(null);
    try {
      update(
        await clubApi.createEvent(session, {
          title,
          description: description.trim() || undefined,
          meetAt: meetAt.getTime(),
          meetingPoint,
          routeId,
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
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Sunday morning run" />

        <View style={{ gap: 6 }}>
          <Text style={ui.label}>Meeting time</Text>
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={meetAt}
              mode="datetime"
              display="compact"
              minimumDate={new Date()}
              themeVariant="dark"
              onValueChange={(_e, d) => setMeetAt(d)}
              style={{ alignSelf: 'flex-start' }}
            />
          ) : (
            <Pressable onPress={pickAndroid} style={s.picker}>
              <Text style={ui.body}>{formatDateTime(meetAt.getTime())}</Text>
            </Pressable>
          )}
        </View>

        <View style={{ gap: 6 }}>
          <Text style={ui.label}>Meeting point</Text>
          <PlaceSearch icon="📍" placeholder="Search for a place" value={meetingPoint} onChange={setMeetingPoint} />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={ui.label}>Route</Text>
          {club.routes.length === 0 ? (
            <Text style={ui.muted}>
              No routes in the club library yet. You can still create the event, but you need a saved route to start a club drive from it.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {club.routes.map((r) => (
                <Pressable key={r.id} onPress={() => setRouteId(r.id)} style={[s.option, routeId === r.id && s.optionOn]}>
                  <Text style={[ui.body, { fontWeight: '700' }]}>{r.name}</Text>
                  <Text style={ui.muted}>
                    {r.start.name} → {r.destination.name} · {formatDistance(r.route.distanceM)}
                  </Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setRouteId(undefined)} style={[s.option, !routeId && s.optionOn]}>
                <Text style={ui.body}>No route yet</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Field
          label="Details (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="Breakfast stop, fuel up before, bring a radio…"
          multiline
          style={{ minHeight: 80, textAlignVertical: 'top' }}
        />
        <ErrorText>{error}</ErrorText>
        <Button title="Create event" onPress={save} loading={busy} disabled={!title.trim() || !meetingPoint} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  picker: {
    backgroundColor: colors.cardRaised,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  option: { backgroundColor: colors.card, borderRadius: radius.sm, padding: 12, gap: 2, borderWidth: 2, borderColor: 'transparent' },
  optionOn: { borderColor: colors.accent },
});
