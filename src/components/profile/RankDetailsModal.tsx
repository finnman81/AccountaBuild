import React, { useMemo } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Card, Text, Button, Modal, Portal, useTheme } from 'react-native-paper';
import RankBadge from '../mmr/RankBadge';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { MmrState } from '../../services/mmrState';
import type { EarnedBadge } from '../../services/mmrBadges';
import { bandForMMR, mpForMMR, BANDS } from '../../mmr/ranks';

type Props = {
  visible: boolean;
  mmrState: MmrState | null;
  badges: EarnedBadge[];
  onDismiss: () => void;
};

const isSeasonBadge = (b: EarnedBadge): b is Extract<EarnedBadge, { type: 'seasonRank' | 'seasonPeak' }> =>
  b.type === 'seasonRank' || b.type === 'seasonPeak';
const isAchievementBadge = (b: EarnedBadge): b is Extract<EarnedBadge, { type: 'achievement' }> => b.type === 'achievement';

export default function RankDetailsModal({ visible, mmrState, badges, onDismiss }: Props) {
  const theme = useTheme();

  const rankDetails = useMemo(() => {
    if (!mmrState) return null;

    const currentBand = bandForMMR(mmrState.mmr);
    const mp = mpForMMR(mmrState.mmr, currentBand);
    const div = mmrState.rankDivision;
    const roman = div === 1 ? 'I' : div === 2 ? 'II' : div === 3 ? 'III' : div === 4 ? 'IV' : '';
    const rankLabel = div ? `${mmrState.rankTier} ${roman}` : mmrState.rankTier;

    // Find next division
    const currentBandIndex = BANDS.findIndex(
      (b) => b.tier === currentBand.tier && b.division === currentBand.division && b.min === currentBand.min
    );
    const nextBand = currentBandIndex >= 0 && currentBandIndex < BANDS.length - 1 ? BANDS[currentBandIndex + 1] : null;
    const nextDivisionLabel = nextBand
      ? nextBand.division
        ? `${nextBand.tier} ${nextBand.division === 1 ? 'I' : nextBand.division === 2 ? 'II' : nextBand.division === 3 ? 'III' : 'IV'}`
        : nextBand.tier
      : null;

    return {
      rankLabel,
      mmr: mmrState.mmr,
      mp,
      currentBand,
      nextDivisionLabel,
      tierShieldWeeksRemaining: mmrState.tierShieldWeeksRemaining ?? 0,
    };
  }, [mmrState]);

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
            <Card.Title title="Rank Details" />
            <Card.Content>
              {rankDetails ? (
                <View style={{ gap: spacing.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <RankBadge tier={mmrState!.rankTier} size={64} />
                    <View style={{ flex: 1 }}>
                      <Text variant="titleLarge" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                        {rankDetails.rankLabel}
                      </Text>
                      <Text variant="bodyMedium" style={{ color: colors.textSecondary }}>
                        {rankDetails.mmr} FP • {rankDetails.mp} MP
                      </Text>
                    </View>
                  </View>

                  <View style={{ gap: spacing.sm }}>
                    <Text variant="titleSmall" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                      Rank Calculation
                    </Text>
                    <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                      Your Fitness Points (FP) determine your rank. Each tier is divided into divisions (IV, III, II, I), and Master Points (MP) show your progress within your current division.
                    </Text>
                    <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                      MP = 100 × (FP - Division Min) / (Division Max - Division Min)
                    </Text>
                    {rankDetails.nextDivisionLabel && (
                      <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                        Next rank: {rankDetails.nextDivisionLabel}
                      </Text>
                    )}
                  </View>

                  {rankDetails.tierShieldWeeksRemaining > 0 && (
                    <View
                      style={{
                        padding: spacing.sm,
                        borderRadius: radius.card,
                        backgroundColor: colors.surface2,
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.04)',
                      }}
                    >
                      <Text variant="bodySmall" style={{ color: colors.textPrimary }}>
                        🛡️ Tier Shield: {rankDetails.tierShieldWeeksRemaining} week{rankDetails.tierShieldWeeksRemaining !== 1 ? 's' : ''} remaining
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <Text variant="bodyMedium" style={{ color: colors.textMuted }}>
                  No rank data available
                </Text>
              )}
            </Card.Content>
          </Card>

          {badges.length > 0 && (
            <>
              <View style={{ height: spacing.base }} />
              <Card>
                <Card.Title title="Badges" />
                <Card.Content>
                  <View style={{ gap: spacing.md }}>
                    {badges.filter(isSeasonBadge).length > 0 && (
                      <View>
                        <Text variant="labelMedium" style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
                          Season Achievements
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                          {badges.filter(isSeasonBadge).map((b) => (
                            <View key={b.id} style={{ alignItems: 'center', minWidth: 80 }}>
                              <RankBadge tier={b.tier} size={48} />
                              <View style={{ height: 6 }} />
                              <Text variant="labelSmall" style={{ color: colors.textMuted, textAlign: 'center' }}>
                                {b.seasonId}
                                {b.type === 'seasonPeak' ? ' Peak' : ''}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {badges.some(isAchievementBadge) && (
                      <View>
                        <Text variant="labelMedium" style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
                          Achievements
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                          {badges.filter(isAchievementBadge).map((b) => (
                            <View
                              key={b.id}
                              style={{
                                paddingHorizontal: spacing.sm,
                                paddingVertical: spacing.xs,
                                borderRadius: 999,
                                backgroundColor: theme.colors.surfaceVariant,
                                borderWidth: 1,
                                borderColor: theme.colors.outlineVariant,
                              }}
                            >
                              <Text variant="labelSmall" style={{ color: colors.textPrimary }}>
                                {b.title}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                </Card.Content>
              </Card>
            </>
          )}

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
