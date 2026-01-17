import React, { useContext, useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, View } from 'react-native';
import { Button, Card, Menu, Text, TextInput } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { addCaloriesLog, MealType } from '../services/logs';
import LogDateField from '../components/ui/LogDateField';
import { isFutureYYYYMMDD, isValidYYYYMMDD, todayYYYYMMDD } from '../utils/dates';
import { updateGroupLog } from '../services/logEdits';

type Props = NativeStackScreenProps<RootStackParamList, 'AddCalories'>;

export default function AddCaloriesScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId, edit } = route.params;
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [logDate, setLogDate] = useState(todayYYYYMMDD());
  const [calories, setCalories] = useState('');
  const [meal, setMeal] = useState<MealType>('all');
  const [mealMenuVisible, setMealMenuVisible] = useState(false);
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

  const mealLabel = (m: MealType) => {
    switch (m) {
      case 'breakfast':
        return 'Breakfast';
      case 'lunch':
        return 'Lunch';
      case 'dinner':
        return 'Dinner';
      case 'snack':
        return 'Snack';
      case 'all':
      default:
        return 'All';
    }
  };

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
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
          contentContainerStyle={{
            flexGrow: 1,
            padding: 16,
            paddingBottom: 16 + insets.bottom,
            justifyContent: 'center',
          }}
        >
          <Card>
            <Card.Title title={edit?.logId ? 'Edit calories' : 'Log calories'} subtitle="Add entries anytime during the day" />
            <Card.Content>
              <LogDateField value={logDate} onChange={setLogDate} disabled={isSubmitting} />
              <View style={{ height: 12 }} />
              <TextInput
                label="Calories"
                keyboardType="number-pad"
                value={calories}
                onChangeText={setCalories}
                disabled={isSubmitting}
              />
              <View style={{ height: 12 }} />
              <Text variant="labelMedium">Meal</Text>
              <View style={{ height: 8 }} />
              <Menu
                visible={mealMenuVisible}
                onDismiss={() => setMealMenuVisible(false)}
                anchor={
                  <Button
                    mode="outlined"
                    disabled={isSubmitting}
                    onPress={() => setMealMenuVisible(true)}
                    contentStyle={{ justifyContent: 'space-between' }}
                    icon="chevron-down"
                  >
                    {mealLabel(meal)}
                  </Button>
                }
              >
                {(['breakfast', 'lunch', 'dinner', 'snack', 'all'] as MealType[]).map((m) => (
                  <Menu.Item
                    key={m}
                    title={mealLabel(m)}
                    onPress={() => {
                      setMeal(m);
                      setMealMenuVisible(false);
                    }}
                  />
                ))}
              </Menu>
              <View style={{ height: 12 }} />
              <TextInput label="Note (optional)" value={note} onChangeText={setNote} disabled={isSubmitting} multiline />
              {error ? (
                <>
                  <View style={{ height: 12 }} />
                  <Text style={{ color: 'crimson' }}>{error}</Text>
                </>
              ) : null}
              <View style={{ height: 16 }} />
              <Button mode="contained" onPress={onSubmit} loading={isSubmitting} disabled={isSubmitting}>
                {edit?.logId ? 'Update' : 'Save'}
              </Button>
            </Card.Content>
          </Card>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}


