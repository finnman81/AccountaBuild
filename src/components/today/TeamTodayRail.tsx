import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import Avatar, { type AvatarStatus } from '../ui/Avatar';
import { colors } from '../../theme/colors';
import type { TeamMemberToday, TeamToday } from '../../viewmodels/today';

function statusFor(m: TeamMemberToday): AvatarStatus {
  // Today's completion wins: once you've logged, the ring is green — even if
  // you're the streak leader. The gold streak-leader ring only shows while a
  // leader still hasn't logged today (the streak count in the value line keeps
  // showing who's leading regardless).
  if (m.status === 'logged') return 'logged';
  if (m.streakLeader) return 'streakLeader';
  return 'notLogged';
}

function MemberCell({ member, onPress }: { member: TeamMemberToday; onPress: (uid: string) => void }) {
  const valueColor = member.streakLeader ? colors.rankGold : member.atRisk ? colors.danger : colors.textMuted;
  return (
    <Pressable onPress={() => onPress(member.uid)} style={styles.cell} accessibilityRole="button">
      <Avatar name={member.name} photoURL={member.photoURL} size={52} status={statusFor(member)} atRisk={member.atRisk} />
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
