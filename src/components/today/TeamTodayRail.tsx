import React, { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { easeIfChanged } from '../../hooks/useCached';
import Text from '../ui/Text';

import Avatar, { type AvatarStatus } from '../ui/Avatar';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import type { TeamMemberToday, TeamToday } from '../../viewmodels/today';
import PressableScale from '../ui/PressableScale';

function statusFor(m: TeamMemberToday): AvatarStatus {
  // Danger (red) wins — it's the actionable "nudge them" signal and takes
  // priority even over an active streak (a streak still in jeopardy today).
  // Otherwise: on a streak = green, logged today (no streak) = blue, else gray.
  if (m.atRisk) return 'danger';
  if (m.streakDays > 0) return 'streak';
  if (m.status === 'logged') return 'logged';
  return 'notLogged';
}

function MemberCell({ member, onPress, onLongPress }: { member: TeamMemberToday; onPress: (uid: string) => void; onLongPress?: (uid: string) => void }) {
  const valueColor = member.atRisk ? colors.danger : member.streakDays > 0 ? colors.success : colors.textMuted;
  return (
    <PressableScale
      onPress={() => onPress(member.uid)}
      onLongPress={onLongPress ? () => onLongPress(member.uid) : undefined}
      delayLongPress={300}
      style={styles.cell}
      accessibilityRole="button"
      accessibilityHint={onLongPress ? 'Long-press to send a cheer' : undefined}
    >
      <Avatar name={member.name} photoURL={member.photoURL} size={52} status={statusFor(member)} />
      <Text numberOfLines={1} style={styles.name}>
        {member.name}
      </Text>
      {member.valueLine ? (
        <Text numberOfLines={1} style={[styles.value, { color: valueColor }]}>
          {member.valueLine}
        </Text>
      ) : (
        <View style={{ height: 16 }} />
      )}
    </PressableScale>
  );
}

export default function TeamTodayRail({ team, onMemberPress, onMemberLongPress }: { team: TeamToday; onMemberPress: (uid: string) => void; onMemberLongPress?: (uid: string) => void }) {
  // Ease status changes (someone's ring filling in) instead of snapping.
  const sig = team.members.map((m) => `${m.uid}:${m.status}:${m.streakDays}`).join('|');
  const prevSig = useRef(sig);
  easeIfChanged(prevSig, sig);
  return (
    <View style={{ marginTop: 20 }}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>TEAM TODAY</Text>
        <Text style={styles.count}>
          {team.loggedCount} of {team.total} in
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingVertical: 4 }}>
        {team.members.map((m) => (
          <MemberCell key={m.uid} member={m} onPress={onMemberPress} onLongPress={onMemberLongPress} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  eyebrow: { ...typography.eyebrow, color: colors.textMuted },
  count: { ...typography.chip, color: colors.success },
  cell: { width: 64, alignItems: 'center' },
  name: { fontSize: 11, fontWeight: '600', color: colors.textPrimary, marginTop: 6 },
  value: { ...typography.chip, fontSize: 13, lineHeight: 15, marginTop: 1 },
});
