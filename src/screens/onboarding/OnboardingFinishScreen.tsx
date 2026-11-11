import React, { useContext, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Platform, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { doc, getDoc } from 'firebase/firestore';

import { AuthContext } from '../../store/AuthContext';
import { OnboardingStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import AppText from '../../components/ui/AppText';
import Card from '../../components/ui/Card';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { completeOnboarding } from '../../services/onboarding';
import { requestNotificationPermissions } from '../../services/notifications';
import { requestHealthPermissions } from '../../services/health/healthService';
import { updateHealthSettings } from '../../services/healthSettings';
import { DEFAULT_NOTIF_GROUPS, NOTIF_LEVELS, saveNotifLevelSettings, type NotifLevel } from '../../services/appSettings';
import { onboardingAnalytics } from '../../services/analytics';
import { onboardingCopy } from '../../constants/onboardingCopy';
import { subscribeMyProfile } from '../../services/profile';
import { formatWeightForUnits } from '../../utils/formatters';
import { db } from '../../firebase/firebase';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Finish'>;

/**
 * Last onboarding step: the goals they set, how much the app should talk to
 * them (the notification level), then the phone's own permission prompts.
 *
 * It is LAST on purpose. It used to sit before the accountability and group
 * steps and marked onboarding complete before its prompts (so a crash in a
 * native prompt could not re-trap anyone). But "complete" swaps the whole app
 * to the main tabs at once, so from 2026-07-13 nobody ever saw those two steps.
 */
export default function OnboardingFinishScreen({}: Props) {
  const { user } = useContext(AuthContext);
  const rootNav = useNavigation();

  const [summary, setSummary] = useState<{
    goalMode?: string;
    dailyCalorieGoal?: number;
    workoutsPerWeek?: number;
    weightGoal?: number;
    weightTargetDate?: string;
    units?: 'imperial' | 'metric';
    caloriesOn?: boolean;
    weightOn?: boolean;
  }>({});
  const [level, setLevel] = useState<Exclude<NotifLevel, 'custom'>>('standard');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onboardingAnalytics.screenView(5, 'Finish', 1);
  }, []);

  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = subscribeMyProfile(user.uid, (profile) => {
      if (profile) {
        setSummary((prev) => ({
          ...prev,
          dailyCalorieGoal: profile.dailyCalorieGoal ?? undefined,
          workoutsPerWeek: profile.workoutsPerWeek ?? undefined,
          weightGoal: profile.weightGoal ?? undefined,
          weightTargetDate: profile.weightTargetDate ?? undefined,
          // A 0 cadence is the off switch (Recommended writes it for a
          // category the user turned off); those rows stay out of the summary.
          caloriesOn: profile.logCaloriesDaysPerWeek !== 0,
          weightOn: profile.logWeightDaysPerWeek !== 0,
        }));
      }
    });

    if (db) {
      getDoc(doc(db, 'users', user.uid)).then((snap) => {
        if (snap.exists()) {
          const data = snap.data() as any;
          setSummary((prev) => ({ ...prev, goalMode: data.goalMode, units: data.units }));
        }
      });
    }

    return unsubscribe;
  }, [user?.uid]);

  const handleFinish = async (thenLog: boolean) => {
    if (!user?.uid) return;
    setIsSubmitting(true);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Their level first: it is the one thing on this screen they chose.
      try {
        await saveNotifLevelSettings(user.uid, { level, groups: { ...DEFAULT_NOTIF_GROUPS }, reminderTime: '18:00' });
      } catch (e) {
        console.warn('[Onboarding] saving the notification level failed', e);
      }

      // Native OS prompts. Both are non-fatal: a denial or a failure never
      // blocks finishing, and both can be turned on later.
      try {
        await requestNotificationPermissions();
      } catch (e) {
        console.warn('[Onboarding] notification permission request failed', e);
      }
      // Complete BEFORE the health prompt: a native crash inside it (seen on
      // Android) must never send someone back through onboarding. This is the
      // last step, so the swap to the main tabs is what we want anyway.
      try {
        await completeOnboarding(user.uid);
        onboardingAnalytics.completed();
      } catch (e) {
        console.warn('[Onboarding] completeOnboarding failed', e);
      }
      try {
        const health = await requestHealthPermissions();
        if (health.success) {
          await updateHealthSettings(user.uid, {
            syncWorkouts: true,
            syncCalories: true,
            syncWeight: true,
            healthKitAuthorized: Platform.OS === 'ios',
            googleFitAuthorized: Platform.OS === 'android',
          });
        }
      } catch (e) {
        console.warn('[Onboarding] health permission request failed', e);
      }
    } finally {
      // Whatever the prompts did, nobody gets stuck here (a no-op when the
      // call above already completed it).
      try {
        await completeOnboarding(user.uid);
      } catch (e) {
        console.warn('[Onboarding] completeOnboarding failed', e);
      }
      // Land on Today. AppNavigator swaps to MainTabs now that onboarding is done.
      const nav = rootNav.getParent() ?? rootNav;
      nav.dispatch(
        CommonActions.reset({
            // The first log is where the app pays off, so the main button opens
          // the log screen on top of Today.
          index: thenLog ? 1 : 0,
          routes: [
            { name: 'MainTabs', params: { screen: 'HomeTab', params: { screen: 'Today' } } },
            ...(thenLog ? [{ name: 'LogComposer', params: { initialType: 'workout' } }] : []),
          ],
        }),
      );
      setIsSubmitting(false);
    }
  };

  const picked = NOTIF_LEVELS.find((l) => l.value === level)!;
  const rows: Array<[string, string]> = [];
  if (summary.goalMode) rows.push(['Mode', summary.goalMode.charAt(0).toUpperCase() + summary.goalMode.slice(1)]);
  if (summary.caloriesOn !== false && summary.dailyCalorieGoal != null) rows.push(['Calories a day', summary.dailyCalorieGoal.toLocaleString()]);
  if (summary.workoutsPerWeek) rows.push(['Workouts a week', String(summary.workoutsPerWeek)]);
  if (summary.weightOn !== false && summary.weightGoal != null) rows.push(['Goal weight', formatWeightForUnits(summary.weightGoal, summary.units)]);
  if (summary.weightOn !== false && summary.weightTargetDate) rows.push(['Target date', summary.weightTargetDate]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <OnboardingHeader currentStep={7} totalSteps={7} showBack={false} onBack={() => {}} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText variant="pageTitle" color="primary">{onboardingCopy.finish.headline}</AppText>
        <AppText variant="body" color="secondary" style={styles.subtext}>{onboardingCopy.finish.subtext}</AppText>

        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Notifications</AppText>
        <SegmentedControl
          variant="primary"
          options={NOTIF_LEVELS.map((l) => ({ value: l.value, label: l.label }))}
          value={level}
          onChange={setLevel}
        />
        <View style={styles.levelNote}>
          <AppText variant="stat" color="accent">{picked.count}</AppText>
          <AppText variant="rowSubtitle" color="secondary" style={styles.levelBody}>{picked.body}</AppText>
          <AppText variant="rowSubtitle" color="primary" style={styles.allowNote}>{onboardingCopy.finish.allowNote}</AppText>
        </View>

        {rows.length ? (
          <>
            <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Your goals</AppText>
            <Card>
              {rows.map(([label, value], i) => (
                <View key={label} style={[styles.summaryRow, i === rows.length - 1 && { marginBottom: 0 }]}>
                  <AppText variant="body" color="muted">{label}</AppText>
                  <AppText variant="stat" color="primary">{value}</AppText>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <AppText variant="rowSubtitle" color="muted" style={styles.permsNote}>
          {onboardingCopy.finish.permsNote}
        </AppText>
        <PrimaryButton onPress={() => void handleFinish(true)} loading={isSubmitting} disabled={isSubmitting}>
          {onboardingCopy.finish.cta}
        </PrimaryButton>
        <TouchableOpacity onPress={() => void handleFinish(false)} disabled={isSubmitting} style={styles.later} accessibilityRole="button">
          <AppText variant="rowSubtitle" color="muted">{onboardingCopy.finish.later}</AppText>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.base },
  subtext: { marginTop: spacing.sm, lineHeight: 21 },
  sectionLabel: { marginTop: spacing.xl, marginBottom: spacing.sm, marginLeft: spacing.xs },
  levelNote: { marginTop: spacing.md, gap: 4, marginLeft: spacing.xs },
  levelBody: { lineHeight: 18 },
  allowNote: { lineHeight: 18, marginTop: spacing.sm },
  later: { alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.xs },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.md },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.base, paddingTop: spacing.md },
  permsNote: { textAlign: 'center', lineHeight: 18, marginBottom: spacing.md },
});
