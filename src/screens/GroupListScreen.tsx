import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Share } from 'react-native';
import { Button, Dialog, Portal, Snackbar, Icon } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';

import AppText from '../components/ui/AppText';
import PrimaryButton from '../components/ui/PrimaryButton';
import GroupCard from '../components/group/GroupCard';
import LoadingState from '../components/state/LoadingState';
import ErrorState from '../components/state/ErrorState';
import { GroupsStackParamList } from '../navigation/types';
import type { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { leaveGroup, subscribeMyGroups, UserGroupListItem } from '../services/groups';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { useGroupsOverview } from '../hooks/useGroupsOverview';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<GroupsStackParamList, 'GroupList'>;

export default function GroupListScreen({ navigation }: Props) {
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout } = useContext(AuthContext);
  const { activeGroupId, setActiveGroupId } = useActiveGroup();
  const [groups, setGroups] = useState<UserGroupListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [leaveDialogVisible, setLeaveDialogVisible] = useState(false);
  const [leavingGroupId, setLeavingGroupId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    return subscribeMyGroups(
      user.uid,
      (items) => {
        setGroups(items);
        setError(null);
        setIsLoading(false);
      },
      () => {
        setError('Failed to load groups.');
        setIsLoading(false);
      },
    );
  }, [retryKey, user]);

  const groupIds = useMemo(() => groups.map((g) => g.groupId), [groups]);
  const overviews = useGroupsOverview(groupIds, user?.uid);

  const inviteGroup = useMemo(
    () => groups.find((g) => g.groupId === activeGroupId) ?? groups[0] ?? null,
    [groups, activeGroupId],
  );

  const openGroup = (g: UserGroupListItem) => {
    void setActiveGroupId(g.groupId);
    rootNav.navigate('MainTabs', { screen: 'HomeTab' } as any);
  };

  const confirmLeaveGroup = async () => {
    if (!user || !leavingGroupId) return;
    setIsLeaving(true);
    try {
      await leaveGroup({ uid: user.uid, groupId: leavingGroupId });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSnack('Left group');
      setLeaveDialogVisible(false);
      if (activeGroupId === leavingGroupId) void setActiveGroupId(null);
      setLeavingGroupId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to leave group.');
    } finally {
      setIsLeaving(false);
    }
  };

  const copyCode = async () => {
    if (!inviteGroup?.joinCode) return;
    await Clipboard.setStringAsync(inviteGroup.joinCode);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSnack('Join code copied');
  };

  const shareInvite = async () => {
    if (!inviteGroup?.joinCode) return;
    try {
      await Share.share({
        message: `Join my group "${inviteGroup.name ?? 'my crew'}" on AccountaBuild — we keep each other on track with workouts, calories, and weekly goals. Open the app, tap Join group, and enter code ${inviteGroup.joinCode}`,
      });
    } catch {
      /* user dismissed the sheet */
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Portal>
        <Dialog visible={leaveDialogVisible} onDismiss={() => !isLeaving && setLeaveDialogVisible(false)}>
          <Dialog.Title>Leave group?</Dialog.Title>
          <Dialog.Content>
            <AppText variant="body" color="secondary">
              You'll lose access to this group and its members. You can rejoin later with the join code.
            </AppText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLeaveDialogVisible(false)} disabled={isLeaving}>Cancel</Button>
            <Button onPress={confirmLeaveGroup} loading={isLeaving} disabled={isLeaving} textColor={colors.danger}>Leave</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText variant="pageTitle" color="primary" style={styles.title}>Groups</AppText>

        <View style={styles.actions}>
          <PrimaryButton onPress={() => navigation.navigate('CreateGroup')} style={styles.actionBtn} icon="plus">
            Create group
          </PrimaryButton>
          <PrimaryButton secondary onPress={() => navigation.navigate('JoinGroup')} style={styles.actionBtn} icon="account-multiple-plus-outline">
            Join with code
          </PrimaryButton>
        </View>

        {isLoading ? (
          <View style={styles.stateWrap}><LoadingState skeletonCount={2} /></View>
        ) : error ? (
          <View style={styles.stateWrap}><ErrorState onRetry={() => setRetryKey((k) => k + 1)} message={error} /></View>
        ) : groups.length === 0 ? (
          <View style={styles.stateWrap}>
            <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
              No groups yet. Create one or join with a code.
            </AppText>
          </View>
        ) : (
          <View style={styles.list}>
            {groups.map((g) => (
              <GroupCard
                key={g.groupId}
                group={g}
                overview={overviews[g.groupId]}
                isActive={g.groupId === activeGroupId}
                onPress={() => openGroup(g)}
                onInfo={() => navigation.navigate('GroupInfo', { groupId: g.groupId })}
              />
            ))}
          </View>
        )}

        {inviteGroup?.joinCode ? (
          <View style={styles.inviteCard}>
            <AppText variant="rowTitle" color="primary" style={{ textAlign: 'center' }}>Accountability works better together</AppText>
            <AppText variant="rowSubtitle" color="muted" style={styles.inviteSub}>
              Invite a friend with your join code — groups with 4+ members keep streaks 2× longer.
            </AppText>
            <TouchableOpacity onPress={copyCode} activeOpacity={0.8} style={styles.codePill}>
              <AppText variant="rowTitle" color="primary" style={styles.codeText}>{inviteGroup.joinCode}</AppText>
              <Icon source="content-copy" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={shareInvite} activeOpacity={0.85} style={styles.shareBtn}>
              <Icon source="share-variant" size={16} color="#FFFFFF" />
              <AppText variant="rowSubtitle" style={{ color: '#FFFFFF', fontWeight: '700' }}>Share invite</AppText>
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity onPress={logout} style={styles.signOut}>
          <AppText variant="rowSubtitle" color="muted">Sign out</AppText>
        </TouchableOpacity>
      </ScrollView>

      <Snackbar visible={!!snack} onDismiss={() => setSnack(null)} duration={2000}>
        {snack ?? ''}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  title: { fontSize: 26, fontWeight: '700', marginBottom: spacing.base },
  actions: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  actionBtn: { flex: 1 },
  stateWrap: { paddingVertical: spacing.lg },
  list: { gap: spacing.base },
  inviteCard: {
    marginTop: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.dashedBorder,
    borderStyle: 'dashed',
    borderRadius: radius.card,
    padding: spacing.base,
    alignItems: 'center',
    gap: spacing.sm,
  },
  inviteSub: { textAlign: 'center', lineHeight: 18 },
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  codeText: { fontFamily: 'monospace', letterSpacing: 2 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  signOut: { alignItems: 'center', marginTop: spacing.xl, paddingVertical: spacing.sm },
});
