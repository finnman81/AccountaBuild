import React, { useMemo } from 'react';
import { Image, View } from 'react-native';
import { Card, Chip, Text, useTheme } from 'react-native-paper';

import { formatDeltaLb, formatMinutesHM, formatWeightLb } from '../../utils/formatters';
import type { MemberSummary } from '../../viewmodels/memberSummary';
import RankBadge from '../mmr/RankBadge';
import Tag from '../ui/Tag';

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? 'U') + (parts[1]?.[0] ?? '');
  return letters.toUpperCase();
}

export default function MemberStatusCard({
  item,
  mode,
}: {
  item: MemberSummary;
  mode: 'calories' | 'workout' | 'weight';
}) {
  const theme = useTheme();
  const avatarSize = 44;

  const chips = useMemo(() => {
    const types = item.workoutTypesToday;
    const workoutTag = types[0] ?? null;
    const extra = Math.max(0, types.length - (workoutTag ? 1 : 0));
    return { workoutTag, extra };
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

  const statusPillLabel = item.loggedToday ? 'Logged' : 'No log';

  return (
    <Card>
      <Card.Content>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {item.photoURL ? (
            <Image
              source={{ uri: item.photoURL }}
              style={{
                width: avatarSize,
                height: avatarSize,
                borderRadius: 12,
                backgroundColor: theme.colors.surfaceVariant,
              }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: avatarSize,
                height: avatarSize,
                borderRadius: 12,
                backgroundColor: theme.colors.surfaceVariant,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text variant="titleMedium">{initialsFromName(item.name).slice(0, 2)}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="titleMedium">{item.name}</Text>
              {item.rankTier ? <RankBadge tier={item.rankTier} size={70} /> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <Tag
                label={statusPillLabel}
                variant={item.loggedToday ? 'subtle' : 'noLog'}
              />
              {chips.workoutTag ? (
                <Chip compact mode="outlined">
                  {chips.workoutTag}
                </Chip>
              ) : null}
            </View>
          </View>
        </View>

        <View style={{ height: 12 }} />
        <View style={{ height: 1, backgroundColor: theme.colors.outlineVariant, opacity: 0.8 }} />
        <View style={{ height: 12 }} />

        <View
          style={{
            borderRadius: 12,
            padding: 12,
            backgroundColor: theme.colors.surfaceVariant,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.04)',
          }}
        >
          <Text variant="labelSmall" style={{ opacity: 0.75 }}>
            {bigMetric.label}
          </Text>
          <Text variant="headlineMedium" style={{ marginTop: 2 }}>
            {bigMetric.value}
          </Text>

          <View style={{ height: 10 }} />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text variant="labelSmall" style={{ opacity: 0.75 }}>
                Calories logged
              </Text>
              <Text variant="bodyLarge">{item.caloriesLoggedToday}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="labelSmall" style={{ opacity: 0.75 }}>
                Minutes today
              </Text>
              <Text variant="bodyLarge">{item.workoutMinutesToday > 0 ? formatMinutesHM(item.workoutMinutesToday) : '—'}</Text>
            </View>
          </View>

          <View style={{ height: 10 }} />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text variant="labelSmall" style={{ opacity: 0.75 }}>
                Minutes this week
              </Text>
              <Text variant="bodyLarge">{item.workoutMinutesThisWeek > 0 ? formatMinutesHM(item.workoutMinutesThisWeek) : '—'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="labelSmall" style={{ opacity: 0.75 }}>
                Last weight
              </Text>
              <Text variant="bodyLarge">{item.lastWeight == null ? '—' : formatWeightLb(item.lastWeight)}</Text>
            </View>
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}

