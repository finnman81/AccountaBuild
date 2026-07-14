import React, { useMemo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import RankBadge from '../mmr/RankBadge';
import ProgressBar from '../ui/ProgressBar';
import AnimatedNumber from '../ui/AnimatedNumber';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { MmrState } from '../../services/mmrState';
import { bandForMMR, mpForMMR, BANDS } from '../../mmr/ranks';

type Props = {
  mmrState: MmrState | null;
  onPress?: () => void;
  onViewLeaderboard?: () => void;
};

export default function RankHeroCard({ mmrState, onPress, onViewLeaderboard }: Props) {
  const { rankLabel, progressToNext, nextDivisionLabel } = useMemo(() => {
    if (!mmrState) {
      return { rankLabel: 'Unranked', progressToNext: 0, nextDivisionLabel: null };
    }

    const div = mmrState.rankDivision;
    const roman = div === 1 ? 'I' : div === 2 ? 'II' : div === 3 ? 'III' : div === 4 ? 'IV' : '';
    const tier = mmrState.rankTier;
    const rankLabel = div ? `${tier} ${roman}` : tier;

    // Calculate progress to next division
    const currentBand = bandForMMR(mmrState.mmr);
    const mp = mpForMMR(mmrState.mmr, currentBand);
    const progressToNext = mp / 100;

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

    return { rankLabel, progressToNext, nextDivisionLabel };
  }, [mmrState]);

  if (!mmrState) {
    return (
      <Card>
        <Card.Content>
          <Text variant="bodyMedium" style={{ color: colors.textMuted }}>
            Loading rank...
          </Text>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Content>
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={onPress ? 0.7 : 1}
          disabled={!onPress}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
        >
          {/* Left: Rank Emblem */}
          <RankBadge tier={mmrState.rankTier} size={48} />

          {/* Center: Rank Info */}
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="titleLarge" style={{ color: colors.textPrimary, fontWeight: '600' }}>
              {rankLabel}
            </Text>
            <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
              <AnimatedNumber value={mmrState.mmr} /> FP • <AnimatedNumber value={mmrState.mp ?? 0} /> MP
              {(mmrState.streakFreezes ?? 0) > 0 ? `  •  🧊×${mmrState.streakFreezes}` : ''}
            </Text>
            {nextDivisionLabel && (
              <View style={{ marginTop: spacing.xs }}>
                <ProgressBar progress={progressToNext} height={6} />
                <Text variant="labelSmall" style={{ color: colors.textMuted, marginTop: 4 }}>
                  Progress to {nextDivisionLabel}
                </Text>
              </View>
            )}
          </View>

          {/* Right: CTA */}
          {onViewLeaderboard && (
            <Button
              mode="outlined"
              compact
              onPress={onViewLeaderboard}
              style={{ borderRadius: radius.button }}
            >
              Leaderboard
            </Button>
          )}
        </TouchableOpacity>
      </Card.Content>
    </Card>
  );
}
