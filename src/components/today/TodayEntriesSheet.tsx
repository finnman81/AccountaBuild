import React from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppText from '../ui/AppText';
import { colors, radius, spacing } from '../../theme';
import type { ChecklistItem, TodayLogEntry } from '../../viewmodels/today';

type Props = {
  item: ChecklistItem | null;
  onClose: () => void;
  onEdit: (entry: TodayLogEntry) => void;
  onDelete: (entry: TodayLogEntry) => void;
  onAdd: (type: ChecklistItem['type']) => void;
};

function fmtTime(ms: number | null): string {
  if (!ms) return '';
  const d = new Date(ms);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

/** Tapping a logged row on Today opens this: view / edit / delete today's entries of that type. */
export default function TodayEntriesSheet({ item, onClose, onEdit, onDelete, onAdd }: Props) {
  const insets = useSafeAreaInsets();
  const visible = !!item;

  const confirmDelete = (entry: TodayLogEntry) => {
    Alert.alert('Delete entry?', 'This removes the logged entry for everyone in the group.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(entry) },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm) }]}>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <AppText variant="rowTitle" color="primary">{item?.title ?? ''}</AppText>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <AppText variant="rowTitle" color="muted">✕</AppText>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            {(item?.entries ?? []).length === 0 ? (
              <AppText variant="rowSubtitle" color="muted" style={{ paddingVertical: spacing.base }}>No entries yet.</AppText>
            ) : (
              (item?.entries ?? []).map((entry, i) => (
                <View key={entry.logId} style={[styles.entryRow, i < (item?.entries.length ?? 0) - 1 && styles.divider]}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="rowTitle" color="primary">{entry.valueLine}</AppText>
                    {entry.loggedAtMs ? <AppText variant="rowSubtitle" color="muted">{fmtTime(entry.loggedAtMs)}</AppText> : null}
                  </View>
                  <TouchableOpacity onPress={() => onEdit(entry)} style={styles.iconBtn} accessibilityLabel="Edit">
                    <Icon source="pencil-outline" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDelete(entry)} style={styles.iconBtn} accessibilityLabel="Delete">
                    <Icon source="trash-can-outline" size={20} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>

          {item ? (
            <TouchableOpacity style={styles.addBtn} onPress={() => onAdd(item.type)} activeOpacity={0.8}>
              <Icon source="plus" size={20} color={colors.primary} />
              <AppText variant="rowTitle" color="primary">Add another</AppText>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: colors.faint, marginTop: spacing.md, marginBottom: spacing.base },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
});
