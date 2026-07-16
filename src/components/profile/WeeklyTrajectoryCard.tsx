import React, { useMemo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import ProgressBar from '../ui/ProgressBar';
import AnimatedNumber from '../ui/AnimatedNumber';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { MmrProjection } from '../../services/mmrProjection';
import { bandForMMR } from '../../mmr/ranks';

type Props = {
  projection: MmrProjection | null;
  /** Current daily streak (days) — powers the bad-week salvage line. */
  dailyStreak?: number;
  onViewDetails?: () => void;
};

export default function WeeklyTrajectoryCard({ projection, dailyStreak = 0, onViewDetails }: Props) {
  const { status, statusColor, statusText, weekCompletion, primaryParts, secondaryLine, hintLine } = useMemo(() => {
    if (!projection) {
      return {
        status: 'unknown' as const,
        statusColor: colors.textMuted,
        statusText: 'No projection',
        weekCompletion: 0,
        primaryParts: { sign: null as string | null, delta: null as number | null, suffix: '—' },
        secondaryLine: '—',
        hintLine: null as string | null,
      };
    }

    const deltaMMR = projection.deltaMMRProjected;
    const sign = deltaMMR >= 0 ? '+' : '−';
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
    const projectedTier = projection.projectedTier;
    const projectedDiv = projection.projectedDivision;
    const roman = projectedDiv === 1 ? 'I' : projectedDiv === 2 ? 'II' : projectedDiv === 3 ? 'III' : projectedDiv === 4 ? 'IV' : '';
    const projectedRankLabel = projectedDiv ? `${projectedTier} ${roman}` : projectedTier;
    const primaryParts = projection.weekJustStarted
      ? { sign: null as string | null, delta: null as number | null, suffix: `Holding ${projectedRankLabel}` }
      : { sign, delta: Math.abs(Math.round(deltaMMR)), suffix: ` FP • On track for ${projectedRankLabel}` };

    // Secondary line (color-coded)
    const secondaryLine = statusText;

    // Week completion (estimate based on A_total - simplified)
    const weekCompletion = Math.min(100, Math.max(0, Math.round(projection.A_total * 100)));

    // Bad-Monday salvage: the math already forgives a slow start (adherence is
    // weekly totals) — say so. Behind but completable -> show the exact path.
    // Out of reach -> point at the daily streak, the game that's still alive.
    let hintLine: string | null = null;
    if (!projection.weekJustStarted && !projection.completedIfEndedNow) {
      const needW = projection.workoutsTarget > 0 ? Math.max(0, projection.workoutsTarget - projection.workoutsDone) : 0;
      const needC = projection.calorieDaysTarget > 0 ? Math.max(0, projection.calorieDaysTarget - projection.calorieDaysDone) : 0;
      const winnable = needW <= projection.daysLeft && needC <= projection.daysLeft;
      if (winnable && (needW > 0 || needC > 0)) {
        const parts = [
          needW > 0 ? `${needW} workout${needW === 1 ? '' : 's'}` : null,
          needC > 0 ? `${needC} calorie day${needC === 1 ? '' : 's'}` : null,
        ].filter(Boolean);
        hintLine = `Complete week still in reach: ${parts.join(' + ')} in ${projection.daysLeft} day${projection.daysLeft === 1 ? '' : 's'}.`;
      } else if (!winnable) {
        hintLine =
          dailyStreak > 0
            ? `This week's out of reach — your ${dailyStreak}-day streak isn't. Keep logging.`
            : 'This week got away — keep logging daily and Monday is a fresh start.';
      }
    }

    return {
      status,
      statusColor,
      statusText,
      weekCompletion,
      primaryParts,
      secondaryLine,
      hintLine,
    };
  }, [projection, dailyStreak]);

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
                textColor={colors.primary}
                style={{ marginTop: -spacing.xs, marginRight: -spacing.sm }}
              >
                See the math
              </Button>
            )}
          </View>

          <View style={{ gap: spacing.xs }}>
            <Text variant="bodyMedium" style={{ color: colors.textPrimary }}>
              {primaryParts.delta != null ? (
                <>
                  {primaryParts.sign}
                  <AnimatedNumber value={primaryParts.delta} />
                </>
              ) : null}
              {primaryParts.suffix}
            </Text>
            <Text variant="bodySmall" style={{ color: statusColor }}>
              {secondaryLine}
            </Text>
            {hintLine ? (
              <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                {hintLine}
              </Text>
            ) : null}
            {projection && projection.whatIf.workout > 0 ? (
              <Text variant="bodySmall" style={{ color: colors.rankGold }}>
                🏋️ Your next workout is worth ≈ +{projection.whatIf.workout} FP
              </Text>
            ) : null}
          </View>

          <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="labelSmall" style={{ color: colors.textSecondary }}>
                On pace
              </Text>
              <Text variant="labelSmall" style={{ color: colors.textSecondary }}>
                <AnimatedNumber value={weekCompletion} />%
              </Text>
            </View>
            <ProgressBar progress={weekCompletion / 100} height={6} />
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}
