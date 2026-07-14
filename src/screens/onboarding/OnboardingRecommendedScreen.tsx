import React, { useContext, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
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
        setCalories(String(existingCal ?? rec.dailyCalorieGoal));
        setWorkouts(existingWk ?? rec.workoutsPerWeek);
        setPersonalized(rec.personalized);

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

  const handleContinue = async () => {
    if (!user?.uid) return;
    const cal = Number(calories);
    if (!Number.isFinite(cal) || cal < 800 || cal > 8000) return;

    setIsSubmitting(true);
    try {
      await updateMyProfile({
        uid: user.uid,
        dailyCalorieGoal: Math.round(cal),
        workoutsPerWeek: workouts,
        ...(targetDate ? { weightTargetDate: targetDate } : {}),
      });
      // CRITICAL: also create the SCORING goal docs (users/{uid}/goals) — the
      // FP engine reads these, not the profile fields. Without them, a user
      // who never opens Profile→Goals earns ZERO FP for workouts/calories
      // (hit in prod: 4 users logging workouts stuck at 1800).
      await upsertGoal(user.uid, 'workouts', { type: 'workouts', status: 'active', targetWorkoutsPerWeek: workouts });
      await upsertGoal(user.uid, 'calorieDays', { type: 'calorieDays', status: 'active', targetDaysPerWeek: 5 });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await updateOnboardingStep(user.uid, 4);
      onboardingAnalytics.goalsSaved();
      onboardingAnalytics.continue(4, 5);
      navigation.navigate('Accountability');
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
              ? 'These are your current targets — tweak anything before you lock it in.'
              : personalized
                ? recommended.subtextPersonalized
                : recommended.subtextFallback}
          </AppText>

          {!loading && (
            <>
              <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Workouts / week</AppText>
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

              <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Daily calories</AppText>
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
                    A realistic date at a healthy pace — nudge it a week at a time. You can change it anytime.
                  </AppText>
                </>
              ) : null}

              <AppText variant="rowSubtitle" color="muted" style={styles.note}>
                {recommended.note}
              </AppText>
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton onPress={handleContinue} loading={isSubmitting} disabled={loading || isSubmitting || !calories} style={styles.button}>
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
  dateRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
  dateCenter: { flex: 1, alignItems: 'center', gap: 2 },
  stepBtn: { width: 44, height: 44, borderRadius: radius.tile, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  stepBtnDisabled: { opacity: 0.35 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.base, paddingTop: spacing.md },
  button: { width: '100%' },
});
