import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import Card from '../components/ui/Card';
import Row from '../components/ui/Row';
import { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'LogToday'>;

export default function LogTodayScreen({ route, navigation }: Props) {
  const { groupId } = route.params;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Row title="Log calories" icon="fire" onPress={() => navigation.navigate('AddCalories', { groupId })} />
          <View style={styles.divider} />
          <Row title="Log workout" icon="dumbbell" onPress={() => navigation.navigate('AddWorkout', { groupId })} />
          <View style={styles.divider} />
          <Row title="Log weight" icon="scale-bathroom" onPress={() => navigation.navigate('AddWeight', { groupId })} />
          <View style={styles.divider} />
          <Row title="Add progress photo" icon="camera" onPress={() => navigation.navigate('AddPhoto', { groupId })} />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.base, paddingBottom: spacing.xxl },
  card: { padding: 0, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.base },
});
