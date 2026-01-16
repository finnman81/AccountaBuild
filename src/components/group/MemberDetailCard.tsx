import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import Avatar from '../ui/Avatar';
import RankBadge from '../mmr/RankBadge';
import Tag from '../ui/Tag';
import { formatDeltaLb, formatMinutesHM, formatWeightLb } from '../../utils/formatters';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import type { MemberSummary } from '../../viewmodels/memberSummary';

type MemberDetailCardProps = {
  item: MemberSummary;
  mode: 'calories' | 'workout' | 'weight';
};

export default function MemberDetailCard({ item, mode }: MemberDetailCardProps) {
  const theme = useTheme();

  const chips = useMemo(() => {
    const types = item.workoutTypesToday;
    const workoutTag = types[0] ?? null;
    return { workoutTag };
  }, [item.workoutTypesToday]);

  const bigMetric = useMemo(() => {
    if (mode === 'workout') {
      return {
        label: 'Minutes this week',
        value: item.workoutMinutesThisWeek > 0 ? formatMinutesHM(item.workoutMinutesThisWeek) : '—',
      };
    }
    if (mode === 'weight') {
      return {
        label: 'Compared to last weigh-in',
        value: formatDeltaLb(item.weightDelta),
      };
    }
    // calories
    return {
      label: 'Calories remaining',
      value: item.caloriesRemaining == null ? '—' : String(item.caloriesRemaining),
    };
  }, [item.caloriesRemaining, item.weightDelta, item.workoutMinutesThisWeek, mode]);

  const statusPill = useMemo(() => {
    const bg = item.loggedToday ? colors.surface2 : colors.surface;
    const fg = item.loggedToday ? colors.textPrimary : colors.textSecondary;
    return { bg, fg, label: item.loggedToday ? 'Logged' : 'No log' };
  }, [item.loggedToday]);

  return (
    <Card>
      <Card.Content>
        <View style={styles.header}>
          <Avatar photoURL={item.photoURL} name={item.name} size={44} />
          <View style={styles.headerText}>
            <View style={styles.nameRow}>
              <Text variant="titleMedium" style={{ color: colors.textPrimary }}>
                {item.name}
              </Text>
              {item.rankTier ? (
                <RankBadge tier={item.rankTier} size={32} />
              ) : null}
            </View>
            <View style={styles.tagRow}>
              <Tag
                label={statusPill.label}
                variant={item.loggedToday ? 'subtle' : 'noLog'}
              />
              {chips.workoutTag ? (
                <Tag label={chips.workoutTag} variant="subtle" />
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.metricCard}>
          <Text variant="labelSmall" style={{ color: colors.textSecondary, opacity: 0.75 }}>
            {bigMetric.label}
          </Text>
          <Text variant="headlineMedium" style={{ marginTop: 2, color: colors.textPrimary }}>
            {bigMetric.value}
          </Text>

          <View style={styles.spacer} />

          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text variant="labelSmall" style={{ color: colors.textSecondary, opacity: 0.75 }}>
                Calories logged
              </Text>
              <Text variant="bodyLarge" style={{ color: colors.textPrimary }}>
                {item.caloriesLoggedToday}
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text variant="labelSmall" style={{ color: colors.textSecondary, opacity: 0.75 }}>
                Minutes today
              </Text>
              <Text variant="bodyLarge" style={{ color: colors.textPrimary }}>
                {item.workoutMinutesToday > 0 ? formatMinutesHM(item.workoutMinutesToday) : '—'}
              </Text>
            </View>
          </View>

          <View style={styles.spacer} />

          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text variant="labelSmall" style={{ color: colors.textSecondary, opacity: 0.75 }}>
                Minutes this week
              </Text>
              <Text variant="bodyLarge" style={{ color: colors.textPrimary }}>
                {item.workoutMinutesThisWeek > 0 ? formatMinutesHM(item.workoutMinutesThisWeek) : '—'}
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text variant="labelSmall" style={{ color: colors.textSecondary, opacity: 0.75 }}>
                Last weight
              </Text>
              <Text variant="bodyLarge" style={{ color: colors.textPrimary }}>
                {item.lastWeight == null ? '—' : formatWeightLb(item.lastWeight)}
              </Text>
            </View>
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
    opacity: 0.8,
  },
  metricCard: {
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  spacer: {
    height: spacing.sm,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metricItem: {
    flex: 1,
  },
});
