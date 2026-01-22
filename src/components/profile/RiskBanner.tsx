import React from 'react';
import { View } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { MmrState } from '../../services/mmrState';
import type { MmrWeeklySummary } from '../../services/mmrWeekly';
import type { MmrProjection } from '../../services/mmrProjection';
import { demotionRisk } from '../../mmr/risk';
import { getWeekProgress } from '../../utils/dates';

type Props = {
  mmrState: MmrState | null;
  latestWeekly: MmrWeeklySummary | null;
  projection?: MmrProjection | null;
};

export default function RiskBanner({ mmrState, latestWeekly, projection }: Props) {
  const risk = React.useMemo(() => {
    if (!mmrState) return null;
    
    // Calculate week progress (0-1, where 1 = end of week)
    const weekProgress = getWeekProgress();
    
    // Calculate week completion from projection (most accurate) or default to 0
    // projection.A_total is the average adherence across all enabled goals (0-1)
    const weekCompletion = projection?.A_total ?? 0;
    
    return demotionRisk({
      mmr: mmrState.mmr,
      consecutiveMissedWeeks: mmrState.consecutiveMissedWeeks,
      tierShieldWeeksRemaining: mmrState.tierShieldWeeksRemaining,
      missedLastWeek: Boolean(latestWeekly?.missedWeek),
      weekProgress,
      weekCompletion,
    });
  }, [latestWeekly?.missedWeek, mmrState, projection?.A_total]);

  if (!risk || risk.level === 'none') {
    // Show shield badge if safe
    if (mmrState?.tierShieldWeeksRemaining && mmrState.tierShieldWeeksRemaining > 0) {
      return (
        <Card>
          <Card.Content>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                padding: spacing.sm,
                borderRadius: radius.card,
                backgroundColor: colors.surface2,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.04)',
              }}
            >
              <Text style={{ color: colors.textMuted }}>🛡️</Text>
              <Text variant="bodySmall" style={{ color: colors.textMuted }}>
                Shield active
              </Text>
            </View>
          </Card.Content>
        </Card>
      );
    }
    return null;
  }

  // Show demotion risk warning
  return (
    <Card>
      <Card.Content>
        <View
          style={{
            padding: spacing.md,
            borderRadius: radius.card,
            backgroundColor: colors.danger + '15',
            borderWidth: 1,
            borderColor: colors.danger + '40',
          }}
        >
          <Text variant="titleSmall" style={{ color: colors.danger, fontWeight: '600', marginBottom: spacing.xs }}>
            Demotion risk
          </Text>
          <Text variant="bodySmall" style={{ color: colors.textPrimary }}>
            {risk.message}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
}
