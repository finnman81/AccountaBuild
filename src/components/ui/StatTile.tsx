import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';

import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';

type Props = {
  label: string;
  value: string | number;
  unit?: string;
  /** Optional delta line under the value (e.g. "▾ 1.8 lb"). */
  delta?: string;
  deltaColor?: string;
  style?: ViewStyle;
};

/** A compact stat tile: eyebrow label + big tabular value (+ optional unit / delta). */
export default function StatTile({ label, value, unit, delta, deltaColor = colors.success, style }: Props) {
  return (
    <View style={[styles.tile, style]}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {unit ? <Text style={styles.unit}> {unit}</Text> : null}
      </View>
      {delta ? <Text style={[styles.delta, { color: deltaColor }]}>{delta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.tile,
    padding: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 6,
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  delta: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});
