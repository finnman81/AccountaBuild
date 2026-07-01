import React, { useContext, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, useTheme, SegmentedButtons, Chip, Switch } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

import { AuthContext } from '../../store/AuthContext';
import { OnboardingStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { updateOnboardingStep } from '../../services/onboarding';
import { updateMyProfile } from '../../services/profile';
import { onboardingAnalytics } from '../../services/analytics';
import { onboardingCopy } from '../../constants/onboardingCopy';
import { subscribeMyProfile } from '../../services/profile';
import { todayYYYYMMDD, isValidYYYYMMDD } from '../../utils/dates';
import { db } from '../../firebase/firebase';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Goals'>;

export default function OnboardingGoalsScreen({ navigation }: Props) {
  const theme = useTheme();
  const { user } = useContext(AuthContext);

  const [goalMode, setGoalMode] = useState<'cut' | 'bulk' | 'maintenance' | ''>('');
  const [dailyCalorieGoal, setDailyCalorieGoal] = useState('');
  const [workoutsPerWeek, setWorkoutsPerWeek] = useState('');
  const [weightGoal, setWeightGoal] = useState('');
  const [weightTargetDate, setWeightTargetDate] = useState('');
  const [logCaloriesDaysPerWeek, setLogCaloriesDaysPerWeek] = useState<number | null>(null);
  const [logWeightDaysPerWeek, setLogWeightDaysPerWeek] = useState<number | null>(null);

  // Enable/disable toggles
  const [workoutsEnabled, setWorkoutsEnabled] = useState(true);
  const [caloriesTrackingEnabled, setCaloriesTrackingEnabled] = useState(true);
  const [weightTrackingEnabled, setWeightTrackingEnabled] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<'imperial' | 'metric'>('imperial');

  // Prefill from existing profile
  useEffect(() => {
    if (!user?.uid) return;

    return subscribeMyProfile(user.uid, (profile) => {
      if (profile) {
        if (profile.dailyCalorieGoal != null) setDailyCalorieGoal(String(profile.dailyCalorieGoal));
        if (profile.workoutsPerWeek != null) {
          setWorkoutsPerWeek(String(profile.workoutsPerWeek));
          setWorkoutsEnabled(true);
        } else {
          setWorkoutsEnabled(false);
        }
        if (profile.weightGoal != null) setWeightGoal(String(profile.weightGoal));
        if (profile.weightTargetDate) setWeightTargetDate(profile.weightTargetDate);
        if (profile.logCaloriesDaysPerWeek != null) {
          setLogCaloriesDaysPerWeek(profile.logCaloriesDaysPerWeek);
          setCaloriesTrackingEnabled(true);
        } else {
          setCaloriesTrackingEnabled(false);
        }
        if (profile.logWeightDaysPerWeek != null) {
          setLogWeightDaysPerWeek(profile.logWeightDaysPerWeek);
          setWeightTrackingEnabled(true);
        } else {
          setWeightTrackingEnabled(false);
        }
      }
    });

    // Also get units and goalMode
    if (db) {
      getDoc(doc(db, 'users', user.uid)).then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          // @ts-ignore
          if (data.units) setUnits(data.units);
          // @ts-ignore
          if (data.goalMode) setGoalMode(data.goalMode);
        }
      });
    }
  }, [user?.uid]);

  useEffect(() => {
    onboardingAnalytics.screenView(4, 'Goals', 1);
  }, []);

  const validateDailyCalorieGoal = (value: string, mode: string): string | null => {
    const num = Number(value);
    if (!value.trim()) return 'Daily calorie goal is required';
    if (!Number.isFinite(num)) return 'Calorie goal must be a valid number';
    
    if (mode === 'cut') {
      if (num < 1200 || num > 3500) return 'Calorie goal for cut must be between 1,200 and 3,500';
    } else if (mode === 'bulk') {
      if (num < 1800 || num > 4500) return 'Calorie goal for bulk must be between 1,800 and 4,500';
    } else if (mode === 'maintenance') {
      if (num < 1500 || num > 4000) return 'Calorie goal for maintenance must be between 1,500 and 4,000';
    }
    return null;
  };

  const validateWorkoutsPerWeek = (value: string): string | null => {
    const num = Number(value);
    if (!value.trim()) return 'Workouts per week is required';
    if (!Number.isFinite(num) || num < 1 || num > 7) return 'Workouts per week must be between 1 and 7';
    return null;
  };

  const validateWeightGoal = (value: string): string | null => {
    const num = Number(value);
    if (!value.trim()) return 'Weight goal is required';
    if (!Number.isFinite(num)) return 'Weight goal must be a valid number';
    
    if (units === 'imperial') {
      if (num < 80 || num > 450) return 'Weight goal must be between 80 and 450 lbs';
    } else {
      if (num < 35 || num > 205) return 'Weight goal must be between 35 and 205 kg';
    }
    return null;
  };

  const validateWeightTargetDate = (value: string): string | null => {
    if (!value.trim()) return 'Target date is required';
    if (!isValidYYYYMMDD(value)) return 'Date must be in YYYY-MM-DD format';
    
    const today = todayYYYYMMDD();
    const minDate = new Date(today);
    minDate.setDate(minDate.getDate() + 7);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 365);
    
    const date = new Date(`${value}T00:00:00`);
    const min = new Date(`${formatYYYYMMDD(minDate)}T00:00:00`);
    const max = new Date(`${formatYYYYMMDD(maxDate)}T00:00:00`);
    
    if (date < min) return 'Target date must be at least 7 days from today';
    if (date > max) return 'Target date must be within 365 days from today';
    return null;
  };

  const formatYYYYMMDD = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleContinue = async () => {
    if (!user?.uid) return;

    const newErrors: Record<string, string> = {};

    if (!goalMode) newErrors.goalMode = 'Please select cut, bulk, or maintenance';

    const calorieError = validateDailyCalorieGoal(dailyCalorieGoal, goalMode);
    if (calorieError) newErrors.dailyCalorieGoal = calorieError;

    // Only validate workouts if enabled
    if (workoutsEnabled) {
      const workoutsError = validateWorkoutsPerWeek(workoutsPerWeek);
      if (workoutsError) newErrors.workoutsPerWeek = workoutsError;
    }

    const weightError = validateWeightGoal(weightGoal);
    if (weightError) newErrors.weightGoal = weightError;

    const dateError = validateWeightTargetDate(weightTargetDate);
    if (dateError) newErrors.weightTargetDate = dateError;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      Object.keys(newErrors).forEach((field) => {
        onboardingAnalytics.validationError(field);
      });
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      // Convert weight to pounds if metric
      let weightGoalLb = Number(weightGoal);
      if (units === 'metric') {
        weightGoalLb = Number(weightGoal) * 2.20462;
      }

      // Update profile
      await updateMyProfile({
        uid: user.uid,
        dailyCalorieGoal: Number(dailyCalorieGoal),
        workoutsPerWeek: workoutsEnabled && workoutsPerWeek ? Number(workoutsPerWeek) : null,
        weightGoal: weightGoalLb,
        weightTargetDate: weightTargetDate.trim(),
        logCaloriesDaysPerWeek: caloriesTrackingEnabled ? logCaloriesDaysPerWeek : null,
        logWeightDaysPerWeek: weightTrackingEnabled ? logWeightDaysPerWeek : null,
      });

      // Update goalMode and units directly
      if (db) {
        await setDoc(
          doc(db, 'users', user.uid),
          {
            goalMode,
            units,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await updateOnboardingStep(user.uid, 4);
      onboardingAnalytics.goalsSaved();
      onboardingAnalytics.continue(4, 5);
      navigation.navigate('Finish');
    } catch (error) {
      console.error('[Onboarding] Error saving goals:', error);
      setErrors({ general: 'Failed to save. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const workoutOptions = [1, 2, 3, 4, 5, 6, 7];
  const loggingDaysOptions = [1, 2, 3, 4, 5, 6, 7];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <OnboardingHeader currentStep={4} totalSteps={5} showBack={true} onBack={handleBack} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.textContainer}>
            <Text variant="headlineLarge" style={[styles.headline, { color: theme.colors.onSurface }]}>
              {onboardingCopy.goals.headline}
            </Text>
            <Text variant="bodyLarge" style={[styles.subtext, { color: theme.colors.onSurfaceVariant }]}>
              {onboardingCopy.goals.subtext}
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.segmentedContainer}>
              <Text variant="labelLarge" style={{ color: theme.colors.onSurface, marginBottom: 8 }}>
                Goal mode
              </Text>
              <SegmentedButtons
                value={goalMode}
                onValueChange={(value) => {
                  setGoalMode(value as any);
                  if (errors.goalMode) setErrors({ ...errors, goalMode: '' });
                }}
                buttons={[
                  { value: 'cut', label: 'Cut' },
                  { value: 'bulk', label: 'Bulk' },
                  { value: 'maintenance', label: 'Maintenance' },
                ]}
                style={styles.segmented}
              />
              {errors.goalMode ? (
                <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
                  {errors.goalMode}
                </Text>
              ) : null}
            </View>

            <TextInput
              label="Daily calorie goal"
              value={dailyCalorieGoal}
              onChangeText={(text) => {
                setDailyCalorieGoal(text.replace(/[^0-9]/g, ''));
                if (errors.dailyCalorieGoal) setErrors({ ...errors, dailyCalorieGoal: '' });
              }}
              error={!!errors.dailyCalorieGoal}
              disabled={isSubmitting}
              keyboardType="number-pad"
              style={styles.input}
            />
            {errors.dailyCalorieGoal ? (
              <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
                {errors.dailyCalorieGoal}
              </Text>
            ) : null}

            <View style={styles.toggleContainer}>
              <View style={styles.toggleRow}>
                <Text variant="labelLarge" style={{ color: theme.colors.onSurface, flex: 1 }}>
                  Track Workouts
                </Text>
                <Switch
                  value={workoutsEnabled}
                  onValueChange={(value) => {
                    setWorkoutsEnabled(value);
                    if (!value) {
                      setWorkoutsPerWeek('');
                      setErrors({ ...errors, workoutsPerWeek: '' });
                    }
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                />
              </View>
            </View>
            {workoutsEnabled && (
              <View style={styles.chipContainer}>
                <Text variant="labelLarge" style={{ color: theme.colors.onSurface, marginBottom: 8 }}>
                  Workouts per week
                </Text>
                <View style={styles.chipRow}>
                  {workoutOptions.map((num) => (
                    <Chip
                      key={num}
                      selected={workoutsPerWeek === String(num)}
                      onPress={() => {
                        setWorkoutsPerWeek(String(num));
                        if (errors.workoutsPerWeek) setErrors({ ...errors, workoutsPerWeek: '' });
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={styles.chip}
                    >
                      {num}
                    </Chip>
                  ))}
                </View>
                {errors.workoutsPerWeek ? (
                  <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
                    {errors.workoutsPerWeek}
                  </Text>
                ) : null}
              </View>
            )}

            <TextInput
              label={units === 'imperial' ? 'Weight goal (lbs)' : 'Weight goal (kg)'}
              value={weightGoal}
              onChangeText={(text) => {
                setWeightGoal(text.replace(/[^0-9.]/g, ''));
                if (errors.weightGoal) setErrors({ ...errors, weightGoal: '' });
              }}
              error={!!errors.weightGoal}
              disabled={isSubmitting}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            {errors.weightGoal ? (
              <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
                {errors.weightGoal}
              </Text>
            ) : null}

            <TextInput
              label="Target date (YYYY-MM-DD)"
              value={weightTargetDate}
              onChangeText={(text) => {
                setWeightTargetDate(text);
                if (errors.weightTargetDate) setErrors({ ...errors, weightTargetDate: '' });
              }}
              error={!!errors.weightTargetDate}
              disabled={isSubmitting}
              placeholder="2026-12-31"
              style={styles.input}
            />
            {errors.weightTargetDate ? (
              <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
                {errors.weightTargetDate}
              </Text>
            ) : null}

            <View style={styles.toggleContainer}>
              <View style={styles.toggleRow}>
                <Text variant="labelLarge" style={{ color: theme.colors.onSurface, flex: 1 }}>
                  Track Calories
                </Text>
                <Switch
                  value={caloriesTrackingEnabled}
                  onValueChange={(value) => {
                    setCaloriesTrackingEnabled(value);
                    if (!value) {
                      setLogCaloriesDaysPerWeek(null);
                    }
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                />
              </View>
            </View>
            {caloriesTrackingEnabled && (
              <View style={styles.chipContainer}>
                <Text variant="labelLarge" style={{ color: theme.colors.onSurface, marginBottom: 8 }}>
                  Log calories days/week
                </Text>
                <View style={styles.chipRow}>
                  {loggingDaysOptions.map((num) => (
                    <Chip
                      key={num}
                      selected={logCaloriesDaysPerWeek === num}
                      onPress={() => {
                        setLogCaloriesDaysPerWeek(logCaloriesDaysPerWeek === num ? null : num);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={styles.chip}
                    >
                      {num}
                    </Chip>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.toggleContainer}>
              <View style={styles.toggleRow}>
                <Text variant="labelLarge" style={{ color: theme.colors.onSurface, flex: 1 }}>
                  Track Weight
                </Text>
                <Switch
                  value={weightTrackingEnabled}
                  onValueChange={(value) => {
                    setWeightTrackingEnabled(value);
                    if (!value) {
                      setLogWeightDaysPerWeek(null);
                    }
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                />
              </View>
            </View>
            {weightTrackingEnabled && (
              <View style={styles.chipContainer}>
                <Text variant="labelLarge" style={{ color: theme.colors.onSurface, marginBottom: 8 }}>
                  Log weight days/week
                </Text>
                <View style={styles.chipRow}>
                  {loggingDaysOptions.map((num) => (
                    <Chip
                      key={num}
                      selected={logWeightDaysPerWeek === num}
                      onPress={() => {
                        setLogWeightDaysPerWeek(logWeightDaysPerWeek === num ? null : num);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={styles.chip}
                    >
                      {num}
                    </Chip>
                  ))}
                </View>
              </View>
            )}

            {errors.general ? (
              <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
                {errors.general}
              </Text>
            ) : null}
          </View>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: theme.colors.background }]}>
          <PrimaryButton
            onPress={handleContinue}
            style={styles.button}
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Continue
          </PrimaryButton>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 16,
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
  form: {
    gap: 16,
  },
  input: {
    marginBottom: 4,
  },
  segmentedContainer: {
    marginBottom: 8,
  },
  segmented: {
    marginBottom: 4,
  },
  toggleContainer: {
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chipContainer: {
    marginBottom: 16,
    marginLeft: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    marginBottom: 4,
  },
  error: {
    marginTop: -12,
    marginBottom: 8,
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
