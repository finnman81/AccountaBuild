import React from 'react';
import { View, StyleSheet } from 'react-native';

import AppMark from '../ui/AppMark';
import AppText from '../ui/AppText';
import { colors, spacing } from '../../theme';

type Props = {
  title: string;
  subline?: string;
  markSize?: number;
};

/** AppMark + title + subline block shared by the auth screens (design 03). */
export default function AuthHeader({ title, subline, markSize = 56 }: Props) {
  return (
    <View style={styles.header}>
      <AppMark size={markSize} glyph="dumbbell" />
      <AppText style={styles.title}>{title}</AppText>
      {subline ? (
        <AppText variant="rowSubtitle" color="secondary" style={styles.subline}>
          {subline}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginBottom: spacing.xl },
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.base },
  subline: { textAlign: 'center', marginTop: spacing.xs, paddingHorizontal: spacing.md },
});
