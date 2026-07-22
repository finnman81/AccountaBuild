import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppText from '../ui/AppText';
import { colors, radius, spacing } from '../../theme';
import { HYPES, type Hype } from '../../services/hypeCatalog';

type Props = {
  visible: boolean;
  /** Who you're hyping — shown in the header so you can't mis-send. */
  targetName?: string | null;
  /** True when the recipient allows nudges; hides the nudge row otherwise. */
  allowNudges?: boolean;
  onPick: (hype: Hype) => void;
  onClose: () => void;
};

/**
 * Pick a hype to send. Only the chosen hype's ID leaves the device — the Cloud
 * Function renders the push copy from its own catalog, so this list is purely
 * presentational (see services/hypeCatalog.ts).
 */
export default function HypePickerSheet({ visible, targetName, allowNudges, onPick, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const cheers = HYPES.filter((h) => h.kind === 'cheer');
  const nudges = HYPES.filter((h) => h.kind === 'nudge');

  const Grid = ({ items }: { items: Hype[] }) => (
    <View style={styles.grid}>
      {items.map((h) => (
        <TouchableOpacity
          key={h.id}
          style={styles.chip}
          activeOpacity={0.8}
          onPress={() => onPick(h)}
          accessibilityRole="button"
          accessibilityLabel={h.label}
        >
          <AppText variant="pageTitle" style={styles.chipEmoji}>{h.emoji}</AppText>
          <AppText variant="rowSubtitle" color="primary" numberOfLines={1} style={styles.chipLabel}>
            {h.label}
          </AppText>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm) }]}>
          <View style={styles.grabber} />
          <AppText variant="rowTitle" color="primary" style={{ textAlign: 'center' }}>
            {targetName ? `Hype up ${targetName}` : 'Send some hype'}
          </AppText>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
            <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>CHEERS</AppText>
            <Grid items={cheers} />

            {allowNudges === false ? null : (
              <>
                <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>NUDGES</AppText>
                <Grid items={nudges} />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.faint,
    marginBottom: spacing.base,
  },
  sectionLabel: { marginTop: spacing.base, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    width: '31%',
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
  chipEmoji: { fontSize: 28, lineHeight: 34 },
  chipLabel: { marginTop: 4, textAlign: 'center' },
});
