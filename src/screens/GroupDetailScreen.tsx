import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { HomeStackParamList } from '../navigation/types';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { colors } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'GroupDetail'>;

/**
 * RETIRED: the old GroupDetail "hub" was a second home screen that duplicated
 * Today and buried chat/charts/settings behind it (see Notes/IA_AUDIT.md). It's
 * been replaced by Today (home) + the group-switcher sheet + GroupInfo (group
 * home under the Groups tab). This thin redirect keeps any lingering link/route
 * working: it makes the target group active and sends the user to Today. Safe to
 * delete after a release of soak.
 */
export default function GroupDetailScreen({ route, navigation }: Props) {
  const { setActiveGroupId } = useActiveGroup();
  const groupId = route.params?.groupId;

  useEffect(() => {
    if (groupId) void setActiveGroupId(groupId);
    navigation.replace('Today');
  }, [groupId, navigation, setActiveGroupId]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
