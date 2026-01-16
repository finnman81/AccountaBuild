import React, { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Card, Text, IconButton, Button } from 'react-native-paper';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';

type Props = {
  label: string;
  met: number;
  total: number;
  dayDots?: boolean[]; // Array of 7 booleans for each day
  dayLabels?: string[]; // Array of 7 day labels (S, M, T, etc.)
  onDayToggle?: (index: number, newValue: boolean) => void; // Callback when a day is toggled
};

export default function GoalSummaryRow({ label, met, total, dayDots, dayLabels, onDayToggle }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <Card.Content>
        <TouchableOpacity
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.7}
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium" style={{ color: colors.textPrimary }}>
              {label}: {met} / {total} days met
            </Text>
          </View>
          <IconButton
            icon={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            iconColor={colors.textSecondary}
            style={{ margin: 0 }}
          />
        </TouchableOpacity>

        {expanded && dayDots && (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'space-between' }}>
              {dayDots.map((met, idx) => (
                <View key={idx} style={{ alignItems: 'center', width: 40 }}>
                  {onDayToggle ? (
                    <Button
                      mode={met ? 'contained' : 'outlined'}
                      compact
                      onPress={() => onDayToggle(idx, !met)}
                      style={{ minWidth: 36, height: 34, justifyContent: 'center' }}
                      contentStyle={{ height: 34 }}
                    >
                      {met ? '✓' : ''}
                    </Button>
                  ) : (
                    <View
                      style={{
                        minWidth: 36,
                        height: 34,
                        borderRadius: radius.sm,
                        backgroundColor: met ? colors.primary : colors.surface2,
                        borderWidth: met ? 0 : 1,
                        borderColor: colors.divider,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      {met ? <Text style={{ color: colors.onPrimary }}>✓</Text> : null}
                    </View>
                  )}
                  {dayLabels && dayLabels[idx] && (
                    <>
                      <View style={{ height: 6 }} />
                      <Text variant="labelSmall" style={{ color: colors.textMuted }}>
                        {dayLabels[idx]}
                      </Text>
                    </>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}
      </Card.Content>
    </Card>
  );
}
