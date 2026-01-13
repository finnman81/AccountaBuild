import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, Card, List, Modal, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { addWorkoutLog, WorkoutType } from '../services/logs';
import { db } from '../firebase/firebase';

type Props = NativeStackScreenProps<RootStackParamList, 'AddWorkout'>;

const workoutTypes: { label: string; value: WorkoutType }[] = [
  { label: 'Weight Lifting', value: 'weightLifting' },
  { label: 'Running', value: 'running' },
  { label: 'Jogging', value: 'jogging' },
  { label: 'Ruck', value: 'ruck' },
  { label: 'Swim', value: 'swim' },
  { label: 'Bike', value: 'bike' },
  { label: 'StairMaster', value: 'stairMaster' },
  { label: 'Incline Walk', value: 'inclineWalk' },
  { label: 'Rowing', value: 'rowing' },
  { label: 'Elliptical', value: 'elliptical' },
  { label: 'HIIT', value: 'hiit' },
  { label: 'Yoga', value: 'yoga' },
];

export default function AddWorkoutScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;
  const theme = useTheme();
  const [workoutType, setWorkoutType] = useState<WorkoutType>('weightLifting');
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const minutes = Number(durationMinutes);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        setError('Duration is required (minutes).');
        return;
      }
      await addWorkoutLog({ groupId, uid: user.uid, workoutType, durationMinutes: minutes, note });
      // Persist user-level workout history for profile charts (cross-group).
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const date = `${yyyy}-${mm}-${dd}`;
      await addDoc(collection(db, 'users', user.uid, 'workouts'), {
        uid: user.uid,
        date,
        workoutType,
        durationMinutes: minutes,
        ts: serverTimestamp(),
      });
      navigation.goBack();
    } catch (e) {
      setError('Failed to save workout.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Portal>
          <Modal
            visible={typePickerVisible}
            onDismiss={() => setTypePickerVisible(false)}
            contentContainerStyle={{
              margin: 16,
              borderRadius: 16,
              overflow: 'hidden',
              backgroundColor: theme.colors.surface,
              maxHeight: '70%',
            }}
          >
            <Card>
              <Card.Title title="Workout type" />
              <Card.Content style={{ paddingHorizontal: 0, paddingTop: 6, paddingBottom: 0 }}>
                <ScrollView
                  style={{ maxHeight: 380 }}
                  contentContainerStyle={{ paddingTop: 6, paddingBottom: 18 }}
                  showsVerticalScrollIndicator
                >
                  {workoutTypes.map((w) => (
                    <List.Item
                      key={w.value}
                      title={w.label}
                      onPress={() => {
                        setWorkoutType(w.value);
                        setTypePickerVisible(false);
                      }}
                      right={(props) => (w.value === workoutType ? <List.Icon {...props} icon="check" /> : null)}
                    />
                  ))}
                </ScrollView>
              </Card.Content>
              <Card.Actions style={{ justifyContent: 'flex-end' }}>
                <Button mode="text" onPress={() => setTypePickerVisible(false)}>
                  Close
                </Button>
              </Card.Actions>
            </Card>
          </Modal>
        </Portal>

        <Card>
          <Card.Title title="Log workout" />
          <Card.Content>
            <Text variant="bodySmall">Workout type</Text>
            <View style={{ height: 8 }} />
            <Button
              mode="outlined"
              disabled={isSubmitting}
              onPress={() => setTypePickerVisible(true)}
              contentStyle={{ justifyContent: 'space-between' }}
              icon="chevron-down"
            >
              {workoutTypes.find((w) => w.value === workoutType)?.label ?? 'Select'}
            </Button>

            <View style={{ height: 12 }} />
            <TextInput
              label="Duration (minutes)"
              keyboardType="number-pad"
              value={durationMinutes}
              onChangeText={setDurationMinutes}
              disabled={isSubmitting}
            />
            <View style={{ height: 12 }} />
            <TextInput
              label="Note (optional)"
              value={note}
              onChangeText={setNote}
              disabled={isSubmitting}
              multiline
            />
            {error ? (
              <>
                <View style={{ height: 12 }} />
                <Text style={{ color: 'crimson' }}>{error}</Text>
              </>
            ) : null}
            <View style={{ height: 16 }} />
            <Button mode="contained" onPress={onSubmit} loading={isSubmitting} disabled={isSubmitting}>
              Save
            </Button>
          </Card.Content>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}


