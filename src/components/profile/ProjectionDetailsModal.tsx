import React, { useMemo } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Card, Text, Button, Modal, Portal, useTheme } from 'react-native-paper';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { MmrProjection } from '../../services/mmrProjection';
import { bandForMMR } from '../../mmr/ranks';

type Props = {
  visible: boolean;
  projection: MmrProjection | null;
  onDismiss: () => void;
};

export default function ProjectionDetailsModal({ visible, projection, onDismiss }: Props) {
  const theme = useTheme();

  const details = useMemo(() => {
    if (!projection) return null;

    const currentBand = bandForMMR(projection.mmrBefore);
    const projectedBand = bandForMMR(projection.mmrProjected);

    const projectedDiv = projection.projectedDivision;
    const roman = projectedDiv === 1 ? 'I' : projectedDiv === 2 ? 'II' : projectedDiv === 3 ? 'III' : projectedDiv === 4 ? 'IV' : '';
    const projectedRankLabel = projectedDiv ? `${projection.projectedTier} ${roman}` : projection.projectedTier;

    return {
      mmrBefore: projection.mmrBefore,
      mmrProjected: projection.mmrProjected,
      deltaMMR: projection.deltaMMRProjected,
      mpBefore: projection.mpBefore,
      mpProjected: projection.mpProjected,
      deltaMP: projection.deltaMPProjected,
      projectedRankLabel,
      weekScore: projection.weekScore,
      streakMultiplier: projection.streakMultiplier,
      penalty: projection.penalty,
      A_total: projection.A_total,
      completedIfEndedNow: projection.completedIfEndedNow,
      missedIfEndedNow: projection.missedIfEndedNow,
      workoutsDone: projection.workoutsDone,
      workoutsTarget: projection.workoutsTarget,
      calorieDaysDone: projection.calorieDaysDone,
      calorieDaysTarget: projection.calorieDaysTarget,
      breadth: projection.breadth,
      perGoal: projection.perGoal,
      whatIf: projection.whatIf,
    };
  }, [projection]);

  const whatIfRows = details
    ? [
        { icon: '🏋️', label: 'Log a workout now', fp: details.whatIf.workout },
        { icon: '🍽️', label: 'Hit calories today', fp: details.whatIf.calorieDay },
        { icon: '⚖️', label: 'Log a weigh-in', fp: details.whatIf.weighIn },
      ]
    : [];

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modalContent,
          {
            backgroundColor: theme.colors.surface,
            borderRadius: radius.card,
          },
        ]}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Card>
            <Card.Title title="Weekly Projection Details" />
            <Card.Content>
              {details ? (
                <View style={{ gap: spacing.md }}>
                  {/* The self-audit headline: what is each log WORTH right now. */}
                  <View style={{ gap: spacing.sm }}>
                    <Text variant="titleSmall" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                      What's your next log worth?
                    </Text>
                    <View style={{ gap: spacing.xs }}>
                      {whatIfRows.map((r) => (
                        <View
                          key={r.label}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: spacing.sm,
                            borderRadius: radius.card,
                            backgroundColor: colors.surface2,
                            borderWidth: 1,
                            borderColor: r.fp > 0 ? colors.rankGold + '40' : 'rgba(255,255,255,0.04)',
                          }}
                        >
                          <Text variant="bodyMedium" style={{ color: colors.textPrimary }}>
                            {r.icon} {r.label}
                          </Text>
                          <Text
                            variant="bodyMedium"
                            style={{ color: r.fp > 0 ? colors.rankGold : colors.textMuted, fontWeight: '700', fontVariant: ['tabular-nums'] }}
                          >
                            {r.fp > 0 ? `≈ +${r.fp} FP` : '+0 FP'}
                          </Text>
                        </View>
                      ))}
                      <Text variant="bodySmall" style={{ color: colors.textMuted }}>
                        Live estimates for today. +0 means that log can't raise this week's score further (target already
                        met, or no matching goal) — it still protects streaks and reminders.
                      </Text>
                    </View>
                  </View>

                  <View style={{ gap: spacing.sm }}>
                    <Text variant="titleSmall" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                      Projected Outcome
                    </Text>
                    <View
                      style={{
                        padding: spacing.sm,
                        borderRadius: radius.card,
                        backgroundColor: details.missedIfEndedNow
                          ? colors.danger + '15'
                          : details.completedIfEndedNow
                            ? colors.success + '15'
                            : colors.surface2,
                        borderWidth: 1,
                        borderColor: details.missedIfEndedNow
                          ? colors.danger + '40'
                          : details.completedIfEndedNow
                            ? colors.success + '40'
                            : 'rgba(255, 255, 255, 0.04)',
                      }}
                    >
                      <Text variant="bodyMedium" style={{ color: colors.textPrimary }}>
                        {details.missedIfEndedNow
                          ? 'Missed week (if ended now)'
                          : details.completedIfEndedNow
                            ? 'Completed week (if ended now)'
                            : 'Partial week (if ended now)'}
                      </Text>
                      <Text variant="bodySmall" style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
                        Week completion: {Math.round(details.A_total * 100)}%
                      </Text>
                    </View>
                  </View>

                  <View style={{ gap: spacing.sm }}>
                    <Text variant="titleSmall" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                      FP Projection
                    </Text>
                    <View style={{ gap: spacing.xs }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                          Current FP:
                        </Text>
                        <Text variant="bodySmall" style={{ color: colors.textPrimary }}>
                          {details.mmrBefore}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                          Projected FP:
                        </Text>
                        <Text variant="bodySmall" style={{ color: colors.textPrimary }}>
                          {details.mmrProjected} ({details.deltaMMR >= 0 ? '+' : ''}
                          {Math.round(details.deltaMMR)})
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                          Projected Rank:
                        </Text>
                        <Text variant="bodySmall" style={{ color: colors.textPrimary }}>
                          {details.projectedRankLabel}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ gap: spacing.sm }}>
                    <Text variant="titleSmall" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                      Calculation Breakdown
                    </Text>
                    <View style={{ gap: spacing.xs }}>
                      {details.perGoal.map((g) => (
                        <View key={g.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                            {g.label} ({g.detail}):
                          </Text>
                          <Text
                            variant="bodySmall"
                            style={{ color: g.paceA >= 0.7 ? colors.success : g.paceA >= 0.4 ? colors.textPrimary : colors.danger }}
                          >
                            {Math.round(g.paceA * 100)}% of pace
                          </Text>
                        </View>
                      ))}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                          Variety bonus ({details.perGoal.length} goal type{details.perGoal.length === 1 ? '' : 's'}):
                        </Text>
                        <Text variant="bodySmall" style={{ color: colors.textPrimary }}>
                          {details.breadth.toFixed(2)}x
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                          Streak Multiplier:
                        </Text>
                        <Text variant="bodySmall" style={{ color: colors.textPrimary }}>
                          {details.streakMultiplier.toFixed(2)}x
                        </Text>
                      </View>
                      {details.penalty > 0 && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                            Penalty:
                          </Text>
                          <Text variant="bodySmall" style={{ color: colors.danger }}>
                            -{Math.round(details.penalty)}
                          </Text>
                        </View>
                      )}
                      <View
                        style={{
                          marginTop: spacing.xs,
                          paddingTop: spacing.xs,
                          borderTopWidth: 1,
                          borderTopColor: colors.divider,
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text variant="bodyMedium" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                            Delta FP:
                          </Text>
                          <Text variant="bodyMedium" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                            {details.deltaMMR >= 0 ? '+' : ''}
                            {Math.round(details.deltaMMR)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={{ gap: spacing.sm }}>
                    <Text variant="titleSmall" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                      How Scoring Works
                    </Text>
                    <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                      Your weekly score is calculated from your active goals (workouts, minutes, weight, calories). The score is then multiplied by your streak bonus and reduced by any penalties for missed or partial weeks.
                    </Text>
                    <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                      A log is worth the most when it puts you back on pace toward YOUR targets — the same workout earns
                      more when you're behind than after your target is already met. Hitting a modest target beats
                      missing an ambitious one.
                    </Text>
                    <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                      Formula: ΔFP = Week Score × Variety × Streak × Week elapsed − Penalty
                    </Text>
                  </View>
                </View>
              ) : (
                <Text variant="bodyMedium" style={{ color: colors.textMuted }}>
                  No projection data available
                </Text>
              )}
            </Card.Content>
          </Card>

          <View style={{ height: spacing.base }} />
          <Button mode="contained" onPress={onDismiss} style={{ marginTop: spacing.sm }}>
            Close
          </Button>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    margin: spacing.base,
    marginTop: 'auto',
    maxHeight: '85%',
    overflow: 'hidden',
  },
  scrollContent: {
    padding: spacing.base,
  },
});
