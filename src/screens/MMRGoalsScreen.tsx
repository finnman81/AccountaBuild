import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { AuthContext } from '../store/AuthContext';
import { db } from '../firebase/firebase';
import { subscribeMyMmrGoals, upsertGoal } from '../services/mmrGoals';
import { subscribeMyProfile, updateMyProfile } from '../services/profile';
import { formatYYYYMMDDLocal, isValidYYYYMMDD, todayYYYYMMDD } from '../utils/dates';
import { DEFAULT_TZ, isoWeekIdInTz, nextIsoWeekId } from '../mmr/time';
import AppText from '../components/ui/AppText';
import EditRow from '../components/ui/EditRow';
import TextField from '../components/ui/TextField';
import PrimaryButton from '../components/ui/PrimaryButton';
import SegmentedControl from '../components/ui/SegmentedControl';
import { colors, radius, spacing } from '../theme';

function toNumberOrNull(t: string) {
  const s = t.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Defaults seeded from the user's training intent (users/{uid}.goalMode). */
const RESTART_DEFAULTS: Record<string, { dailyCalorieGoal: number; workoutsPerWeek: number }> = {
  cut: { dailyCalorieGoal: 1800, workoutsPerWeek: 4 },
  bulk: { dailyCalorieGoal: 2800, workoutsPerWeek: 5 },
  maintenance: { dailyCalorieGoal: 2200, workoutsPerWeek: 4 },
};

/** Section header with an on/off toggle for a whole scoring category. */
function CategoryHeader({ title, subtitle, value, onValueChange, disabled }: { title: string; subtitle?: string; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.catHeader}>
      <View style={{ flex: 1, paddingRight: spacing.sm }}>
        <AppText variant="rowTitle" color="primary">{title}</AppText>
        {subtitle ? <AppText variant="rowSubtitle" color="muted" style={{ marginTop: 2 }}>{subtitle}</AppText> : null}
      </View>
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

/**
 * The single smart Goals page. Every goal the app tracks — weekly targets,
 * calorie goal, and the weight timeline — is configured here (Edit Profile is
 * identity-only). Each of the three core categories (Workouts, Calories, Weight)
 * can be toggled on/off: opting a category out means you're never penalized for
 * it, but you level up slower (tracking all three is fastest — see breadthFactor
 * in mmr/scoring.ts). Changes stamp `goalsEffectiveWeekId` so this week's rank
 * stays fair.
 */
export default function MMRGoalsScreen() {
  const { user } = useContext(AuthContext);
  const insets = useSafeAreaInsets();

  const [raw, setRaw] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Category toggles.
  const [workoutsEnabled, setWorkoutsEnabled] = useState(true);
  const [caloriesEnabled, setCaloriesEnabled] = useState(true);
  const [weightEnabled, setWeightEnabled] = useState(false);

  // Weekly targets
  const [workoutsPerWeek, setWorkoutsPerWeek] = useState('3');
  const [calorieDaysPerWeek, setCalorieDaysPerWeek] = useState('5');
  const [dailyCalorieGoal, setDailyCalorieGoal] = useState('2500');
  const [logWeightDaysPerWeek, setLogWeightDaysPerWeek] = useState('5');

  // Weight goal
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
        if (typeof p.logWeightDaysPerWeek === 'number' && p.logWeightDaysPerWeek > 0) setLogWeightDaysPerWeek(String(p.logWeightDaysPerWeek));
      },
      undefined,
    );
  }, [user]);

  useEffect(() => {
    // Hydrate values + toggles from Firestore if present.
    const w = raw.workouts;
    if (w?.targetWorkoutsPerWeek != null) setWorkoutsPerWeek(String(w.targetWorkoutsPerWeek));
    if (w?.status) setWorkoutsEnabled(w.status !== 'paused');

    const c = raw.calorieDays;
    if (c?.targetDaysPerWeek != null) setCalorieDaysPerWeek(String(c.targetDaysPerWeek));
    if (c?.status) setCaloriesEnabled(c.status !== 'paused');

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
    if (wl || wg) setWeightEnabled(wl?.status === 'active' || wg?.status === 'active');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw.workouts, raw.calorieDays, raw.weightLoss, raw.weightGain]);

  const canSave = useMemo(() => Boolean(user?.uid) && !saving, [saving, user?.uid]);
  const trackedCount = (workoutsEnabled ? 1 : 0) + (caloriesEnabled ? 1 : 0) + (weightEnabled ? 1 : 0);

  // Quick target-date chips: relative offsets plus end of the current season (quarter).
  const targetDateChips = useMemo(() => {
    const inWeeks = (w: number) => {
      const d = new Date();
      d.setDate(d.getDate() + w * 7);
      return formatYYYYMMDDLocal(d);
    };
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3);
    const seasonEnd = formatYYYYMMDDLocal(new Date(now.getFullYear(), quarter * 3 + 3, 0));
    return [
      { label: '4 weeks', date: inWeeks(4) },
      { label: '8 weeks', date: inWeeks(8) },
      { label: '12 weeks', date: inWeeks(12) },
      { label: 'Season end', date: seasonEnd },
    ];
  }, []);

  const pickTargetDate = (date: string) => {
    setWeightTargetEndDate(date);
    if (!weightStartDate.trim()) setWeightStartDate(todayYYYYMMDD());
  };

  const applyRestartDefaults = async () => {
    let mode = 'maintenance';
    try {
      if (user && db) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const gm = snap.exists() ? (snap.data() as any)?.goalMode : null;
        if (typeof gm === 'string' && RESTART_DEFAULTS[gm]) mode = gm;
      }
    } catch {
      // Fall back to maintenance defaults if the profile read fails.
    }
    const d = RESTART_DEFAULTS[mode]!;
    setWorkoutsEnabled(true);
    setCaloriesEnabled(true);
    setWeightEnabled(false);
    setWorkoutsPerWeek(String(d.workoutsPerWeek));
    setDailyCalorieGoal(String(d.dailyCalorieGoal));
    setCalorieDaysPerWeek('5');
    setLogWeightDaysPerWeek('5');
    setWeightMode('loss');
    setWeightStart('');
    setWeightGoal('');
    setWeightStartDate('');
    setWeightTargetEndDate('');
    setError(null);
    setSaved(null);
  };

  const confirmRestart = () => {
    Alert.alert(
      'Restart goals?',
      'This resets your targets to defaults based on your training intent and clears your weight timeline. Tap "Save goals" to apply.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restart', style: 'destructive', onPress: () => void applyRestartDefaults() },
      ],
    );
  };

  const save = async () => {
    if (!user) return;
    setError(null);
    setSaved(null);
    setSaving(true);
    try {
      if (!workoutsEnabled && !caloriesEnabled && !weightEnabled) {
        throw new Error('Enable at least one category to earn rank.');
      }

      const wNum = toNumberOrNull(workoutsPerWeek);
      const cNum = toNumberOrNull(calorieDaysPerWeek);
      const dcgNum = toNumberOrNull(dailyCalorieGoal);
      const wDaysNum = toNumberOrNull(logWeightDaysPerWeek);

      // Validate only the enabled categories.
      if (workoutsEnabled && (wNum == null || wNum <= 0 || wNum > 7)) throw new Error('Workouts/week must be 1–7.');
      if (caloriesEnabled) {
        if (cNum == null || cNum <= 0 || cNum > 7) throw new Error('Calorie days/week must be 1–7.');
        if (dcgNum == null || dcgNum < 0 || dcgNum > 20000) throw new Error('Daily calorie goal must be between 0 and 20000.');
      }

      const wTarget = Math.round(wNum ?? raw.workouts?.targetWorkoutsPerWeek ?? 3);
      const cTarget = Math.round(cNum ?? raw.calorieDays?.targetDaysPerWeek ?? 5);

      // Workouts category (minutes goal, if present, tracks the workouts toggle).
      await upsertGoal(user.uid, 'workouts', {
        type: 'workouts',
        status: workoutsEnabled ? 'active' : 'paused',
        targetWorkoutsPerWeek: wTarget,
      });
      if (raw.minutes) {
        await upsertGoal(user.uid, 'minutes', { type: 'minutes', status: workoutsEnabled ? 'active' : 'paused' });
      }

      // Calories category.
      await upsertGoal(user.uid, 'calorieDays', {
        type: 'calorieDays',
        status: caloriesEnabled ? 'active' : 'paused',
        targetDaysPerWeek: cTarget,
      });

      // Weight category.
      if (weightEnabled) {
        const ws = toNumberOrNull(weightStart);
        const wg = toNumberOrNull(weightGoal);
        const sd = weightStartDate.trim();
        const ed = weightTargetEndDate.trim();
        if (ws == null || ws <= 0) throw new Error('Weight start must be a positive number.');
        if (wg == null || wg <= 0) throw new Error('Weight goal must be a positive number.');
        if (!isValidYYYYMMDD(sd)) throw new Error('Weight start date must be YYYY-MM-DD.');
        if (!isValidYYYYMMDD(ed)) throw new Error('Weight target end date must be YYYY-MM-DD.');
        if (weightMode === 'loss' && wg >= ws) throw new Error('For weight loss, goal must be less than start.');
        if (weightMode === 'gain' && wg <= ws) throw new Error('For weight gain, goal must be greater than start.');
        if (wDaysNum == null || wDaysNum < 0 || wDaysNum > 7) throw new Error('Weigh-in days/week must be 0–7.');

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
      } else {
        // Pause any existing weight goals so they stop scoring.
        if (raw.weightLoss) await upsertGoal(user.uid, 'weightLoss', { type: 'weightLoss', status: 'paused' });
        if (raw.weightGain) await upsertGoal(user.uid, 'weightGain', { type: 'weightGain', status: 'paused' });
      }

      // Mirror goal inputs into the profile (drives group compliance charts +
      // recommendations). Disabled categories write 0 so the group view matches.
      await updateMyProfile({
        uid: user.uid,
        dailyCalorieGoal: dcgNum != null ? Math.round(dcgNum) : undefined,
        workoutsPerWeek: workoutsEnabled ? wTarget : 0,
        logCaloriesDaysPerWeek: caloriesEnabled ? cTarget : 0,
        logWeightDaysPerWeek: weightEnabled && wDaysNum != null ? Math.round(wDaysNum) : 0,
      });

      // Stamp when goal changes should count for MMR fairness (next ISO week).
      if (db) {
        const nextWeek = nextIsoWeekId(isoWeekIdInTz(new Date(), DEFAULT_TZ), DEFAULT_TZ);
        await setDoc(doc(db, 'users', user.uid), { goalsEffectiveWeekId: nextWeek, updatedAt: serverTimestamp() }, { merge: true });
      }

      setSaved('Saved — changes apply from next week.');
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}
          >
            <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>What you track</AppText>
            <AppText variant="rowSubtitle" color="muted" style={styles.intro}>
              Toggle a category off if you're not tracking it — you won't be penalized for it, but you'll level up
              slower. Tracking all three ranks up fastest. ({trackedCount}/3 on)
            </AppText>

            {/* Workouts */}
            <View style={styles.group}>
              <CategoryHeader
                title="Workouts"
                subtitle="Your weekly workout target"
                value={workoutsEnabled}
                onValueChange={setWorkoutsEnabled}
                disabled={!canSave}
              />
              {workoutsEnabled ? (
                <>
                  <View style={styles.divider} />
                  <View style={styles.rowBlock}>
                    <AppText variant="rowTitle" color="primary">Workouts / week</AppText>
                    <AppText variant="rowSubtitle" color="muted" style={styles.subline}>Miss it and you lose MP</AppText>
                    <View style={styles.workoutChips}>
                      {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                        const active = workoutsPerWeek.trim() === String(n);
                        return (
                          <TouchableOpacity
                            key={n}
                            onPress={() => setWorkoutsPerWeek(String(n))}
                            disabled={!canSave}
                            style={[styles.workoutChip, active && styles.chipActive]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                          >
                            <AppText variant="cardLabel" style={{ color: active ? colors.primaryOnDark : colors.textSecondary }}>{n}</AppText>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </>
              ) : null}
            </View>

            {/* Calories */}
            <View style={[styles.group, styles.groupGap]}>
              <CategoryHeader
                title="Calories"
                subtitle="Daily intake target, scored on logged days"
                value={caloriesEnabled}
                onValueChange={setCaloriesEnabled}
                disabled={!canSave}
              />
              {caloriesEnabled ? (
                <>
                  <View style={styles.divider} />
                  <EditRow
                    label="Daily calories"
                    value={dailyCalorieGoal}
                    onChangeText={setDailyCalorieGoal}
                    subline="Your daily intake target"
                    placeholder="2200"
                    suffix="kcal"
                    keyboardType="number-pad"
                    editable={canSave}
                  />
                  <EditRow
                    label="Calorie days / week"
                    value={calorieDaysPerWeek}
                    onChangeText={setCalorieDaysPerWeek}
                    subline="Days you'll hit your calorie goal (1–7)"
                    placeholder="5"
                    keyboardType="number-pad"
                    editable={canSave}
                    showDivider={false}
                  />
                </>
              ) : null}
            </View>

            {/* Weight */}
            <View style={[styles.group, styles.groupGap]}>
              <CategoryHeader
                title="Weight"
                subtitle="Weight loss / gain timeline scoring"
                value={weightEnabled}
                onValueChange={setWeightEnabled}
                disabled={!canSave}
              />
              {weightEnabled ? (
                <>
                  <View style={styles.divider} />
                  <View style={styles.rowBlock}>
                    <SegmentedControl
                      value={weightMode}
                      onChange={(v) => setWeightMode(v as 'loss' | 'gain')}
                      options={[
                        { value: 'loss', label: 'Loss' },
                        { value: 'gain', label: 'Gain' },
                      ]}
                      style={styles.segmented}
                    />
                  </View>
                  <EditRow label="Start weight" value={weightStart} onChangeText={setWeightStart} subline="Where your timeline starts" placeholder="190" suffix="lb" keyboardType="decimal-pad" editable={canSave} />
                  <EditRow label="Goal weight" value={weightGoal} onChangeText={setWeightGoal} subline="Your target — drives weight progress" placeholder="175" suffix="lb" keyboardType="decimal-pad" editable={canSave} />
                  <EditRow label="Start date" value={weightStartDate} onChangeText={setWeightStartDate} subline="When your timeline began" placeholder="YYYY-MM-DD" editable={canSave} />
                  <View style={styles.rowBlock}>
                    <AppText variant="rowTitle" color="primary">Target end date</AppText>
                    <AppText variant="rowSubtitle" color="muted" style={styles.subline}>When you want to hit your goal weight</AppText>
                    <View style={styles.dateChips}>
                      {targetDateChips.map((chip) => {
                        const active = weightTargetEndDate.trim() === chip.date;
                        return (
                          <TouchableOpacity
                            key={chip.label}
                            onPress={() => pickTargetDate(chip.date)}
                            disabled={!canSave}
                            style={[styles.dateChip, active && styles.chipActive]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                          >
                            <AppText variant="cardLabel" style={{ color: active ? colors.primaryOnDark : colors.textSecondary }}>{chip.label}</AppText>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <TextField value={weightTargetEndDate} onChangeText={setWeightTargetEndDate} placeholder="YYYY-MM-DD" editable={canSave} autoCapitalize="none" autoCorrect={false} containerStyle={styles.dateField} />
                  </View>
                  <EditRow
                    label="Weigh-in days / week"
                    value={logWeightDaysPerWeek}
                    onChangeText={setLogWeightDaysPerWeek}
                    subline="Days you'll log your weight (0–7)"
                    placeholder="5"
                    keyboardType="number-pad"
                    editable={canSave}
                    showDivider={false}
                  />
                </>
              ) : null}
            </View>

            <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Reset &amp; recalculate</AppText>
            <View style={[styles.group, styles.resetCard]}>
              <AppText variant="rowSubtitle" color="muted" style={styles.resetCopy}>
                Start fresh — targets are recalculated from your training intent.
              </AppText>
              <PrimaryButton secondary onPress={confirmRestart} disabled={!canSave}>
                Restart goals
              </PrimaryButton>
              <AppText variant="rowSubtitle" color="muted" style={styles.fairnessCaption}>
                Goal changes apply from next week so this week's rank is fair
              </AppText>
            </View>

            {error ? <AppText variant="rowSubtitle" color="danger" style={styles.message}>{error}</AppText> : null}
            {saved ? <AppText variant="rowSubtitle" color="success" style={styles.message}>{saved}</AppText> : null}

            <PrimaryButton onPress={save} disabled={!canSave} loading={saving} style={styles.saveButton}>
              Save goals
            </PrimaryButton>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, marginLeft: spacing.xs },
  intro: { marginBottom: spacing.md, marginLeft: spacing.xs, lineHeight: 18 },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.listGroup,
    borderWidth: 1,
    borderColor: colors.borderCard,
    paddingHorizontal: spacing.base,
  },
  groupGap: { marginTop: spacing.md },
  catHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, minHeight: 56 },
  rowBlock: { paddingVertical: spacing.md, gap: 2 },
  subline: { paddingRight: spacing.sm },
  divider: { height: 1, backgroundColor: colors.divider },
  workoutChips: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  workoutChip: {
    flex: 1,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  dateChip: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primaryTint, borderColor: 'rgba(62,139,255,0.5)' },
  segmented: { marginTop: spacing.sm },
  dateField: { marginTop: spacing.md },
  resetCard: { paddingVertical: spacing.base, gap: spacing.md },
  resetCopy: { lineHeight: 18 },
  fairnessCaption: { textAlign: 'center', lineHeight: 18 },
  message: { marginTop: spacing.base, textAlign: 'center' },
  saveButton: { marginTop: spacing.base },
});
