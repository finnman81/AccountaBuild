import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { addCaloriesLog } from '../services/logs';

type Props = NativeStackScreenProps<RootStackParamList, 'AddCalories'>;

export default function AddCaloriesScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;
  const [calories, setCalories] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const value = Number(calories);
      if (!Number.isFinite(value) || value <= 0) {
        setError('Enter a valid calorie number.');
        return;
      }
      await addCaloriesLog({ groupId, uid: user.uid, calories: value, note });
      navigation.goBack();
    } catch (e) {
      setError('Failed to save calories.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Card>
          <Card.Title title="Log calories" subtitle="Add entries anytime during the day" />
          <Card.Content>
            <TextInput
              label="Calories"
              keyboardType="number-pad"
              value={calories}
              onChangeText={setCalories}
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


