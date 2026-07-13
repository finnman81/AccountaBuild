import React, { useMemo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import ProgressBar from '../ui/ProgressBar';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { MmrProjection } from '../../services/mmrProjection';
import { bandForMMR } from '../../mmr/ranks';

type Props = {
  projection: MmrProjection | null;
  onViewDetails?: () => void;
};

export default function WeeklyTrajectoryCard({ projection, onViewDetails }: Props) {
  const { status, statusColor, statusText, weekCompletion, primaryLine, secondaryLine } = useMemo(() => {
    if (!projection) {
      return {
        status: 'unknown' as const,
        statusColor: colors.textMuted,
        statusText: 'No projection',
        weekCompletion: 0,
        primaryLine: '—',
        secondaryLine: '—',
      };
    }

    const deltaMMR = projection.deltaMMRProjected;
    const currentBand = bandForMMR(projection.mmrBefore);
    const projectedBand = bandForMMR(projection.mmrProjected);

    // Determine status
    let status: 'promotion' | 'holding' | 'risk' = 'holding';
    let statusColor: string = colors.warning;
    let statusText = 'Holding';

    if (projection.weekJustStarted) {
      status = 'holding';
      statusColor = colors.textSecondary;
      statusText = 'Week just started — first log sets your pace';
    } else if (projection.missedIfEndedNow) {
      status = 'risk';
      statusColor = colors.danger;
      statusText = 'Demotion risk';
    } else if (projectedBand.tier !== currentBand.tier || (projectedBand.division && currentBand.division && projectedBand.division > currentBand.division)) {
      status = 'promotion';
      statusColor = colors.success;
      statusText = 'Promotion likely';
    } else if (deltaMMR > 0) {
      status = 'holding';
      statusColor = colors.success;
      statusText = 'On track';
    }

    // Primary line
    const sign = deltaMMR >= 0 ? '+' : '';
    const projectedTier = projection.projectedTier;
    const projectedDiv = projection.projectedDivision;
    const roman = projectedDiv === 1 ? 'I' : projectedDiv === 2 ? 'II' : projectedDiv === 3 ? 'III' : projectedDiv === 4 ? 'IV' : '';
    const projectedRankLabel = projectedDiv ? `${projectedTier} ${roman}` : projectedTier;
    const primaryLine = projection.weekJustStarted
      ? `Holding ${projectedRankLabel}`
      : `${sign}${Math.round(deltaMMR)} FP • On track for ${projectedRankLabel}`;

    // Secondary line (color-coded)
    const secondaryLine = statusText;

    // Week completion (estimate based on A_total - simplified)
    const weekCompletion = Math.min(100, Math.max(0, Math.round(projection.A_total * 100)));

    return {
      status,
      statusColor,
      statusText,
      weekCompletion,
      primaryLine,
      secondaryLine,
    };
  }, [projection]);

  return (
    <Card>
      <Card.Content>
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="titleMedium" style={{ color: colors.textPrimary, fontWeight: '600' }}>
              This Week
            </Text>
            {onViewDetails && (
              <Button
                mode="text"
                compact
                onPress={onViewDetails}
                textColor={colors.textSecondary}
                style={{ marginTop: -spacing.xs, marginRight: -spacing.sm }}
              >
                View details
              </Button>
            )}
          </View>

          <View style={{ gap: spacing.xs }}>
            <Text variant="bodyMedium" style={{ color: colors.textPrimary }}>
              {primaryLine}
            </Text>
            <Text variant="bodySmall" style={{ color: statusColor }}>
              {secondaryLine}
            </Text>
          </View>

          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="labelSmall" style={{ color: colors.textSecondary }}>
                Week completion
              </Text>
              <Text variant="labelSmall" style={{ color: colors.textSecondary }}>
                {weekCompletion}%
              </Text>
            </View>
            <ProgressBar progress={weekCompletion / 100} height={6} />
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}
