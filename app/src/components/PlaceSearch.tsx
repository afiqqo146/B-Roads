import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LatLng, Place } from '../../../shared/types';
import { searchPlaces } from '../lib/api';
import { colors, radius } from '../lib/theme';

interface Props {
  icon: string;
  placeholder: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  near?: LatLng;
  /** Offers "My location" as the first suggestion. */
  currentLocation?: LatLng;
}

export const MY_LOCATION_NAME = 'My location';

export function PlaceSearch({ icon, placeholder, value, onChange, near, currentLocation }: Props) {
  // What the user is typing; null shows the selected place's name instead.
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = draft ?? value?.name ?? '';
  const query = draft?.trim() ?? '';
  const searching = focused && query.length >= 2;

  useEffect(() => {
    if (!searching) return;
    let stale = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const found = await searchPlaces(query, near);
        if (!stale) {
          setResults(found);
          setError(null);
        }
      } catch (e) {
        if (!stale) setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [searching, query, near]);

  const pick = (p: Place) => {
    onChange(p);
    setDraft(null);
    setResults([]);
    setFocused(false);
  };

  const suggestions: Place[] = [
    ...(currentLocation && focused && value?.name !== MY_LOCATION_NAME
      ? [{ name: MY_LOCATION_NAME, detail: 'Use GPS position', location: currentLocation }]
      : []),
    ...(searching ? results : []),
  ];

  return (
    <View>
      <View style={s.row}>
        <Text style={s.icon}>{icon}</Text>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setDraft(t);
            if (value) onChange(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={s.input}
          returnKeyType="search"
          autoCorrect={false}
        />
        {searching && loading && <ActivityIndicator color={colors.muted} />}
      </View>
      {error && searching ? <Text style={s.error}>{error}</Text> : null}
      {suggestions.length > 0 && (
        <View style={s.results}>
          {suggestions.map((p, i) => (
            <Pressable key={`${p.name}-${i}`} onPress={() => pick(p)} style={s.result}>
              <Text style={s.resultName} numberOfLines={1}>
                {p.name}
              </Text>
              {p.detail ? (
                <Text style={s.resultDetail} numberOfLines={1}>
                  {p.detail}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.cardRaised,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
  },
  icon: { fontSize: 16 },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 12 },
  results: { backgroundColor: colors.cardRaised, borderRadius: radius.sm, marginTop: 4, overflow: 'hidden' },
  result: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  resultName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  resultDetail: { color: colors.muted, fontSize: 13, marginTop: 2 },
  error: { color: colors.danger, fontSize: 13, marginTop: 4 },
});
