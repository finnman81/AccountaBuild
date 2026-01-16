import React, { useMemo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Card, Text } from 'react-native-paper';
import SimpleLineChart from '../charts/SimpleLineChart';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { formatDeltaLb } from '../../utils/formatters';

type Props = {
  title: string;
  values: number[];
  delta: number | null;
  onPress?: () => void;
};

export default function TrendPreviewSparkline({ title, values, delta, onPress }: Props) {
  const chartValues = useMemo(() => {
    if (values.length === 0) return [];
    // Take last 7 values for sparkline
    return values.slice(-7);
  }, [values]);

  const deltaText = delta != null ? formatDeltaLb(delta) : '—';

  return (
    <Card>
      <Card.Content>
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="titleMedium" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                {title}
              </Text>
              <Text variant="bodyMedium" style={{ color: colors.textSecondary }}>
                {deltaText} this week
              </Text>
            </View>

            {chartValues.length > 0 ? (
              <View style={{ height: 60, marginHorizontal: -spacing.md }}>
                <SimpleLineChart
                  values={chartValues}
                  height={60}
                  color={colors.primary}
                  showPointLabels={false}
                  insets={{ top: 4, right: 4, bottom: 4, left: 4 }}
                  xDomainPadding={2}
                />
              </View>
            ) : (
              <View style={{ height: 60, justifyContent: 'center', alignItems: 'center' }}>
                <Text variant="bodySmall" style={{ color: colors.textMuted }}>
                  No data yet
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Card.Content>
    </Card>
  );
}
