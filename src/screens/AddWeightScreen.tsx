import React, { useContext, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { addWeightLog } from '../services/logs';
import { syncMyMemberProfileToAllGroups, updateMyProfile } from '../services/profile';
import { db } from '../firebase/firebase';
import LogDateField from '../components/ui/LogDateField';
import { isFutureYYYYMMDD, isValidYYYYMMDD, todayYYYYMMDD } from '../utils/dates';
import { updateGroupLog, upsertUserWeightHistoryFromGroupLog } from '../services/logEdits';

type Props = NativeStackScreenProps<RootStackParamList, 'AddWeight'>;

export default function AddWeightScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId, edit } = route.params;
  const [logDate, setLogDate] = useState(todayYYYYMMDD());
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!edit) return;
    setLogDate(edit.date);
    setWeight(String(edit.weight));
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
      const value = Number(weight);
      if (!Number.isFinite(value) || value <= 0) {
        setError('Enter a valid weight.');
        return;
      }
      if (edit?.logId) {
        await updateGroupLog({
          groupId,
          logId: edit.logId,
          date,
          payload: { weight: value, note: note.trim() || null },
        });
        await upsertUserWeightHistoryFromGroupLog({
          uid: user.uid,
          groupId,
          groupLogId: edit.logId,
          date,
          weight: value,
        });
      } else {
        const res = await addWeightLog({ groupId, uid: user.uid, weight: value, note, date });
        // Persist user-level weight history for profile charts (cross-group).
        await addDoc(collection(db, 'users', user.uid, 'weights'), {
          uid: user.uid,
          groupId,
          groupLogId: res.id,
          date,
          weight: value,
          ts: serverTimestamp(),
        });
      }
      // Keep weight consistent across groups and profile:
      await updateMyProfile({ uid: user.uid, weightCurrent: value });
      await syncMyMemberProfileToAllGroups(user.uid);
      navigation.goBack();
    } catch (e) {
      setError(edit?.logId ? 'Failed to update weight.' : 'Failed to save weight.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Card>
          <Card.Title title={edit?.logId ? 'Edit weight' : 'Log weight'} subtitle="Quick daily weigh-in" />
          <Card.Content>
            <LogDateField value={logDate} onChange={setLogDate} disabled={isSubmitting} />
            <View style={{ height: 12 }} />
            <TextInput
              label="Weight (lb)"
              keyboardType="decimal-pad"
              value={weight}
              onChangeText={setWeight}
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
              {edit?.logId ? 'Update' : 'Save'}
            </Button>
          </Card.Content>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}


