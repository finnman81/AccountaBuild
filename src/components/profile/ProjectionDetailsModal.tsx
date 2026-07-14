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
    };
  }, [projection]);

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
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                          Week Score:
                        </Text>
                        <Text variant="bodySmall" style={{ color: colors.textPrimary }}>
                          {Math.round(details.weekScore)}
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
                      Formula: ΔFP = Week Score × Streak × Week elapsed − Penalty
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
