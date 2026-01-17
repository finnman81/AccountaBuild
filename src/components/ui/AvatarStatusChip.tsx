import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import Avatar from './Avatar';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import type { MemberSummary } from '../../viewmodels/memberSummary';
import { formatMinutesHM, formatDeltaLb, formatWeightLb } from '../../utils/formatters';

type AvatarStatusChipProps = {
  member: MemberSummary;
  mode: 'calories' | 'workout' | 'weight';
  status: 'logged' | 'notLogged' | 'streakLeader';
  isAtRisk?: boolean;
  onPress: () => void;
};

export default function AvatarStatusChip({
  member,
  mode,
  status,
  isAtRisk = false,
  onPress,
}: AvatarStatusChipProps) {
  const ringColor =
    status === 'streakLeader'
      ? colors.ringStreakLeader
      : status === 'logged'
        ? colors.ringLogged
        : colors.ringNotLogged;

  const metric = getMetric(member, mode);
  const firstName = member.name.split(/\s+/)[0] || member.name;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.avatarContainer}>
        <View
          style={[
            styles.ring,
            {
              width: 50,
              height: 50,
              borderRadius: 25,
              borderWidth: 2.5,
              borderColor: ringColor,
            },
          ]}
        >
          <Avatar photoURL={member.photoURL} name={member.name} size={44} />
        </View>
        {isAtRisk && (
          <View style={styles.riskDot} />
        )}
      </View>
      <Text
        variant="labelSmall"
        style={[styles.name, { color: colors.textSecondary }]}
        numberOfLines={1}
      >
        {firstName}
      </Text>
      <Text
        style={[styles.metric, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        {metric}
      </Text>
    </TouchableOpacity>
  );
}

function getMetric(member: MemberSummary, mode: 'calories' | 'workout' | 'weight'): string {
  if (mode === 'calories') {
    if (member.caloriesRemaining != null) {
      // Show remaining if available
      return String(member.caloriesRemaining);
    }
    if (member.caloriesLoggedToday > 0) {
      return String(member.caloriesLoggedToday);
    }
    return '—';
  }

  if (mode === 'workout') {
    if (member.workoutMinutesToday > 0) {
      const mins = member.workoutMinutesToday;
      if (mins < 60) {
        return `${mins}m`;
      }
      return formatMinutesHM(mins);
    }
    if (member.workoutTypesToday.length > 0) {
      return member.workoutTypesToday[0].substring(0, 5);
    }
    return '—';
  }

  // weight mode
  if (member.lastWeight != null) {
    const weight = member.lastWeight;
    // Show weight with 1 decimal if needed, otherwise integer
    const rounded = Math.round(weight * 10) / 10;
    return String(rounded);
  }
  if (member.weightDelta != null) {
    const delta = member.weightDelta;
    const rounded = (delta >= 0 ? Math.round(delta * 10) : -Math.round(Math.abs(delta) * 10)) / 10;
    const sign = rounded > 0 ? '+' : '';
    return `${sign}${rounded}`;
  }
  return '—';
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: 60,
    marginRight: spacing.md,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.xs,
  },
  ring: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  riskDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.riskDot,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  name: {
    fontSize: 12,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  metric: {
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
    color: colors.textMuted, // Ensure muted color for numbers
  },
});
