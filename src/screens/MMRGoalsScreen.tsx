import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, TouchableWithoutFeedback, View } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthContext } from '../store/AuthContext';
import { subscribeMyMmrGoals, upsertGoal } from '../services/mmrGoals';
import { subscribeMyProfile, updateMyProfile } from '../services/profile';
import { isValidYYYYMMDD } from '../utils/dates';
import AppText from '../components/ui/AppText';
import Card from '../components/ui/Card';
import TextField from '../components/ui/TextField';
import PrimaryButton from '../components/ui/PrimaryButton';
import SegmentedControl from '../components/ui/SegmentedControl';
import { colors, spacing } from '../theme';

function toNumberOrNull(t: string) {
  const s = t.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function ToggleRow({ title, value, onValueChange, disabled }: { title: string; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.toggleRow}>
      <AppText variant="rowTitle" color="primary" style={styles.flex}>{title}</AppText>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.ringNotLogged, true: colors.primary }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={colors.ringNotLogged}
      />
    </View>
  );
}

export default function MMRGoalsScreen() {
  const { user } = useContext(AuthContext);
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const [raw, setRaw] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // v1 inputs
  const [workoutsPerWeek, setWorkoutsPerWeek] = useState('3');
  const [minutesPerWeek, setMinutesPerWeek] = useState('150');
  const [calorieDaysPerWeek, setCalorieDaysPerWeek] = useState('5');
  const [dailyCalorieGoal, setDailyCalorieGoal] = useState('2500');
  const [logWeightDaysPerWeek, setLogWeightDaysPerWeek] = useState('5');

  // Goal enable/disable toggles
  const [workoutsEnabled, setWorkoutsEnabled] = useState(true);
  const [minutesEnabled, setMinutesEnabled] = useState(true);
  const [caloriesEnabled, setCaloriesEnabled] = useState(true);

  const [weightMode, setWeightMode] = useState<'loss' | 'gain'>('loss');
  const [weightStart, setWeightStart] = useState('');
  const [weightGoal, setWeightGoal] = useState('');
  const [weightStartDate, setWeightStartDate] = useState('');
  const [weightTargetEndDate, setWeightTargetEndDate] = useState('');

  useEffect(() => {
    if (!user) return;
    return subscribeMyMmrGoals(user.uid, setRaw);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeMyProfile(
      user.uid,
      (p) => {
        if (!p) return;
        if (typeof p.dailyCalorieGoal === 'number') setDailyCalorieGoal(String(p.dailyCalorieGoal));
        if (typeof p.logWeightDaysPerWeek === 'number') setLogWeightDaysPerWeek(String(p.logWeightDaysPerWeek));
      },
      undefined,
    );
  }, [user]);

  useEffect(() => {
    // Hydrate from Firestore if present.
    const w = raw.workouts;
    if (w?.targetWorkoutsPerWeek != null) setWorkoutsPerWeek(String(w.targetWorkoutsPerWeek));
    setWorkoutsEnabled((w?.status ?? 'active') === 'active');

    const m = raw.minutes;
    if (m?.targetMinutesPerWeek != null) setMinutesPerWeek(String(m.targetMinutesPerWeek));
    setMinutesEnabled((m?.status ?? 'active') === 'active');

    const c = raw.calorieDays;
    if (c?.targetDaysPerWeek != null) setCalorieDaysPerWeek(String(c.targetDaysPerWeek));
    setCaloriesEnabled((c?.status ?? 'active') === 'active');

    const wl = raw.weightLoss;
    const wg = raw.weightGain;
    const activeWeight = (wl?.status === 'active' ? wl : wg?.status === 'active' ? wg : wl ?? wg) ?? null;
    if (activeWeight) {
      setWeightMode(activeWeight.type === 'weightGain' ? 'gain' : 'loss');
      if (activeWeight.startWeight != null) setWeightStart(String(activeWeight.startWeight));
      if (activeWeight.goalWeight != null) setWeightGoal(String(activeWeight.goalWeight));
      if (activeWeight.startDate) setWeightStartDate(String(activeWeight.startDate));
      if (activeWeight.targetEndDate) setWeightTargetEndDate(String(activeWeight.targetEndDate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw.workouts, raw.minutes, raw.calorieDays, raw.weightLoss, raw.weightGain]);

  const canSave = useMemo(() => Boolean(user?.uid) && !saving, [saving, user?.uid]);

  const save = async () => {
    if (!user) return;
    setError(null);
    setSaved(null);
    setSaving(true);
    try {
      // Validate enabled goals
      if (workoutsEnabled) {
        const w = toNumberOrNull(workoutsPerWeek);
        if (w == null || w <= 0 || w > 7) throw new Error('Workouts/week must be 1–7.');
      }
      if (minutesEnabled) {
        const m = toNumberOrNull(minutesPerWeek);
        if (m == null || m <= 0) throw new Error('Minutes/week must be a positive number.');
      }
      if (caloriesEnabled) {
        const c = toNumberOrNull(calorieDaysPerWeek);
        if (c == null || c <= 0 || c > 7) throw new Error('Calorie days/week must be 1–7.');
        const dcg = toNumberOrNull(dailyCalorieGoal);
        if (dcg == null || dcg < 0 || dcg > 20000) throw new Error('Daily calorie goal must be between 0 and 20000.');
      }
      const wDays = toNumberOrNull(logWeightDaysPerWeek);
      if (wDays == null || wDays < 0 || wDays > 7) throw new Error('Weight log days/week must be 0–7.');

      // Ensure at least one goal is enabled
      if (!workoutsEnabled && !minutesEnabled && !caloriesEnabled) {
        throw new Error('At least one goal (workouts, minutes, or calories) must be enabled.');
      }

      // Save workouts goal
      if (workoutsEnabled) {
        const w = toNumberOrNull(workoutsPerWeek);
        await upsertGoal(user.uid, 'workouts', {
          type: 'workouts',
          status: 'active',
          targetWorkoutsPerWeek: Math.round(w!)
        });
      } else {
        await upsertGoal(user.uid, 'workouts', { type: 'workouts', status: 'paused' });
      }

      // Save minutes goal
      if (minutesEnabled) {
        const m = toNumberOrNull(minutesPerWeek);
        await upsertGoal(user.uid, 'minutes', {
          type: 'minutes',
          status: 'active',
          targetMinutesPerWeek: Math.round(m!)
        });
      } else {
        await upsertGoal(user.uid, 'minutes', { type: 'minutes', status: 'paused' });
      }

      // Save calorie days goal
      if (caloriesEnabled) {
        const c = toNumberOrNull(calorieDaysPerWeek);
        await upsertGoal(user.uid, 'calorieDays', {
          type: 'calorieDays',
          status: 'active',
          targetDaysPerWeek: Math.round(c!)
        });
      } else {
        await upsertGoal(user.uid, 'calorieDays', { type: 'calorieDays', status: 'paused' });
      }

      // Mirror key goal inputs into the user profile so they persist across groups
      // and can be surfaced in group dashboards/charts via `publicUsers/{uid}`.
      const dcg = toNumberOrNull(dailyCalorieGoal);
      const w = toNumberOrNull(workoutsPerWeek);
      const c = toNumberOrNull(calorieDaysPerWeek);
      await updateMyProfile({
        uid: user.uid,
        dailyCalorieGoal: caloriesEnabled && dcg != null ? Math.round(dcg) : null,
        workoutsPerWeek: workoutsEnabled && w != null ? Math.round(w) : null,
        logCaloriesDaysPerWeek: caloriesEnabled && c != null ? Math.round(c) : null,
        logWeightDaysPerWeek: Math.round(wDays!),
      });

      // Weight goal is optional, but if any field is provided we require all.
      const ws = toNumberOrNull(weightStart);
      const wg = toNumberOrNull(weightGoal);
      const sd = weightStartDate.trim();
      const ed = weightTargetEndDate.trim();
      const anyWeight =
        ws != null || wg != null || Boolean(sd) || Boolean(ed);

      if (anyWeight) {
        if (ws == null || ws <= 0) throw new Error('Weight start must be a positive number.');
        if (wg == null || wg <= 0) throw new Error('Weight goal must be a positive number.');
        if (!isValidYYYYMMDD(sd)) throw new Error('Weight start date must be YYYY-MM-DD.');
        if (!isValidYYYYMMDD(ed)) throw new Error('Weight target end date must be YYYY-MM-DD.');
        if (weightMode === 'loss' && wg >= ws) throw new Error('For weight loss, goal must be less than start.');
        if (weightMode === 'gain' && wg <= ws) throw new Error('For weight gain, goal must be greater than start.');

        const activeId = weightMode === 'loss' ? 'weightLoss' : 'weightGain';
        const inactiveId = weightMode === 'loss' ? 'weightGain' : 'weightLoss';
        await upsertGoal(user.uid, activeId, {
          type: activeId,
          status: 'active',
          startWeight: ws,
          goalWeight: wg,
          startDate: sd,
          targetEndDate: ed,
        });
        await upsertGoal(user.uid, inactiveId, { type: inactiveId, status: 'paused' });
      }

      setSaved('Saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <AppText variant="body" color="primary">You must be signed in.</AppText>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: spacing.lg + insets.bottom },
            ]}
          >
            <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Goals (global)</AppText>
            <Card>
              <AppText variant="rowSubtitle" color="muted" style={styles.cardSubtitle}>
                Used for weekly scoring + group dashboards
              </AppText>

              <ToggleRow title="Track Workouts" value={workoutsEnabled} onValueChange={setWorkoutsEnabled} disabled={!canSave} />
              {workoutsEnabled && (
                <View style={styles.field}>
                  <TextField
                    label="Workouts per week (1–7)"
                    keyboardType="number-pad"
                    value={workoutsPerWeek}
                    onChangeText={setWorkoutsPerWeek}
                    editable={canSave}
                  />
                </View>
              )}

              <ToggleRow title="Track Minutes" value={minutesEnabled} onValueChange={setMinutesEnabled} disabled={!canSave} />
              {minutesEnabled && (
                <View style={styles.field}>
                  <TextField
                    label="Minutes per week"
                    keyboardType="number-pad"
                    value={minutesPerWeek}
                    onChangeText={setMinutesPerWeek}
                    editable={canSave}
                  />
                </View>
              )}

              <ToggleRow title="Track Calories" value={caloriesEnabled} onValueChange={setCaloriesEnabled} disabled={!canSave} />
              {caloriesEnabled && (
                <>
                  <View style={styles.field}>
                    <TextField
                      label="Calorie adherence days per week (1–7)"
                      keyboardType="number-pad"
                      value={calorieDaysPerWeek}
                      onChangeText={setCalorieDaysPerWeek}
                      editable={canSave}
                    />
                  </View>
                  <View style={styles.field}>
                    <TextField
                      label="Daily calorie goal (0–20000)"
                      keyboardType="number-pad"
                      value={dailyCalorieGoal}
                      onChangeText={setDailyCalorieGoal}
                      editable={canSave}
                    />
                  </View>
                </>
              )}

              <View style={styles.field}>
                <TextField
                  label="Weight log days per week (0–7)"
                  keyboardType="number-pad"
                  value={logWeightDaysPerWeek}
                  onChangeText={setLogWeightDaysPerWeek}
                  editable={canSave}
                />
              </View>
            </Card>

            <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Weight timeline goal (optional)</AppText>
            <Card>
              <AppText variant="rowSubtitle" color="muted" style={styles.cardSubtitle}>
                Enables weight loss/gain scoring
              </AppText>

              <SegmentedControl
                value={weightMode}
                onChange={(v) => setWeightMode(v as any)}
                options={[
                  { value: 'loss', label: 'Loss' },
                  { value: 'gain', label: 'Gain' },
                ]}
              />
              <View style={styles.field}>
                <TextField
                  label="Start weight (lb)"
                  keyboardType="decimal-pad"
                  value={weightStart}
                  onChangeText={setWeightStart}
                  editable={canSave}
                />
              </View>
              <View style={styles.field}>
                <TextField
                  label="Goal weight (lb)"
                  keyboardType="decimal-pad"
                  value={weightGoal}
                  onChangeText={setWeightGoal}
                  editable={canSave}
                />
              </View>
              <View style={styles.field}>
                <TextField
                  label="Start date (YYYY-MM-DD)"
                  value={weightStartDate}
                  onChangeText={setWeightStartDate}
                  editable={canSave}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.field}>
                <TextField
                  label="Target end date (YYYY-MM-DD)"
                  value={weightTargetEndDate}
                  onChangeText={setWeightTargetEndDate}
                  editable={canSave}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {error ? (
                <AppText variant="rowSubtitle" color="danger" style={styles.field}>{error}</AppText>
              ) : null}
              {saved ? (
                <AppText variant="rowSubtitle" color="success" style={styles.field}>{saved}</AppText>
              ) : null}

              <View style={styles.field}>
                <PrimaryButton onPress={save} disabled={!canSave} loading={saving}>
                  Save goals
                </PrimaryButton>
              </View>
            </Card>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, marginLeft: spacing.xs },
  cardSubtitle: { marginBottom: spacing.base },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  field: { marginTop: spacing.md },
});
