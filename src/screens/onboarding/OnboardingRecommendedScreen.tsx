import React, { useContext, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Switch, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc } from 'firebase/firestore';

import { AuthContext } from '../../store/AuthContext';
import { OnboardingStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import AppText from '../../components/ui/AppText';
import EditRow from '../../components/ui/EditRow';
import { updateOnboardingStep } from '../../services/onboarding';
import { updateMyProfile } from '../../services/profile';
import { upsertGoal } from '../../services/mmrGoals';
import { onboardingAnalytics } from '../../services/analytics';
import { onboardingCopy } from '../../constants/onboardingCopy';
import { db } from '../../firebase/firebase';
import { recommendTargets, suggestTargetDate, WORKOUTS_BY_INTENT, type GoalMode } from '../../utils/recommendedTargets';
import { colors, spacing, radius } from '../../theme';

/** Calorie-logging cadence onboarding assumes; tunable later in Goals. */
const CALORIE_DAYS_PER_WEEK = 5;

function formatTargetDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.valueOf())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isPast(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() <= today.getTime();
}

/**
 * Category header with an on/off switch. Deliberately the same shape as
 * MMRGoalsScreen's CategoryHeader so the two screens teach the same model:
 * a category you switch off is never scored and never penalizes you.
 */
function CategoryToggle({ title, subtitle, value, onValueChange }: { title: string; subtitle: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={styles.catRow}>
      <View style={{ flex: 1, paddingRight: spacing.sm }}>
        <AppText variant="rowTitle" color="primary">{title}</AppText>
        <AppText variant="rowSubtitle" color="muted" style={{ marginTop: 2 }}>{subtitle}</AppText>
      </View>
      <Switch
        value={value}
        onValueChange={(v) => { onValueChange(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        trackColor={{ false: colors.ringNotLogged, true: colors.primary }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={colors.ringNotLogged}
      />
    </View>
  );
}

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Recommended'>;

/**
 * "Here are your recommended targets" — computed from the intent picked on the
 * Goals screen + the stats entered in Basic Info (Mifflin-St Jeor). The user
 * can tweak before locking in. For re-onboarded users with goals already set,
 * their existing values pre-fill instead so nothing gets clobbered.
 */
export default function OnboardingRecommendedScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { recommended } = onboardingCopy;

  const [calories, setCalories] = useState('');
  const [workouts, setWorkouts] = useState(4);
  // Which categories this person actually wants. All on by default (the group
  // norm), but switching one off here is a first-class choice, not a hidden
  // setting buried in Goals.
  const [workoutsOn, setWorkoutsOn] = useState(true);
  const [caloriesOn, setCaloriesOn] = useState(true);
  const [weightOn, setWeightOn] = useState(true);
  const [weighDays, setWeighDays] = useState(3);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [targetPace, setTargetPace] = useState<number | null>(null);
  const [personalized, setPersonalized] = useState(false);
  const [hadExisting, setHadExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onboardingAnalytics.screenView(4, 'Recommended', 1);
  }, []);

  // Compute the recommendation from what onboarding just collected.
  useEffect(() => {
    if (!user?.uid || !db) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const d = snap.exists() ? (snap.data() as any) : {};
        const goalMode: GoalMode = d?.goalMode === 'cut' || d?.goalMode === 'bulk' ? d.goalMode : 'maintenance';
        const intentWorkouts = WORKOUTS_BY_INTENT[String(d?.trainingIntent ?? '')] ?? 4;

        const rec = recommendTargets({
          goalMode,
          workoutsPerWeek: intentWorkouts,
          weightLb: d?.weightCurrent,
          heightIn: d?.height,
          age: d?.age,
          sex: d?.sex ?? null,
        });

        if (cancelled) return;
        // Re-onboarding safety: existing calibrated goals win over the recommendation.
        const existingCal = typeof d?.dailyCalorieGoal === 'number' ? d.dailyCalorieGoal : null;
        const existingWk = typeof d?.workoutsPerWeek === 'number' ? d.workoutsPerWeek : null;
        setHadExisting(existingCal != null || existingWk != null);
        setCalories(String(existingCal || rec.dailyCalorieGoal));
        setWorkouts(existingWk || rec.workoutsPerWeek);
        setPersonalized(rec.personalized);

        // Re-onboarding: a 0 in the profile mirror IS the off switch (that's
        // how MMRGoalsScreen records a disabled category), so honour it rather
        // than silently switching someone's tracking back on.
        if (existingWk === 0) setWorkoutsOn(false);
        if (typeof d?.logCaloriesDaysPerWeek === 'number' && d.logCaloriesDaysPerWeek === 0) setCaloriesOn(false);
        if (typeof d?.logWeightDaysPerWeek === 'number') {
          if (d.logWeightDaysPerWeek === 0) setWeightOn(false);
          else setWeighDays(d.logWeightDaysPerWeek);
        }

        // Suggest a realistic goal target date (existing value wins on re-onboard).
        const sug = suggestTargetDate({ weightLb: d?.weightCurrent, goalLb: d?.weightGoal, goalMode });
        const existingDate = typeof d?.weightTargetDate === 'string' ? d.weightTargetDate : null;
        setTargetDate(existingDate ?? sug?.iso ?? null);
        setTargetPace(sug?.rateLbPerWeek ?? null);
      } catch (e) {
        console.error('[Onboarding] recommendation failed:', e);
        if (!cancelled) setCalories('2200');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const anyCategoryOn = workoutsOn || caloriesOn || weightOn;

  const handleContinue = async () => {
    if (!user?.uid || !anyCategoryOn) return;
    const cal = Number(calories);
    // Calories only has to be valid if they're actually tracking it.
    if (caloriesOn && (!Number.isFinite(cal) || cal < 800 || cal > 8000)) return;

    setIsSubmitting(true);
    try {
      // Profile mirror. A disabled category writes 0 — the same convention
      // MMRGoalsScreen uses, which the group compliance charts read.
      await updateMyProfile({
        uid: user.uid,
        ...(caloriesOn && Number.isFinite(cal) ? { dailyCalorieGoal: Math.round(cal) } : {}),
        workoutsPerWeek: workoutsOn ? workouts : 0,
        logCaloriesDaysPerWeek: caloriesOn ? CALORIE_DAYS_PER_WEEK : 0,
        logWeightDaysPerWeek: weightOn ? weighDays : 0,
        ...(weightOn && targetDate ? { weightTargetDate: targetDate } : {}),
      });
      // CRITICAL: also create the SCORING goal docs (users/{uid}/goals) — the
      // FP engine reads these, not the profile fields. Without them, a user
      // who never opens Profile→Goals earns ZERO FP for workouts/calories
      // (hit in prod: 4 users logging workouts stuck at 1800).
      // 'paused' is how a switched-off category is recorded, so it is never
      // scored AND never penalized.
      await upsertGoal(user.uid, 'workouts', {
        type: 'workouts',
        status: workoutsOn ? 'active' : 'paused',
        targetWorkoutsPerWeek: workouts,
      });
      await upsertGoal(user.uid, 'calorieDays', {
        type: 'calorieDays',
        status: caloriesOn ? 'active' : 'paused',
        targetDaysPerWeek: CALORIE_DAYS_PER_WEEK,
      });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await updateOnboardingStep(user.uid, 4);
      onboardingAnalytics.goalsSaved();
      onboardingAnalytics.continue(4, 5);
      navigation.navigate('Finish');
    } catch (error) {
      console.error('[Onboarding] Error saving targets:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <OnboardingHeader currentStep={4} totalSteps={6} showBack onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AppText variant="pageTitle" color="primary" style={styles.headline}>
            {recommended.headline}
          </AppText>
          <AppText variant="body" color="secondary" style={styles.subtext}>
            {hadExisting
              ? 'These are your current settings. Switch off anything you no longer want tracked.'
              : personalized
                ? recommended.subtextPersonalized
                : recommended.subtextFallback}
          </AppText>

          {!loading && (
            <>
              <CategoryToggle
                title="Workouts"
                subtitle="Days per week you train"
                value={workoutsOn}
                onValueChange={setWorkoutsOn}
              />
              {workoutsOn ? (
                <View style={styles.chips}>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                    const sel = workouts === n;
                    return (
                      <TouchableOpacity
                        key={n}
                        onPress={() => {
                          setWorkouts(n);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        style={[styles.chip, sel && styles.chipSelected]}
                      >
                        <AppText variant="rowTitle" color={sel ? 'accent' : 'secondary'}>{n}</AppText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              <CategoryToggle
                title="Calories"
                subtitle="Daily intake target"
                value={caloriesOn}
                onValueChange={setCaloriesOn}
              />
              {caloriesOn ? (
                <View style={styles.group}>
                  <EditRow
                    label="Calorie target"
                    value={calories}
                    onChangeText={(t) => setCalories(t.replace(/[^0-9]/g, ''))}
                    subline={personalized && !hadExisting ? 'Estimated from your stats and goal' : undefined}
                    suffix="kcal"
                    keyboardType="number-pad"
                    showDivider={false}
                  />
                </View>
              ) : null}

              <CategoryToggle
                title="Weight"
                subtitle="Weigh-ins per week"
                value={weightOn}
                onValueChange={setWeightOn}
              />
              {weightOn ? (
                <>
                  {/* Say the quiet part here rather than letting someone log
                      weigh-ins for weeks and wonder why they score nothing.
                      Today's setup card follows this up with a one-tap link. */}
                  <AppText variant="rowSubtitle" color="muted" style={styles.weightNote}>
                    Set a goal weight later in Goals to earn FP for this.
                  </AppText>
                  <View style={styles.chips}>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                      const sel = weighDays === n;
                      return (
                        <TouchableOpacity
                          key={n}
                          onPress={() => {
                            setWeighDays(n);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                          style={[styles.chip, sel && styles.chipSelected]}
                        >
                          <AppText variant="rowTitle" color={sel ? 'accent' : 'secondary'}>{n}</AppText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {targetDate ? (
                    <>
                      <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Goal target date</AppText>
                      <View style={styles.group}>
                        <View style={styles.dateRow}>
                          <TouchableOpacity
                            onPress={() => {
                              const next = shiftISO(targetDate, -7);
                              if (!isPast(next)) { setTargetDate(next); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
                            }}
                            style={[styles.stepBtn, isPast(shiftISO(targetDate, -7)) && styles.stepBtnDisabled]}
                          >
                            <AppText variant="rowTitle" color="secondary">−</AppText>
                          </TouchableOpacity>
                          <View style={styles.dateCenter}>
                            <AppText variant="rowTitle" color="primary">{formatTargetDate(targetDate)}</AppText>
                            {targetPace ? (
                              <AppText variant="rowSubtitle" color="muted">~{targetPace} lb/week</AppText>
                            ) : null}
                          </View>
                          <TouchableOpacity
                            onPress={() => { setTargetDate(shiftISO(targetDate, 7)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                            style={styles.stepBtn}
                          >
                            <AppText variant="rowTitle" color="secondary">+</AppText>
                          </TouchableOpacity>
                        </View>
                      </View>
                      <AppText variant="rowSubtitle" color="muted" style={styles.note}>
                        A realistic date at a healthy pace. Nudge it a week at a time, and change it anytime.
                      </AppText>
                    </>
                  ) : null}
                </>
              ) : null}

              {!anyCategoryOn ? (
                <AppText variant="rowSubtitle" color="danger" style={styles.note}>
                  Pick at least one thing to track.
                </AppText>
              ) : null}

              <AppText variant="rowSubtitle" color="muted" style={styles.note}>
                {recommended.note}
              </AppText>
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton onPress={handleContinue} loading={isSubmitting} disabled={loading || isSubmitting || !anyCategoryOn || (caloriesOn && !calories)} style={styles.button}>
            {recommended.cta}
          </PrimaryButton>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.base },
  headline: { fontSize: 26, fontWeight: '800' },
  subtext: { marginTop: spacing.sm, lineHeight: 21 },
  sectionLabel: { marginTop: spacing.xl, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: radius.tile,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primaryTint, borderColor: 'rgba(62,139,255,0.5)' },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.listGroup,
    borderWidth: 1,
    borderColor: colors.borderCard,
    paddingHorizontal: spacing.base,
  },
  note: { marginTop: spacing.base, lineHeight: 18 },
  weightNote: { marginTop: -spacing.xs, marginBottom: spacing.sm, lineHeight: 17 },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
  dateCenter: { flex: 1, alignItems: 'center', gap: 2 },
  stepBtn: { width: 44, height: 44, borderRadius: radius.tile, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  stepBtnDisabled: { opacity: 0.35 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.base, paddingTop: spacing.md },
  button: { width: '100%' },
});
