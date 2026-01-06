import React, { useContext, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { subscribeMyGoals, upsertUserGoals } from '../services/goals';

type Props = NativeStackScreenProps<RootStackParamList, 'SetGoals'>;

export default function SetGoalsScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;

  const [workoutsPerWeek, setWorkoutsPerWeek] = useState('4');
  const [logCaloriesDaysPerWeek, setLogCaloriesDaysPerWeek] = useState('5');
  const [logWeightDaysPerWeek, setLogWeightDaysPerWeek] = useState('5');
  const [dailyCalorieGoal, setDailyCalorieGoal] = useState('2500');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeMyGoals(groupId, user.uid, (g) => {
      if (!g) return;
      setWorkoutsPerWeek(String(g.workoutsPerWeek ?? 0));
      setLogCaloriesDaysPerWeek(String(g.logCaloriesDaysPerWeek ?? 0));
      setLogWeightDaysPerWeek(String(g.logWeightDaysPerWeek ?? 0));
      setDailyCalorieGoal(String(g.dailyCalorieGoal ?? 0));
    });
  }, [groupId, user]);

  const onSave = async () => {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const w = Number(workoutsPerWeek);
      const c = Number(logCaloriesDaysPerWeek);
      const wt = Number(logWeightDaysPerWeek);
      const dcg = Number(dailyCalorieGoal);
      for (const [label, v] of [
        ['Workouts/week', w],
        ['Calories log days/week', c],
        ['Weight log days/week', wt],
      ] as const) {
        if (!Number.isFinite(v) || v < 0 || v > 7) {
          setError(`${label} must be between 0 and 7.`);
          return;
        }
      }
      if (!Number.isFinite(dcg) || dcg < 0 || dcg > 20000) {
        setError('Daily calorie goal must be between 0 and 20000.');
        return;
      }

      await upsertUserGoals({
        groupId,
        uid: user.uid,
        workoutsPerWeek: w,
        logCaloriesDaysPerWeek: c,
        logWeightDaysPerWeek: wt,
        dailyCalorieGoal: dcg,
      });
      navigation.goBack();
    } catch (e) {
      setError('Failed to save goals.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Card>
          <Card.Title title="Set your goals" subtitle="Weekly targets (0–7)" />
          <Card.Content>
            <TextInput
              label="Workouts per week"
              keyboardType="number-pad"
              value={workoutsPerWeek}
              onChangeText={setWorkoutsPerWeek}
              disabled={isSubmitting}
            />
            <View style={{ height: 12 }} />
            <TextInput
              label="Days/week to log calories"
              keyboardType="number-pad"
              value={logCaloriesDaysPerWeek}
              onChangeText={setLogCaloriesDaysPerWeek}
              disabled={isSubmitting}
            />
            <View style={{ height: 12 }} />
            <TextInput
              label="Days/week to log weight"
              keyboardType="number-pad"
              value={logWeightDaysPerWeek}
              onChangeText={setLogWeightDaysPerWeek}
              disabled={isSubmitting}
            />
            <View style={{ height: 12 }} />
            <TextInput
              label="Daily calorie goal"
              keyboardType="number-pad"
              value={dailyCalorieGoal}
              onChangeText={setDailyCalorieGoal}
              disabled={isSubmitting}
            />
            {error ? (
              <>
                <View style={{ height: 12 }} />
                <Text style={{ color: 'crimson' }}>{error}</Text>
              </>
            ) : null}
            <View style={{ height: 16 }} />
            <Button mode="contained" onPress={onSave} loading={isSubmitting} disabled={isSubmitting}>
              Save goals
            </Button>
          </Card.Content>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}


