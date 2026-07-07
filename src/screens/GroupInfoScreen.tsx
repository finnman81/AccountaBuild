import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { Icon, Snackbar } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, onSnapshot } from 'firebase/firestore';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';

import { GroupsStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import {
  subscribeGroupMembers,
  removeMemberAsAdmin,
  leaveGroup,
  type GroupMember,
} from '../services/groups';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { subscribePublicUsers, type PublicUser } from '../services/publicUsers';
import { friendlyNameFromDisplayName } from '../utils/formatters';
import AppText from '../components/ui/AppText';
import Avatar from '../components/ui/Avatar';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<GroupsStackParamList, 'GroupInfo'>;

type GroupDoc = { name?: string; logoUrl?: string | null; joinCode?: string; createdBy?: string };

function NavRow({ icon, title, subtitle, onPress, danger, divider = true }: { icon: string; title: string; subtitle?: string; onPress?: () => void; danger?: boolean; divider?: boolean }) {
  return (
    <>
      <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
        <Icon source={icon} size={22} color={danger ? colors.danger : colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <AppText variant="rowTitle" color={danger ? 'danger' : 'primary'}>{title}</AppText>
          {subtitle ? <AppText variant="rowSubtitle" color="muted">{subtitle}</AppText> : null}
        </View>
        {onPress && !danger ? <Icon source="chevron-right" size={20} color={colors.textMuted} /> : null}
      </TouchableOpacity>
      {divider ? <View style={styles.divider} /> : null}
    </>
  );
}

export default function GroupInfoScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const { user } = useContext(AuthContext);
  const { setActiveGroupId } = useActiveGroup();

  const [group, setGroup] = useState<GroupDoc | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [pub, setPub] = useState<Record<string, PublicUser>>({});
  const [snack, setSnack] = useState<string | null>(null);

  useEffect(() => onSnapshot(doc(db, 'groups', groupId), (s) => setGroup(s.exists() ? (s.data() as GroupDoc) : null)), [groupId]);
  useEffect(() => subscribeGroupMembers(groupId, setMembers), [groupId]);

  const memberUids = useMemo(() => members.map((m) => m.uid), [members]);
  useEffect(() => {
    if (memberUids.length === 0) return;
    return subscribePublicUsers(memberUids, setPub);
  }, [memberUids.join(',')]);

  const myUid = user?.uid ?? '';
  const isCreator = !!group?.createdBy && group.createdBy === myUid;
  const myRole = members.find((m) => m.uid === myUid)?.role ?? 'member';
  const isAdmin = isCreator || myRole === 'admin';

  const sortedMembers = useMemo(() => {
    const rank = (m: GroupMember) => (m.uid === myUid ? 0 : m.role === 'admin' ? 1 : 2);
    return [...members].sort((a, b) => rank(a) - rank(b) || friendlyNameFromDisplayName(pub[a.uid]?.displayName ?? null, a.uid).localeCompare(friendlyNameFromDisplayName(pub[b.uid]?.displayName ?? null, b.uid)));
  }, [members, pub, myUid]);

  const copyCode = async () => {
    if (!group?.joinCode) return;
    await Clipboard.setStringAsync(group.joinCode);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSnack('Join code copied');
  };

  const confirmRemove = (m: GroupMember) => {
    const name = friendlyNameFromDisplayName(pub[m.uid]?.displayName ?? null, m.uid);
    Alert.alert('Remove member?', `Remove ${name} from this group? They can rejoin with the code.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeMemberAsAdmin({ groupId, memberUid: m.uid });
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setSnack(`Removed ${name}`);
          } catch (e) {
            setSnack(e instanceof Error ? e.message : 'Failed to remove member');
          }
        },
      },
    ]);
  };

  const confirmLeave = () => {
    Alert.alert('Leave group?', "You'll lose access to this group. You can rejoin later with the join code.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          if (!user) return;
          try {
            await leaveGroup({ uid: user.uid, groupId });
            await setActiveGroupId(null);
            navigation.popToTop();
          } catch (e) {
            setSnack(e instanceof Error ? e.message : 'Failed to leave group');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} hitSlop={8}>
          <Icon source="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText variant="rowTitle" color="primary" numberOfLines={1} style={{ flex: 1 }}>Group</AppText>
        {isAdmin ? (
          <TouchableOpacity onPress={() => navigation.navigate('GroupSettings', { groupId })} style={styles.back} hitSlop={8} accessibilityLabel="Group settings">
            <Icon source="cog-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : <View style={styles.back} />}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          {group?.logoUrl ? (
            <Image source={{ uri: group.logoUrl }} style={styles.heroLogo} resizeMode="cover" />
          ) : (
            <View style={[styles.heroLogo, styles.heroLogoPlaceholder]}>
              <AppText variant="pageTitle" color="secondary">{(group?.name ?? 'G').trim().slice(0, 1).toUpperCase()}</AppText>
            </View>
          )}
          <AppText variant="pageTitle" color="primary" numberOfLines={1} style={styles.heroName}>{group?.name ?? 'Group'}</AppText>
          <AppText variant="rowSubtitle" color="muted">{members.length} member{members.length === 1 ? '' : 's'}</AppText>
        </View>

        {/* Invite code */}
        {group?.joinCode ? (
          <TouchableOpacity onPress={copyCode} activeOpacity={0.8} style={styles.codePill}>
            <View>
              <AppText variant="eyebrow" color="muted">INVITE CODE</AppText>
              <AppText variant="rowTitle" color="primary" style={styles.codeText}>{group.joinCode}</AppText>
            </View>
            <Icon source="content-copy" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}

        {/* Quick links */}
        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Group</AppText>
        <View style={styles.group}>
          <NavRow icon="flag-checkered" title="Challenge" onPress={() => navigation.navigate('Challenge', { groupId })} />
          <NavRow icon="chat-outline" title="Chat" onPress={() => navigation.navigate('GroupChat', { groupId })} />
          <NavRow
            icon="chart-box-outline"
            title="Compliance charts"
            onPress={() => {
              void setActiveGroupId(groupId);
              (navigation as any).navigate('MainTabs', { screen: 'ProgressTab', params: { screen: 'Progress' } });
            }}
          />
          <NavRow icon="image-multiple-outline" title="Progress photos" onPress={() => navigation.navigate('ViewPhotos', { groupId })} />
          <NavRow icon="trophy-outline" title="Leaderboard" onPress={() => navigation.navigate('Leaderboard', { groupId })} />
          <NavRow icon="lightbulb-outline" title="Issues & suggestions" onPress={() => navigation.navigate('Issues', { groupId })} divider={false} />
        </View>

        {/* Members */}
        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Members ({members.length})</AppText>
        <View style={styles.group}>
          {sortedMembers.map((m, i) => {
            const name = friendlyNameFromDisplayName(pub[m.uid]?.displayName ?? null, m.uid);
            const isMe = m.uid === myUid;
            const canRemove = isAdmin && !isMe && m.uid !== group?.createdBy;
            return (
              <View key={m.uid} style={[styles.memberRow, i < sortedMembers.length - 1 && styles.divider]}>
                <Avatar photoURL={pub[m.uid]?.photoURL ?? null} name={name} size={40} />
                <View style={{ flex: 1 }}>
                  <AppText variant="rowTitle" color="primary" numberOfLines={1}>{name}{isMe ? ' (You)' : ''}</AppText>
                  {m.role === 'admin' ? <AppText variant="rowSubtitle" color="muted">Admin</AppText> : null}
                </View>
                {canRemove ? (
                  <TouchableOpacity onPress={() => confirmRemove(m)} hitSlop={8} style={styles.removeBtn}>
                    <AppText variant="rowSubtitle" color="danger">Remove</AppText>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* Danger */}
        {!isCreator ? (
          <View style={[styles.group, { marginTop: spacing.lg }]}>
            <NavRow icon="logout" title="Leave group" onPress={confirmLeave} danger divider={false} />
          </View>
        ) : null}
      </ScrollView>

      <Snackbar visible={!!snack} onDismiss={() => setSnack(null)} duration={2000}>{snack ?? ''}</Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  hero: { alignItems: 'center', gap: 4, paddingVertical: spacing.md },
  heroLogo: { width: 72, height: 72, borderRadius: radius.card, backgroundColor: colors.surface2, marginBottom: spacing.sm },
  heroLogoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  heroName: { textAlign: 'center' },
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderCard,
    borderRadius: radius.card,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  codeText: { fontFamily: 'monospace', letterSpacing: 2 },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, marginLeft: spacing.xs },
  group: { backgroundColor: colors.surface, borderRadius: radius.listGroup, borderWidth: 1, borderColor: colors.borderCard, paddingHorizontal: spacing.base },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md, minHeight: 52 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: 56 },
  removeBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
});
