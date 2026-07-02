import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import TodayScreen from './TodayScreen';
import { useActiveGroup } from '../store/ActiveGroupContext';
import type { HomeStackParamList } from '../navigation/types';

/**
 * Navigation-aware wrapper for the (decoupled) TodayScreen. Lives at the top of
 * the Home stack. The group chip opens the existing group hub (GroupDetail),
 * which keeps chat/charts/photos/settings reachable during the redesign.
 */
export default function HomeTodayScreen() {
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { activeGroupId } = useActiveGroup();

  return (
    <TodayScreen
      onOpenLog={(type) => (nav as any).navigate('LogComposer', { initialType: type })}
      onViewLeaderboard={() => {
        if (activeGroupId) nav.navigate('Leaderboard', { groupId: activeGroupId });
      }}
      onSwitchGroup={() => {
        if (activeGroupId) nav.navigate('GroupDetail', { groupId: activeGroupId });
      }}
      onBell={() => (nav as any).navigate('MainTabs', { screen: 'ProfileTab', params: { screen: 'Notifications' } })}
      onOpenMember={() => {}}
    />
  );
}
