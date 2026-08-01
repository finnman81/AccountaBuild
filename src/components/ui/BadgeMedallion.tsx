import React from 'react';
import { StyleSheet, View } from 'react-native';

import AppText from './AppText';
import { badgeLook } from '../../services/badgeCatalog';
import { colors, radius, spacing } from '../../theme';

type Props = {
  /** Catalog key: achievementId, 'seasonRank'/'seasonPeak', or 'reached-<Tier>'. */
  lookKey: string;
  label: string;
  /** Small line under the label (season, flavor text, date). */
  sub?: string | null;
};

/**
 * A badge rendered as a medallion card: tinted emblem, label, flavor line.
 * Replaces the old one-size-fits-all gold pill ("🏅 Hard Mode (4 weeks)") that
 * made every achievement look identical.
 */
export default function BadgeMedallion({ lookKey, label, sub }: Props) {
  const look = badgeLook(lookKey);
  return (
    <View style={[styles.card, { borderColor: `${look.tint}55` }]}>
      <View style={[styles.emblem, { backgroundColor: `${look.tint}1F`, borderColor: `${look.tint}66` }]}>
        <AppText style={styles.emoji}>{look.emoji}</AppText>
      </View>
      <AppText variant="label" color="primary" numberOfLines={2} style={styles.label}>
        {label}
      </AppText>
      {sub ? (
        <AppText variant="label" color="muted" numberOfLines={2} style={styles.sub}>
          {sub}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '31%',
    minWidth: 96,
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  emblem: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 24, lineHeight: 30 },
  label: { marginTop: spacing.sm, textAlign: 'center', fontWeight: '700' },
  sub: { marginTop: 2, textAlign: 'center', fontSize: 10, lineHeight: 13 },
});
