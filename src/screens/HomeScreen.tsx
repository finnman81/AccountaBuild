import React, { useEffect } from 'react';
import { View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import Screen from '../components/layout/Screen';
import EmptyState from '../components/state/EmptyState';
import LoadingState from '../components/state/LoadingState';
import type { HomeStackParamList } from '../navigation/types';
import type { RootStackParamList } from '../navigation/types';
import { useActiveGroup } from '../store/ActiveGroupContext';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { activeGroupId, groups, isReady } = useActiveGroup();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    if (!activeGroupId) return;
    navigation.replace('GroupDetail', { groupId: activeGroupId });
  }, [activeGroupId, navigation]);

  if (!isReady) {
    return (
      <Screen>
        <LoadingState skeletonCount={2} />
      </Screen>
    );
  }

  if (!groups.length) {
    return (
      <Screen>
        <EmptyState
          title="No groups yet"
          message="Create a group or join with a code to start logging together."
          ctaLabel="Go to Groups"
          onCta={() => rootNav.navigate('MainTabs', { screen: 'GroupsTab' } as any)}
        />
      </Screen>
    );
  }

  // While the effect redirects, render a tiny placeholder.
  return <View />;
}

