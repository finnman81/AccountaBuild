import React, { useContext, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { AuthContext } from '../store/AuthContext';
import { subscribeMyBlocks, unblockUser } from '../services/moderation';
import { subscribePublicUsers, type PublicUser } from '../services/publicUsers';
import { friendlyNameFromDisplayName } from '../utils/formatters';
import AppText from '../components/ui/AppText';
import Avatar from '../components/ui/Avatar';
import { colors, radius, spacing } from '../theme';

/**
 * Manage blocked users. Apple expects blocking to be reversible and
 * discoverable, not a one-way trapdoor buried in a long-press menu.
 */
export default function BlockedUsersScreen() {
  const { user } = useContext(AuthContext);
  const nav = useNavigation<any>();
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Record<string, PublicUser>>({});

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyBlocks(user.uid, setBlocked);
  }, [user?.uid]);

  useEffect(() => {
    const uids = [...blocked];
    if (!uids.length) {
      setProfiles({});
      return;
    }
    // A blocked user may no longer share a group, so publicUsers can come back
    // empty — the row falls back to a generic label rather than vanishing.
    return subscribePublicUsers(uids, setProfiles);
  }, [blocked]);

  const confirmUnblock = (uid: string, name: string) =>
    Alert.alert(`Unblock ${name}?`, "You'll see their messages and logs again.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unblock', onPress: () => user?.uid && void unblockUser(user.uid, uid).catch(() => {}) },
    ]);

  const uids = [...blocked];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.back} hitSlop={8}>
          <Icon source="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText variant="pageTitle" color="primary" style={styles.title}>Blocked</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {uids.length === 0 ? (
          <AppText variant="rowSubtitle" color="muted" style={{ textAlign: 'center', marginTop: spacing.xl }}>
            You haven't blocked anyone.{'\n'}Long-press a message or log to report or block.
          </AppText>
        ) : (
          uids.map((uid) => {
            const p = profiles[uid];
            const name = p ? friendlyNameFromDisplayName(p.displayName ?? null, uid) : 'Blocked user';
            return (
              <View key={uid} style={styles.row}>
                <Avatar photoURL={p?.photoURL ?? null} name={name} size={40} />
                <AppText variant="rowTitle" color="primary" style={{ flex: 1 }}>{name}</AppText>
                <TouchableOpacity onPress={() => confirmUnblock(uid, name)} style={styles.unblockBtn} activeOpacity={0.8}>
                  <AppText variant="rowSubtitle" color="accent">Unblock</AppText>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderCard,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  unblockBtn: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
});
