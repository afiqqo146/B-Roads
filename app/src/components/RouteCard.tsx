import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ScenicRoute } from '../../../shared/types';
import { formatDistance, formatDuration, scenicLabel } from '../lib/format';
import { colors, radius } from '../lib/theme';

export function RouteCard({ route, selected, onPress, best }: { route: ScenicRoute; selected: boolean; onPress: () => void; best?: boolean }) {
  const bigRoads = Math.round(Math.max(route.highwayShare, route.tollShare) * 100);
  return (
    <Pressable onPress={onPress} style={[s.card, selected && s.selected]}>
      <View style={s.header}>
        <Text style={s.label}>{scenicLabel(route.scenicScore)}</Text>
        {best && <Text style={s.badge}>MOST FUN</Text>}
      </View>
      <Text style={s.score}>
        {route.scenicScore}
        <Text style={s.scoreOf}>/100</Text>
      </Text>
      <Text style={s.stat}>
        {formatDistance(route.distanceM)} · {formatDuration(route.durationS * 1000, true)}
      </Text>
      <Text style={s.small}>
        {route.twistiness}°/km of corners{bigRoads > 0 ? ` · ${bigRoads}% big roads` : ' · 100% back roads'}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    width: 190,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 14,
    gap: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: { borderColor: colors.accent },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: colors.accent, fontWeight: '800', fontSize: 14, textTransform: 'uppercase' },
  badge: { color: colors.accentText, backgroundColor: colors.accent, fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  score: { color: colors.text, fontSize: 30, fontWeight: '800' },
  scoreOf: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  stat: { color: colors.text, fontSize: 15, fontWeight: '600' },
  small: { color: colors.muted, fontSize: 12 },
});
