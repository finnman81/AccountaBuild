import React, { useContext, useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { Icon, Modal, Portal } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { clearBadge } from '../services/notifications';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { addWorkoutLog, WorkoutType } from '../services/logs';
import { db } from '../firebase/firebase';
import { isFutureYYYYMMDD, isValidYYYYMMDD, todayYYYYMMDD, yesterdayYYYYMMDD } from '../utils/dates';
import { updateGroupLog, upsertUserWorkoutHistoryFromGroupLog } from '../services/logEdits';
import AppText from '../components/ui/AppText';
import Card from '../components/ui/Card';
import TextField from '../components/ui/TextField';
import PrimaryButton from '../components/ui/PrimaryButton';
import { colors, radius, spacing } from '../theme';

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
  { label: 'Stretching', value: 'stretching' },
  { label: 'Meditation', value: 'meditation' },
  { label: 'Pilates', value: 'pilates' },
  { label: 'Tai Chi', value: 'taiChi' },
  { label: 'Walking', value: 'walking' },
];

export default function AddWorkoutScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId, edit } = route.params;
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [logDate, setLogDate] = useState(todayYYYYMMDD());
  const [workoutType, setWorkoutType] = useState<WorkoutType>('weightLifting');
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!edit) return;
    setLogDate(edit.date);
    setWorkoutType(edit.workoutType);
    setDurationMinutes(String(edit.durationMinutes));
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
      const minutes = Number(durationMinutes);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        setError('Duration is required (minutes).');
        return;
      }
      if (edit?.logId) {
        await updateGroupLog({
          groupId,
          logId: edit.logId,
          date,
          payload: { workoutType, durationMinutes: minutes, note: note.trim() || null },
        });
        await upsertUserWorkoutHistoryFromGroupLog({
          uid: user.uid,
          groupId,
          groupLogId: edit.logId,
          date,
          workoutType,
          durationMinutes: minutes,
        });
      } else {
        const res = await addWorkoutLog({ groupId, uid: user.uid, workoutType, durationMinutes: minutes, note, date });
        // Persist user-level workout history for profile charts (cross-group).
        await addDoc(collection(db, 'users', user.uid, 'workouts'), {
          uid: user.uid,
          groupId,
          groupLogId: res.id,
          date,
          workoutType,
          durationMinutes: minutes,
          ts: serverTimestamp(),
          source: 'self_reported',
        });
      }
      // Clear notification badge since user logged a workout
      await clearBadge();
      navigation.goBack();
    } catch (e) {
      setError(edit?.logId ? 'Failed to update workout.' : 'Failed to save workout.');
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
      <Portal>
        <Modal
          visible={typePickerVisible}
          onDismiss={() => setTypePickerVisible(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Card style={styles.modalCard}>
            <AppText variant="rowTitle" color="primary" style={styles.modalTitle}>Workout type</AppText>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator>
              {workoutTypes.map((w) => {
                const active = w.value === workoutType;
                return (
                  <TouchableOpacity
                    key={w.value}
                    style={styles.modalRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      setWorkoutType(w.value);
                      setTypePickerVisible(false);
                    }}
                  >
                    <AppText variant="body" color={active ? 'accent' : 'primary'} style={styles.modalRowLabel}>{w.label}</AppText>
                    {active ? <Icon source="check" size={20} color={colors.primaryOnDark} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity onPress={() => setTypePickerVisible(false)} style={styles.modalClose} activeOpacity={0.7}>
              <AppText variant="rowTitle" color="accent">Close</AppText>
            </TouchableOpacity>
          </Card>
        </Modal>
      </Portal>

      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
            contentContainerStyle={[styles.content, { paddingBottom: spacing.base + insets.bottom }]}
          >
            <Card>
              <AppText variant="rowTitle" color="primary">{edit?.logId ? 'Edit workout' : 'Log workout'}</AppText>

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

              <AppText variant="eyebrow" color="muted" style={styles.fieldLabel}>Workout type</AppText>
              <TouchableOpacity
                style={styles.selectField}
                disabled={isSubmitting}
                onPress={() => setTypePickerVisible(true)}
                activeOpacity={0.8}
              >
                <AppText variant="body" color="primary">{workoutTypes.find((w) => w.value === workoutType)?.label ?? 'Select'}</AppText>
                <Icon source="chevron-down" size={20} color={colors.textSecondary} />
              </TouchableOpacity>

              <AppText variant="eyebrow" color="muted" style={styles.fieldLabel}>Duration (minutes)</AppText>
              <TextField
                keyboardType="number-pad"
                value={durationMinutes}
                onChangeText={setDurationMinutes}
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
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.borderCard,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.base,
  },
  error: { marginTop: spacing.md },
  submit: { marginTop: spacing.lg },
  modalContainer: { marginHorizontal: spacing.base },
  modalCard: { maxHeight: '70%', padding: spacing.base },
  modalTitle: { marginBottom: spacing.sm },
  modalScroll: { maxHeight: 380 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  modalRowLabel: { flex: 1 },
  modalClose: { alignItems: 'flex-end', paddingTop: spacing.md, paddingRight: spacing.xs },
});
