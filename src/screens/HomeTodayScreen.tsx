import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import TodayScreen from './TodayScreen';
import GroupSwitcherSheet from '../components/today/GroupSwitcherSheet';
import { useActiveGroup } from '../store/ActiveGroupContext';
import type { HomeStackParamList } from '../navigation/types';

/**
 * Navigation-aware wrapper for the (decoupled) TodayScreen. Lives at the top of
 * the Home stack. The group chip now opens the group-switcher sheet (design 04),
 * and chat is one tap from the header — the old GroupDetail hub is no longer a
 * primary destination.
 */
export default function HomeTodayScreen() {
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { activeGroupId, groups, setActiveGroupId } = useActiveGroup();
  const [switcherVisible, setSwitcherVisible] = useState(false);

  return (
    <>
      <TodayScreen
        onOpenLog={(type) => (nav as any).navigate('LogComposer', { initialType: type })}
        onViewLeaderboard={() => {
          if (activeGroupId) nav.navigate('Leaderboard', { groupId: activeGroupId });
        }}
        onSwitchGroup={() => setSwitcherVisible(true)}
        onChat={() => {
          if (activeGroupId) nav.navigate('GroupChat', { groupId: activeGroupId });
        }}
        onBell={() => (nav as any).navigate('MainTabs', { screen: 'ProfileTab', params: { screen: 'Notifications', initial: false } })}
        onOpenMember={(uid: string) => {
          if (activeGroupId && uid) (nav as any).navigate('MemberDetail', { groupId: activeGroupId, uid });
        }}
      />

      <GroupSwitcherSheet
        visible={switcherVisible}
        onClose={() => setSwitcherVisible(false)}
        groups={groups}
        activeGroupId={activeGroupId}
        onSelect={(groupId) => {
          void setActiveGroupId(groupId);
          setSwitcherVisible(false);
        }}
        onManage={() => {
          setSwitcherVisible(false);
          (nav as any).navigate('MainTabs', { screen: 'GroupsTab' });
        }}
        onCreate={() => {
          setSwitcherVisible(false);
          (nav as any).navigate('MainTabs', { screen: 'GroupsTab', params: { screen: 'CreateGroup' } });
        }}
      />
    </>
  );
}
