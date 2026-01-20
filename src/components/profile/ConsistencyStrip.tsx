import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';

type Props = {
  title: string;
  activeDays: number;
  totalDays: number;
  streakDots: number[]; // Array of 0 or 1 for each day
  countLabel?: string;
  footerText?: string;
  onPress?: () => void;
};

export default function ConsistencyStrip({
  title,
  activeDays,
  totalDays,
  streakDots,
  countLabel = 'active days',
  footerText,
  onPress,
}: Props) {
  return (
    <Card>
      <Card.Content>
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={onPress ? 0.7 : 1}
          disabled={!onPress}
          style={{ gap: spacing.md }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="titleMedium" style={{ color: colors.textPrimary, fontWeight: '600' }}>
              {title}
            </Text>
            <Text variant="bodyMedium" style={{ color: colors.textSecondary }}>
              {activeDays} / {totalDays} {countLabel}
            </Text>
          </View>

          {/* Streak dots with day labels - Monday first */}
          <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start', justifyContent: 'space-between' }}>
            {streakDots.map((filled, idx) => {
              const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
              return (
                <View key={idx} style={{ alignItems: 'center', flex: 1 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: filled ? colors.primary : colors.divider,
                      marginBottom: spacing.xs,
                    }}
                  />
                  <Text variant="labelSmall" style={{ color: colors.textMuted, fontSize: 10 }}>
                    {dayLabels[idx]}
                  </Text>
                </View>
              );
            })}
          </View>

          {footerText ? (
            <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
              {footerText}
            </Text>
          ) : null}
        </TouchableOpacity>
      </Card.Content>
    </Card>
  );
}
