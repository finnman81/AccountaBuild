import React, { useContext, useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { addCaloriesLog, MealType } from '../services/logs';
import { isFutureYYYYMMDD, isValidYYYYMMDD, todayYYYYMMDD, yesterdayYYYYMMDD } from '../utils/dates';
import { updateGroupLog } from '../services/logEdits';
import AppText from '../components/ui/AppText';
import Card from '../components/ui/Card';
import TextField from '../components/ui/TextField';
import PrimaryButton from '../components/ui/PrimaryButton';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddCalories'>;

const MEALS: { label: string; value: MealType }[] = [
  { label: 'Breakfast', value: 'breakfast' },
  { label: 'Lunch', value: 'lunch' },
  { label: 'Dinner', value: 'dinner' },
  { label: 'Snack', value: 'snack' },
  { label: 'All', value: 'all' },
];

export default function AddCaloriesScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId, edit } = route.params;
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [logDate, setLogDate] = useState(todayYYYYMMDD());
  const [calories, setCalories] = useState('');
  const [meal, setMeal] = useState<MealType>('all');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!edit) return;
    setLogDate(edit.date);
    setCalories(String(edit.calories));
    setMeal(edit.meal);
    setNote(String(edit.note ?? ''));
  }, [edit?.logId]); // intentionally only on edit change

  const onSubmit = async () => {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const date = logDate.trim();
      if (!isValidYYYYMMDD(date)) {
        setError('Enter a valid log date (YYYY-MM-DD).');
        return;
      }
      if (isFutureYYYYMMDD(date)) {
        setError('Log date cannot be in the future.');
        return;
      }
      const value = Number(calories);
      if (!Number.isFinite(value) || value <= 0) {
        setError('Enter a valid calorie number.');
        return;
      }
      if (edit?.logId) {
        await updateGroupLog({
          groupId,
          logId: edit.logId,
          date,
          payload: { calories: value, meal, note: note.trim() || null },
        });
      } else {
        await addCaloriesLog({ groupId, uid: user.uid, calories: value, meal, note, date });
      }
      navigation.goBack();
    } catch (e) {
      setError(edit?.logId ? 'Failed to update calories.' : 'Failed to save calories.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
    >
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
            contentContainerStyle={[styles.content, { paddingBottom: spacing.base + insets.bottom }]}
          >
            <Card>
              <AppText variant="rowTitle" color="primary">{edit?.logId ? 'Edit calories' : 'Log calories'}</AppText>
              <AppText variant="rowSubtitle" color="muted" style={styles.subtitle}>Add entries anytime during the day</AppText>

              <AppText variant="eyebrow" color="muted" style={styles.fieldLabel}>Log date</AppText>
              <TextField
                value={logDate}
                onChangeText={setLogDate}
                editable={!isSubmitting}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={todayYYYYMMDD()}
              />
              <View style={styles.dateChips}>
                <TouchableOpacity
                  style={styles.dateChip}
                  disabled={isSubmitting}
                  onPress={() => setLogDate(todayYYYYMMDD())}
                  activeOpacity={0.8}
                >
                  <AppText variant="rowSubtitle" color="secondary">Today</AppText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dateChip}
                  disabled={isSubmitting}
                  onPress={() => setLogDate(yesterdayYYYYMMDD())}
                  activeOpacity={0.8}
                >
                  <AppText variant="rowSubtitle" color="secondary">Yesterday</AppText>
                </TouchableOpacity>
              </View>

              <AppText variant="eyebrow" color="muted" style={styles.fieldLabel}>Calories</AppText>
              <TextField
                keyboardType="number-pad"
                value={calories}
                onChangeText={setCalories}
                editable={!isSubmitting}
              />

              <AppText variant="eyebrow" color="muted" style={styles.fieldLabel}>Meal</AppText>
              <View style={styles.chipRow}>
                {MEALS.map((m) => {
                  const active = m.value === meal;
                  return (
                    <Pressable
                      key={m.value}
                      onPress={() => setMeal(m.value)}
                      disabled={isSubmitting}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
                    >
                      <AppText variant="rowSubtitle" style={{ color: active ? colors.primaryOnDark : colors.textSecondary, fontWeight: '600' }}>
                        {m.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              <AppText variant="eyebrow" color="muted" style={styles.fieldLabel}>Note (optional)</AppText>
              <TextField value={note} onChangeText={setNote} editable={!isSubmitting} multiline />

              {error ? (
                <AppText variant="rowSubtitle" color="danger" style={styles.error}>{error}</AppText>
              ) : null}

              <PrimaryButton onPress={onSubmit} loading={isSubmitting} disabled={isSubmitting} style={styles.submit}>
                {edit?.logId ? 'Update' : 'Save'}
              </PrimaryButton>
            </Card>
          </ScrollView>
        </TouchableWithoutFeedback>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.base, justifyContent: 'center' },
  subtitle: { marginTop: spacing.xs },
  fieldLabel: { marginTop: spacing.base, marginBottom: spacing.sm },
  dateChips: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  dateChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderCard,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    height: 40,
    paddingHorizontal: spacing.base,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  chipActive: { backgroundColor: colors.primaryTint, borderColor: 'rgba(62,139,255,0.5)' },
  chipIdle: { backgroundColor: colors.surface2, borderColor: 'transparent' },
  error: { marginTop: spacing.md },
  submit: { marginTop: spacing.lg },
});
