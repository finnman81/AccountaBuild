import React, { useContext, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { HomeStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { subscribeMyGoals, upsertUserGoals } from '../services/goals';
import Card from '../components/ui/Card';
import AppText from '../components/ui/AppText';
import TextField from '../components/ui/TextField';
import PrimaryButton from '../components/ui/PrimaryButton';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'SetGoals'>;

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
    <View style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Card style={styles.card}>
            <AppText variant="pageTitle" color="primary" style={styles.title}>
              Set your goals
            </AppText>
            <AppText variant="rowSubtitle" color="muted" style={styles.subtitle}>
              Weekly targets (0–7)
            </AppText>

            <TextField
              label="Workouts per week"
              keyboardType="number-pad"
              value={workoutsPerWeek}
              onChangeText={setWorkoutsPerWeek}
              editable={!isSubmitting}
            />
            <TextField
              label="Days/week to log calories"
              keyboardType="number-pad"
              value={logCaloriesDaysPerWeek}
              onChangeText={setLogCaloriesDaysPerWeek}
              editable={!isSubmitting}
            />
            <TextField
              label="Days/week to log weight"
              keyboardType="number-pad"
              value={logWeightDaysPerWeek}
              onChangeText={setLogWeightDaysPerWeek}
              editable={!isSubmitting}
            />
            <TextField
              label="Daily calorie goal"
              keyboardType="number-pad"
              value={dailyCalorieGoal}
              onChangeText={setDailyCalorieGoal}
              editable={!isSubmitting}
            />

            {error ? (
              <AppText variant="rowSubtitle" color="danger" style={styles.error}>
                {error}
              </AppText>
            ) : null}

            <PrimaryButton onPress={onSave} loading={isSubmitting} disabled={isSubmitting} style={styles.button}>
              Save goals
            </PrimaryButton>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  card: { gap: spacing.md },
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.sm },
  error: { marginTop: spacing.xs },
  button: { marginTop: spacing.sm },
});
