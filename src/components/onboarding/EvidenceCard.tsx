import React from 'react';
import { View, StyleSheet } from 'react-native';

import AppText from '../ui/AppText';
import Card from '../ui/Card';
import { colors, spacing } from '../../theme';
import { typography } from '../../theme/typography';

type Side = { value: string; label: string };
type EvidenceCardProps = {
  /** The group that shared their progress. Shown big, in the accent. */
  win: Side;
  /** The group that kept it private. Shown smaller and muted. */
  lose: Side;
  citation: string;
};

/** Two numbers side by side: the study result, with its source under it. */
export default function EvidenceCard({ win, lose, citation }: EvidenceCardProps) {
  return (
    <Card tier="hero">
      <View style={styles.pair}>
        <View style={styles.side}>
          <AppText style={[typography.heroNumeral, { color: colors.primary }]}>{win.value}</AppText>
          <AppText variant="rowSubtitle" color="secondary" style={styles.label}>{win.label}</AppText>
        </View>
        <View style={styles.rule} />
        <View style={styles.side}>
          <AppText style={[typography.heroNumeral, { color: colors.textMuted }]}>{lose.value}</AppText>
          <AppText variant="rowSubtitle" color="muted" style={styles.label}>{lose.label}</AppText>
        </View>
      </View>
      <AppText variant="label" color="muted" style={styles.citation}>{citation}</AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.base },
  side: { flex: 1 },
  rule: { width: 1, alignSelf: 'stretch', backgroundColor: colors.divider },
  label: { marginTop: spacing.xs, lineHeight: 18 },
  citation: { marginTop: spacing.base },
});
