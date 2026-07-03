import React, { useContext, useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { addWeightLog } from '../services/logs';
import { syncMyMemberProfileToAllGroups, updateMyProfile } from '../services/profile';
import { db } from '../firebase/firebase';
import { isFutureYYYYMMDD, isValidYYYYMMDD, todayYYYYMMDD, yesterdayYYYYMMDD } from '../utils/dates';
import { updateGroupLog, upsertUserWeightHistoryFromGroupLog } from '../services/logEdits';
import AppText from '../components/ui/AppText';
import Card from '../components/ui/Card';
import TextField from '../components/ui/TextField';
import PrimaryButton from '../components/ui/PrimaryButton';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddWeight'>;

export default function AddWeightScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId, edit } = route.params;
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
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
          source: 'self_reported',
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
              <AppText variant="rowTitle" color="primary">{edit?.logId ? 'Edit weight' : 'Log weight'}</AppText>
              <AppText variant="rowSubtitle" color="muted" style={styles.subtitle}>Quick daily weigh-in</AppText>

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

              <AppText variant="eyebrow" color="muted" style={styles.fieldLabel}>Weight (lb)</AppText>
              <TextField
                keyboardType="decimal-pad"
                value={weight}
                onChangeText={setWeight}
                editable={!isSubmitting}
              />

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
  error: { marginTop: spacing.md },
  submit: { marginTop: spacing.lg },
});
