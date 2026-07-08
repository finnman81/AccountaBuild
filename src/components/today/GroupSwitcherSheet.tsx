import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View, Image } from 'react-native';
import { Icon } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppText from '../ui/AppText';
import { colors, radius, spacing } from '../../theme';
import type { UserGroupListItem } from '../../services/groups';

type Props = {
  visible: boolean;
  onClose: () => void;
  groups: UserGroupListItem[];
  activeGroupId: string | null;
  onSelect: (groupId: string) => void;
  onManage: () => void;
  onCreate: () => void;
};

function GroupLogo({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  if (logoUrl) return <Image source={{ uri: logoUrl }} style={styles.logo} resizeMode="cover" />;
  const initials = name.trim().slice(0, 2).toUpperCase();
  return (
    <View style={[styles.logo, styles.logoPlaceholder]}>
      <AppText variant="label" color="secondary" style={{ fontWeight: '700' }}>{initials}</AppText>
    </View>
  );
}

/**
 * Group-switcher sheet (design 04): the Today group chip opens this instead of
 * the old GroupDetail hub. Lists the user's groups, sets the active one on tap,
 * and links out to the Groups tab for management / creation.
 */
export default function GroupSwitcherSheet({ visible, onClose, groups, activeGroupId, onSelect, onManage, onCreate }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm) }]}>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <AppText variant="rowTitle" color="primary">Your groups</AppText>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <AppText variant="rowTitle" color="muted">✕</AppText>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
            {groups.length === 0 ? (
              <AppText variant="rowSubtitle" color="muted" style={{ paddingVertical: spacing.base }}>
                You're not in any groups yet.
              </AppText>
            ) : (
              groups.map((g) => {
                const active = g.groupId === activeGroupId;
                return (
                  <TouchableOpacity
                    key={g.groupId}
                    style={[styles.groupRow, active && styles.groupRowActive]}
                    onPress={() => onSelect(g.groupId)}
                    activeOpacity={0.8}
                  >
                    <GroupLogo name={g.name} logoUrl={g.logoUrl} />
                    <View style={styles.groupText}>
                      <AppText variant="rowTitle" color="primary" numberOfLines={1}>{g.name}</AppText>
                      <AppText variant="rowSubtitle" color="muted">
                        {(g.memberCount ?? 0)} member{(g.memberCount ?? 0) === 1 ? '' : 's'}
                        {g.role === 'admin' ? ' · Admin' : ''}
                      </AppText>
                    </View>
                    {active ? <Icon source="check-circle" size={22} color={colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <View style={styles.footerActions}>
            <TouchableOpacity style={styles.footerBtn} onPress={onCreate} activeOpacity={0.8}>
              <Icon source="plus" size={20} color={colors.primary} />
              <AppText variant="rowTitle" color="primary">Create group</AppText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.footerBtn} onPress={onManage} activeOpacity={0.8}>
              <Icon source="cog-outline" size={20} color={colors.textSecondary} />
              <AppText variant="rowTitle" color="secondary">Manage groups</AppText>
            </TouchableOpacity>
          </View>
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
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: colors.faint, marginTop: spacing.md, marginBottom: spacing.base },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  logo: { width: 40, height: 40, borderRadius: radius.tile, backgroundColor: colors.surface2 },
  logoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.tile,
  },
  groupRowActive: { backgroundColor: colors.surface2 },
  groupText: { flex: 1, gap: 2 },
  footerActions: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
});
