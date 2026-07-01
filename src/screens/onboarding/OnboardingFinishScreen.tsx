import React, { useContext, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, useTheme, Card } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { doc, getDoc } from 'firebase/firestore';

import { AuthContext } from '../../store/AuthContext';
import { OnboardingStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { completeOnboarding } from '../../services/onboarding';
import { onboardingAnalytics } from '../../services/analytics';
import { onboardingCopy } from '../../constants/onboardingCopy';
import { subscribeMyProfile } from '../../services/profile';
import { formatWeightLb } from '../../utils/formatters';
import { db } from '../../firebase/firebase';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Finish'>;

export default function OnboardingFinishScreen({ navigation }: Props) {
  const theme = useTheme();
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
      await completeOnboarding(user.uid);
      onboardingAnalytics.completed();
      
      // Navigate to root MainTabs
      // The AppNavigator will automatically show MainTabs since onboarding is now completed
      // (useOnboardingStatus now subscribes to real-time updates)
      // We need to reset the root navigator to get out of OnboardingNavigator
      const parent = rootNav.getParent();
      if (parent) {
        parent.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'MainTabs', params: { screen: 'ProfileTab', params: { screen: 'Profile' } } }],
          })
        );
      } else {
        // Fallback: navigate directly if parent not found
        rootNav.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'MainTabs', params: { screen: 'ProfileTab', params: { screen: 'Profile' } } }],
          })
        );
      }
    } catch (error) {
      console.error('[Onboarding] Error completing onboarding:', error);
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <OnboardingHeader currentStep={5} totalSteps={5} showBack={true} onBack={handleBack} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.textContainer}>
          <Text variant="headlineLarge" style={[styles.headline, { color: theme.colors.onSurface }]}>
            {onboardingCopy.finish.headline}
          </Text>
          <Text variant="bodyLarge" style={[styles.subtext, { color: theme.colors.onSurfaceVariant }]}>
            {onboardingCopy.finish.subtext}
          </Text>
        </View>

        <Card style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <Text variant="titleMedium" style={[styles.summaryTitle, { color: theme.colors.onSurface }]}>
              Your Goals
            </Text>
            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Mode:
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                {formatGoalMode(summary.goalMode)}
              </Text>
            </View>
            {summary.dailyCalorieGoal != null && (
              <View style={styles.summaryRow}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  Calories/day:
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                  {summary.dailyCalorieGoal.toLocaleString()}
                </Text>
              </View>
            )}
            {summary.workoutsPerWeek != null && (
              <View style={styles.summaryRow}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  Workouts/week:
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                  {summary.workoutsPerWeek}
                </Text>
              </View>
            )}
            {summary.weightGoal != null && (
              <View style={styles.summaryRow}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  Weight goal:
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                  {formatWeight(summary.weightGoal, summary.units)}
                </Text>
              </View>
            )}
            {summary.weightTargetDate && (
              <View style={styles.summaryRow}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  Target date:
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                  {summary.weightTargetDate}
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.colors.background }]}>
        <PrimaryButton
          onPress={handleFinish}
          style={styles.button}
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          Go to Profile
        </PrimaryButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  },
  button: {
    minHeight: 48,
  },
});
