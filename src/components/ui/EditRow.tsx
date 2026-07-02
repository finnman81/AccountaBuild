import React from 'react';
import { View, StyleSheet, TextInput, KeyboardTypeOptions } from 'react-native';

import AppText from './AppText';
import { colors, spacing } from '../../theme';

type Props = {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  subline?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  suffix?: string;
  editable?: boolean;
  showDivider?: boolean;
};

/**
 * A grouped-list edit row (design 14): label (+ optional consequence subline) on
 * the left, a right-aligned inline value input on the right. Rows stack inside a
 * surface card with hairline dividers.
 */
export default function EditRow({
  label,
  value,
  onChangeText,
  subline,
  placeholder,
  keyboardType,
  suffix,
  editable = true,
  showDivider = true,
}: Props) {
  return (
    <>
      <View style={styles.row}>
        <View style={styles.left}>
          <AppText variant="rowTitle" color="primary">{label}</AppText>
          {subline ? <AppText variant="rowSubtitle" color="muted" style={styles.subline}>{subline}</AppText> : null}
        </View>
        <View style={styles.right}>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            keyboardType={keyboardType}
            editable={editable}
            textAlign="right"
            autoCapitalize="none"
          />
          {suffix ? <AppText variant="rowSubtitle" color="muted" style={styles.suffix}>{suffix}</AppText> : null}
        </View>
      </View>
      {showDivider ? <View style={styles.divider} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
  left: { flex: 1, gap: 2 },
  subline: { paddingRight: spacing.sm },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '46%' },
  input: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', paddingVertical: 0, minWidth: 60, flexShrink: 1 },
  suffix: {},
  divider: { height: 1, backgroundColor: colors.divider },
});
