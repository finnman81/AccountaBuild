import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import Avatar, { type AvatarStatus } from '../ui/Avatar';
import { colors } from '../../theme/colors';
import type { TeamMemberToday, TeamToday } from '../../viewmodels/today';

function statusFor(m: TeamMemberToday): AvatarStatus {
  // Danger (red) wins — it's the actionable "nudge them" signal and takes
  // priority even over an active streak (a streak still in jeopardy today).
  // Otherwise: on a streak = green, logged today (no streak) = blue, else gray.
  if (m.atRisk) return 'danger';
  if (m.streakDays > 0) return 'streak';
  if (m.status === 'logged') return 'logged';
  return 'notLogged';
}

function MemberCell({ member, onPress }: { member: TeamMemberToday; onPress: (uid: string) => void }) {
  const valueColor = member.atRisk ? colors.danger : member.streakDays > 0 ? colors.success : colors.textMuted;
  return (
    <Pressable onPress={() => onPress(member.uid)} style={styles.cell} accessibilityRole="button">
      <Avatar name={member.name} photoURL={member.photoURL} size={52} status={statusFor(member)} />
      <Text numberOfLines={1} style={styles.name}>
        {member.name}
      </Text>
      {member.valueLine ? (
        <Text numberOfLines={1} style={[styles.value, { color: valueColor }]}>
          {member.valueLine}
        </Text>
      ) : (
        <View style={{ height: 12 }} />
      )}
    </Pressable>
  );
}

export default function TeamTodayRail({ team, onMemberPress }: { team: TeamToday; onMemberPress: (uid: string) => void }) {
  return (
    <View style={{ marginTop: 20 }}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>TEAM TODAY</Text>
        <Text style={styles.count}>
          {team.loggedCount}/{team.total} logged
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingVertical: 4 }}>
        {team.members.map((m) => (
          <MemberCell key={m.uid} member={m} onPress={onMemberPress} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted },
  count: { fontSize: 12, fontWeight: '600', color: colors.success },
  cell: { width: 64, alignItems: 'center' },
  name: { fontSize: 11, fontWeight: '600', color: colors.textPrimary, marginTop: 6 },
  value: { fontSize: 10, marginTop: 1 },
});
