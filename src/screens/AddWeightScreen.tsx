import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { addWeightLog } from '../services/logs';
import { syncMyMemberProfileToAllGroups, updateMyProfile } from '../services/profile';
import { db } from '../firebase/firebase';

type Props = NativeStackScreenProps<RootStackParamList, 'AddWeight'>;

export default function AddWeightScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const value = Number(weight);
      if (!Number.isFinite(value) || value <= 0) {
        setError('Enter a valid weight.');
        return;
      }
      await addWeightLog({ groupId, uid: user.uid, weight: value, note });
      // Keep weight consistent across groups and profile:
      await updateMyProfile({ uid: user.uid, weightCurrent: value });
      await syncMyMemberProfileToAllGroups(user.uid);
      // Persist user-level weight history for profile charts (cross-group).
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const date = `${yyyy}-${mm}-${dd}`;
      await addDoc(collection(db, 'users', user.uid, 'weights'), {
        uid: user.uid,
        date,
        weight: value,
        ts: serverTimestamp(),
      });
      navigation.goBack();
    } catch (e) {
      setError('Failed to save weight.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Card>
          <Card.Title title="Log weight" subtitle="Quick daily weigh-in" />
          <Card.Content>
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
              Save
            </Button>
          </Card.Content>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}


