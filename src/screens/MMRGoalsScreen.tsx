import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, View } from 'react-native';
import { Button, Card, SegmentedButtons, Switch, Text, TextInput } from 'react-native-paper';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Screen from '../components/layout/Screen';
import { AuthContext } from '../store/AuthContext';
import { subscribeMyMmrGoals, upsertGoal } from '../services/mmrGoals';
import { subscribeMyProfile, updateMyProfile } from '../services/profile';
import { isValidYYYYMMDD } from '../utils/dates';

function toNumberOrNull(t: string) {
  const s = t.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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
      <Screen>
        <Text>You must be signed in.</Text>
      </Screen>
    );
  }

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
          }}
        >
          <Card>
            <Card.Title title="Goals (global)" subtitle="Used for weekly scoring + group dashboards" />
            <Card.Content>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text variant="bodyMedium" style={{ flex: 1 }}>Track Workouts</Text>
                <Switch value={workoutsEnabled} onValueChange={setWorkoutsEnabled} disabled={!canSave} />
              </View>
              {workoutsEnabled && (
                <>
                  <TextInput
                    label="Workouts per week (1–7)"
                    keyboardType="number-pad"
                    value={workoutsPerWeek}
                    onChangeText={setWorkoutsPerWeek}
                    disabled={!canSave}
                  />
                  <View style={{ height: 12 }} />
                </>
              )}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text variant="bodyMedium" style={{ flex: 1 }}>Track Minutes</Text>
                <Switch value={minutesEnabled} onValueChange={setMinutesEnabled} disabled={!canSave} />
              </View>
              {minutesEnabled && (
                <>
                  <TextInput
                    label="Minutes per week"
                    keyboardType="number-pad"
                    value={minutesPerWeek}
                    onChangeText={setMinutesPerWeek}
                    disabled={!canSave}
                  />
                  <View style={{ height: 12 }} />
                </>
              )}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text variant="bodyMedium" style={{ flex: 1 }}>Track Calories</Text>
                <Switch value={caloriesEnabled} onValueChange={setCaloriesEnabled} disabled={!canSave} />
              </View>
              {caloriesEnabled && (
                <>
                  <TextInput
                    label="Calorie adherence days per week (1–7)"
                    keyboardType="number-pad"
                    value={calorieDaysPerWeek}
                    onChangeText={setCalorieDaysPerWeek}
                    disabled={!canSave}
                  />
                  <View style={{ height: 12 }} />
                  <TextInput
                    label="Daily calorie goal (0–20000)"
                    keyboardType="number-pad"
                    value={dailyCalorieGoal}
                    onChangeText={setDailyCalorieGoal}
                    disabled={!canSave}
                  />
                  <View style={{ height: 12 }} />
                </>
              )}

              <TextInput
                label="Weight log days per week (0–7)"
                keyboardType="number-pad"
                value={logWeightDaysPerWeek}
                onChangeText={setLogWeightDaysPerWeek}
                disabled={!canSave}
              />
            </Card.Content>
          </Card>

          <View style={{ height: 16 }} />

          <Card>
            <Card.Title title="Weight timeline goal (optional)" subtitle="Enables weight loss/gain scoring" />
            <Card.Content>
              <SegmentedButtons
                value={weightMode}
                onValueChange={(v) => setWeightMode(v as any)}
                buttons={[
                  { value: 'loss', label: 'Loss' },
                  { value: 'gain', label: 'Gain' },
                ]}
              />
              <View style={{ height: 12 }} />
              <TextInput
                label="Start weight (lb)"
                keyboardType="decimal-pad"
                value={weightStart}
                onChangeText={setWeightStart}
                disabled={!canSave}
              />
              <View style={{ height: 12 }} />
              <TextInput
                label="Goal weight (lb)"
                keyboardType="decimal-pad"
                value={weightGoal}
                onChangeText={setWeightGoal}
                disabled={!canSave}
              />
              <View style={{ height: 12 }} />
              <TextInput
                label="Start date (YYYY-MM-DD)"
                value={weightStartDate}
                onChangeText={setWeightStartDate}
                disabled={!canSave}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={{ height: 12 }} />
              <TextInput
                label="Target end date (YYYY-MM-DD)"
                value={weightTargetEndDate}
                onChangeText={setWeightTargetEndDate}
                disabled={!canSave}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {error ? (
                <>
                  <View style={{ height: 12 }} />
                  <Text style={{ color: 'crimson' }}>{error}</Text>
                </>
              ) : null}
              {saved ? (
                <>
                  <View style={{ height: 12 }} />
                  <Text style={{ color: 'green' }}>{saved}</Text>
                </>
              ) : null}

              <View style={{ height: 16 }} />
              <Button mode="contained" onPress={save} disabled={!canSave} loading={saving}>
                Save goals
              </Button>
            </Card.Content>
          </Card>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

