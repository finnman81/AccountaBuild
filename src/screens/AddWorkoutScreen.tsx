import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { addWorkoutLog, WorkoutType } from '../services/logs';

type Props = NativeStackScreenProps<RootStackParamList, 'AddWorkout'>;

const workoutTypes: { label: string; value: WorkoutType }[] = [
  { label: 'Weight Lifting', value: 'weightLifting' },
  { label: 'Running', value: 'running' },
  { label: 'Jogging', value: 'jogging' },
  { label: 'Ruck', value: 'ruck' },
  { label: 'Swim', value: 'swim' },
];

export default function AddWorkoutScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;
  const [workoutType, setWorkoutType] = useState<WorkoutType>('weightLifting');
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
        <Card>
          <Card.Title title="Log workout" />
          <Card.Content>
            <Text variant="bodySmall">Workout type</Text>
            <View style={{ height: 8 }} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {workoutTypes.map((w) => (
                <Button
                  key={w.value}
                  mode={workoutType === w.value ? 'contained' : 'outlined'}
                  onPress={() => setWorkoutType(w.value)}
                  compact
                >
                  {w.label}
                </Button>
              ))}
            </View>

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


