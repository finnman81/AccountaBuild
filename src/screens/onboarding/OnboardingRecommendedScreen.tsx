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
import { onboardingAnalytics } from '../../services/analytics';
import { onboardingCopy } from '../../constants/onboardingCopy';
import { db } from '../../firebase/firebase';
import { recommendTargets, WORKOUTS_BY_INTENT, type GoalMode } from '../../utils/recommendedTargets';
import { colors, spacing, radius } from '../../theme';

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
      await updateMyProfile({ uid: user.uid, dailyCalorieGoal: Math.round(cal), workoutsPerWeek: workouts });
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
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.base, paddingTop: spacing.md },
  button: { width: '100%' },
});
