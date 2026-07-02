import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import LogComposer from '../components/log/LogComposer';
import { useActiveGroup } from '../store/ActiveGroupContext';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'LogComposer'>;

/** Root modal wrapper for the Log composer (opened from the tab FAB and Today). */
export default function LogComposerScreen({ route, navigation }: Props) {
  const { activeGroupId } = useActiveGroup();

  return (
    <LogComposer
      initialType={route.params?.initialType}
      onClose={() => navigation.goBack()}
      onOpenPhoto={() => {
        if (activeGroupId) navigation.replace('AddPhoto', { groupId: activeGroupId });
      }}
    />
  );
}
