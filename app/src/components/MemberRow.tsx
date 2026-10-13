import { StyleSheet, Text, View } from 'react-native';
import type { Drive, DriveMember } from '../../../shared/types';
import { formatDistance, formatDuration } from '../lib/format';
import { colors } from '../lib/theme';

export const memberColor = (drive: Drive, memberId: string) =>
  colors.members[Math.max(0, drive.members.findIndex((m) => m.id === memberId)) % colors.members.length];

const ROLE_BADGE = { lead: 'LEAD', sweep: 'BACK' } as const;

export function MemberRow({ drive, member, isMe }: { drive: Drive; member: DriveMember; isMe: boolean }) {
  let status: string;
  let statusColor: string = colors.muted;
  if (member.arrivedAt && drive.startedAt) {
    status = `🏁 ${formatDuration(member.arrivedAt - drive.startedAt)}`;
    statusColor = colors.good;
  } else if (drive.status === 'lobby') {
    status = member.connected ? 'Ready' : 'Offline';
  } else if (member.fallingBehind && member.behindM != null) {
    status = `Falling behind · ${formatDistance(member.behindM)}`;
    statusColor = colors.danger;
  } else if (member.distanceToGoalM != null) {
    status = `${formatDistance(member.distanceToGoalM)} to go`;
  } else {
    status = 'Waiting for GPS';
  }

  return (
    <View style={s.row}>
      <View style={[s.dot, { backgroundColor: memberColor(drive, member.id) }]} />
      <Text style={s.name} numberOfLines={1}>
        {member.name}
        {isMe ? ' (you)' : ''}
        {member.isHost ? ' · host' : ''}
      </Text>
      {member.convoyRole && <Text style={s.badge}>{ROLE_BADGE[member.convoyRole]}</Text>}
      {!member.connected && drive.status !== 'lobby' && <Text style={s.offline}>offline</Text>}
      <Text style={[s.status, { color: statusColor }]}>{status}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  badge: {
    color: colors.accentText,
    backgroundColor: colors.premium,
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  offline: { color: colors.muted, fontSize: 12 },
  status: { fontSize: 14, fontVariant: ['tabular-nums'] },
});
