import React, { useContext, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
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
import { completeOnboarding } from '../../services/onboarding';
import { requestNotificationPermissions, scheduleNotifications } from '../../services/notifications';
import { requestHealthPermissions } from '../../services/health/healthService';
import { updateHealthSettings } from '../../services/healthSettings';
import { onboardingAnalytics } from '../../services/analytics';
import { onboardingCopy } from '../../constants/onboardingCopy';
import { subscribeMyProfile } from '../../services/profile';
import { formatWeightLb } from '../../utils/formatters';
import { db } from '../../firebase/firebase';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Finish'>;

export default function OnboardingFinishScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const rootNav = useNavigation();

  const [summary, setSummary] = useState<{
    goalMode?: string;
    dailyCalorieGoal?: number;
    workoutsPerWeek?: number;
    weightGoal?: number;
    weightTargetDate?: string;
    units?: 'imperial' | 'metric';
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onboardingAnalytics.screenView(5, 'Finish', 1);
  }, []);

  useEffect(() => {
    if (!user?.uid) return;

    // Load summary data - merge goalMode and units with profile data
    const unsubscribe = subscribeMyProfile(user.uid, (profile) => {
      if (profile) {
        setSummary((prev) => ({
          ...prev,
          dailyCalorieGoal: profile.dailyCalorieGoal ?? undefined,
          workoutsPerWeek: profile.workoutsPerWeek ?? undefined,
          weightGoal: profile.weightGoal ?? undefined,
          weightTargetDate: profile.weightTargetDate ?? undefined,
        }));
      }
    });

    // Also get goalMode and units
    if (db) {
      getDoc(doc(db, 'users', user.uid)).then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setSummary((prev) => ({
            ...prev,
            // @ts-ignore
            goalMode: data.goalMode,
            // @ts-ignore
            units: data.units,
          }));
        }
      });
    }

    return unsubscribe;
  }, [user?.uid]);

  const handleFinish = async () => {
    if (!user?.uid) return;

    setIsSubmitting(true);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Ask for notifications + health sync here (native OS prompts). Both are
      // non-fatal — a denial/failure never blocks continuing; the user can
      // enable them later in Settings.
      try {
        const notifGranted = await requestNotificationPermissions();
        if (notifGranted) await scheduleNotifications({ startFromTomorrow: true });
      } catch (e) {
        console.warn('[Onboarding] notification permission request failed', e);
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

      // Final step: get them into a group (onboarding completes there, so the
      // group choice lands them straight on Today).
      navigation.navigate('Group');
    } catch (error) {
      console.error('[Onboarding] Error finishing setup:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const formatGoalMode = (mode?: string) => {
    if (!mode) return '—';
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  };

  const formatWeight = (weight?: number, units?: 'imperial' | 'metric') => {
    if (weight == null) return '—';
    if (units === 'metric') {
      // Convert lbs to kg
      const kg = weight / 2.20462;
      return `${Math.round(kg * 10) / 10} kg`;
    }
    return formatWeightLb(weight);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <OnboardingHeader currentStep={6} totalSteps={6} showBack={true} onBack={handleBack} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.textContainer}>
          <AppText variant="pageTitle" color="primary" style={styles.headline}>
            {onboardingCopy.finish.headline}
          </AppText>
          <AppText variant="body" color="secondary" style={styles.subtext}>
            {onboardingCopy.finish.subtext}
          </AppText>
        </View>

        <Card style={styles.summaryCard}>
          <AppText variant="rowTitle" color="primary" style={styles.summaryTitle}>
            Your Goals
          </AppText>
          <View style={styles.summaryRow}>
            <AppText variant="body" color="muted">
              Mode:
            </AppText>
            <AppText variant="body" color="primary">
              {formatGoalMode(summary.goalMode)}
            </AppText>
          </View>
          {summary.dailyCalorieGoal != null && (
            <View style={styles.summaryRow}>
              <AppText variant="body" color="muted">
                Calories/day:
              </AppText>
              <AppText variant="body" color="primary">
                {summary.dailyCalorieGoal.toLocaleString()}
              </AppText>
            </View>
          )}
          {summary.workoutsPerWeek != null && (
            <View style={styles.summaryRow}>
              <AppText variant="body" color="muted">
                Workouts/week:
              </AppText>
              <AppText variant="body" color="primary">
                {summary.workoutsPerWeek}
              </AppText>
            </View>
          )}
          {summary.weightGoal != null && (
            <View style={styles.summaryRow}>
              <AppText variant="body" color="muted">
                Weight goal:
              </AppText>
              <AppText variant="body" color="primary">
                {formatWeight(summary.weightGoal, summary.units)}
              </AppText>
            </View>
          )}
          {summary.weightTargetDate && (
            <View style={styles.summaryRow}>
              <AppText variant="body" color="muted">
                Target date:
              </AppText>
              <AppText variant="body" color="primary">
                {summary.weightTargetDate}
              </AppText>
            </View>
          )}
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <AppText variant="rowSubtitle" color="muted" style={styles.permsNote}>
          Next, we'll ask to connect your health app and turn on reminders — you can change these anytime in Settings.
        </AppText>
        <PrimaryButton
          onPress={handleFinish}
          style={styles.button}
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          Continue
        </PrimaryButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  textContainer: {
    marginBottom: 32,
  },
  headline: {
    marginBottom: 12,
    fontWeight: '600',
  },
  subtext: {
    lineHeight: 24,
  },
  summaryCard: {
    marginTop: 16,
  },
  summaryTitle: {
    marginBottom: 16,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 16,
    backgroundColor: colors.background,
  },
  button: {
    minHeight: 48,
  },
  permsNote: {
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
});
