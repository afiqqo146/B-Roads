import { StyleSheet, Text, View } from 'react-native';
import type { Drive, DriveMember } from '../../../shared/types';
import { formatDistance, formatDuration } from '../lib/format';
import { colors } from '../lib/theme';

export const memberColor = (drive: Drive, memberId: string) =>
  colors.members[Math.max(0, drive.members.findIndex((m) => m.id === memberId)) % colors.members.length];

export function MemberRow({ drive, member, isMe }: { drive: Drive; member: DriveMember; isMe: boolean }) {
  let status: string;
  if (member.arrivedAt && drive.startedAt) status = `🏁 ${formatDuration(member.arrivedAt - drive.startedAt)}`;
  else if (drive.status === 'lobby') status = member.connected ? 'Ready' : 'Offline';
  else if (member.distanceToGoalM != null) status = `${formatDistance(member.distanceToGoalM)} to go`;
  else status = 'Waiting for GPS';

  return (
    <View style={s.row}>
      <View style={[s.dot, { backgroundColor: memberColor(drive, member.id) }]} />
      <Text style={s.name} numberOfLines={1}>
        {member.name}
        {isMe ? ' (you)' : ''}
        {member.isHost ? ' · host' : ''}
      </Text>
      {!member.connected && drive.status !== 'lobby' && <Text style={s.offline}>offline</Text>}
      <Text style={[s.status, member.arrivedAt ? { color: colors.good } : null]}>{status}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  offline: { color: colors.muted, fontSize: 12 },
  status: { color: colors.muted, fontSize: 14, fontVariant: ['tabular-nums'] },
});
