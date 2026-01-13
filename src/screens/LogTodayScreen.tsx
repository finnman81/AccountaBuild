import React from 'react';
import { Card } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import Screen from '../components/layout/Screen';
import NavList from '../components/ui/NavList';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'LogToday'>;

export default function LogTodayScreen({ route, navigation }: Props) {
  const { groupId } = route.params;

  return (
    <Screen>
      <Card>
        <Card.Content style={{ paddingHorizontal: 0 }}>
          <NavList
            items={[
              { title: 'Log calories', onPress: () => navigation.navigate('AddCalories', { groupId }) },
              { title: 'Log workout', onPress: () => navigation.navigate('AddWorkout', { groupId }) },
              { title: 'Log weight', onPress: () => navigation.navigate('AddWeight', { groupId }) },
              { title: 'Add progress photo', onPress: () => navigation.navigate('AddPhoto', { groupId }) },
            ]}
          />
        </Card.Content>
      </Card>
    </Screen>
  );
}

