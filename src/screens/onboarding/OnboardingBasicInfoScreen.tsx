import React, { useContext, useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Dimensions, Keyboard } from 'react-native';
import { Text, TextInput, useTheme, SegmentedButtons } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

import { AuthContext } from '../../store/AuthContext';
import { OnboardingStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import OnboardingSection from '../../components/onboarding/OnboardingSection';
import ReadOnlyRow from '../../components/onboarding/ReadOnlyRow';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { updateOnboardingStep } from '../../services/onboarding';
import { updateMyProfile } from '../../services/profile';
import { onboardingAnalytics } from '../../services/analytics';
import { onboardingCopy } from '../../constants/onboardingCopy';
import { subscribeMyProfile } from '../../services/profile';
import { db } from '../../firebase/firebase';

const SCREEN_WIDTH = Dimensions.get('window').width;
const IS_SMALL_SCREEN = SCREEN_WIDTH < 360;

type Props = NativeStackScreenProps<OnboardingStackParamList, 'BasicInfo'>;

export default function OnboardingBasicInfoScreen({ navigation }: Props) {
  const theme = useTheme();
  const { user } = useContext(AuthContext);

  const [displayName, setDisplayName] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | 'other' | ''>('');
  const [age, setAge] = useState('');
  const [units, setUnits] = useState<'imperial' | 'metric'>('imperial');
  const [height, setHeight] = useState('');
  const [weightCurrent, setWeightCurrent] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Refs for keyboard navigation
  const ageInputRef = useRef<any>(null);
  const heightInputRef = useRef<any>(null);
  const weightInputRef = useRef<any>(null);

  // Prefill from existing profile
  useEffect(() => {
    if (!user?.uid) return;

    return subscribeMyProfile(user.uid, (profile) => {
      if (profile) {
        if (profile.displayName) setDisplayName(profile.displayName);
        if (profile.age != null) setAge(String(profile.age));
        if (profile.height != null) setHeight(String(profile.height));
        if (profile.weightCurrent != null) setWeightCurrent(String(profile.weightCurrent));
        // @ts-ignore - units might exist
        if (profile.units) setUnits(profile.units);
        // @ts-ignore - sex might exist
        if (profile.sex) setSex(profile.sex);
      }
    });
  }, [user?.uid]);

  useEffect(() => {
    onboardingAnalytics.screenView(2, 'BasicInfo', 1);
  }, []);

  const validateDisplayName = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return 'Display name is required';
    if (trimmed.length < 2) return 'Display name must be at least 2 characters';
    if (trimmed.length > 32) return 'Display name must be 32 characters or less';
    return null;
  };

  const validateAge = (value: string): string | null => {
    const num = Number(value);
    if (!value.trim()) return 'Age is required';
    if (!Number.isFinite(num) || num < 13 || num > 99) return 'Age must be between 13 and 99';
    return null;
  };

  const validateHeight = (value: string): string | null => {
    const num = Number(value);
    if (!value.trim()) return 'Height is required';
    if (!Number.isFinite(num)) return 'Height must be a valid number';
    
    if (units === 'imperial') {
      // Convert to inches: 4'0" = 48", 7'6" = 90"
      if (num < 48 || num > 90) return 'Height must be between 4\'0" and 7\'6"';
    } else {
      // Metric: 120-230 cm
      if (num < 120 || num > 230) return 'Height must be between 120 and 230 cm';
    }
    return null;
  };

  const validateWeightCurrent = (value: string): string | null => {
    if (!value.trim()) return null; // Optional
    const num = Number(value);
    if (!Number.isFinite(num)) return 'Weight must be a valid number';
    
    if (units === 'imperial') {
      if (num < 80 || num > 450) return 'Weight must be between 80 and 450 lbs';
    } else {
      if (num < 35 || num > 205) return 'Weight must be between 35 and 205 kg';
    }
    return null;
  };

  const handleContinue = async () => {
    if (!user?.uid) return;

    // Dismiss keyboard
    Keyboard.dismiss();

    const newErrors: Record<string, string> = {};

    // Validate all fields
    const displayNameError = validateDisplayName(displayName);
    if (displayNameError) newErrors.displayName = displayNameError;

    if (!sex) newErrors.sex = 'Please select your sex';

    const ageError = validateAge(age);
    if (ageError) newErrors.age = ageError;

    const heightError = validateHeight(height);
    if (heightError) newErrors.height = heightError;

    const weightError = validateWeightCurrent(weightCurrent);
    if (weightError) newErrors.weightCurrent = weightError;

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
      // Convert height to inches if metric
      let heightInches = Number(height);
      if (units === 'metric') {
        // Convert cm to inches: 1 cm = 0.393701 inches
        heightInches = Number(height) * 0.393701;
      }

      // Convert weight to pounds if metric
      let weightLb: number | null = null;
      if (weightCurrent.trim()) {
        weightLb = Number(weightCurrent);
        if (units === 'metric') {
          // Convert kg to lbs: 1 kg = 2.20462 lbs
          weightLb = Number(weightCurrent) * 2.20462;
        }
      }

      // Update profile
      await updateMyProfile({
        uid: user.uid,
        displayName: displayName.trim(),
        age: Number(age),
        height: heightInches,
        weightCurrent: weightLb,
      });

      // Update additional fields directly (not in updateMyProfile yet)
      if (db) {
        await setDoc(
          doc(db, 'users', user.uid),
          {
            sex,
            units,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await updateOnboardingStep(user.uid, 2);
      onboardingAnalytics.basicInfoSaved();
      onboardingAnalytics.continue(2, 3);
      navigation.navigate('Accountability');
    } catch (error) {
      console.error('[Onboarding] Error saving basic info:', error);
      setErrors({ general: 'Failed to save. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <OnboardingHeader currentStep={2} totalSteps={5} showBack={true} onBack={handleBack} />
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
              {onboardingCopy.basicInfo.headline}
            </Text>
            <Text variant="bodyLarge" style={[styles.subtext, { color: theme.colors.onSurfaceVariant }]}>
              {onboardingCopy.basicInfo.subtext}
            </Text>
          </View>

          <View style={styles.form}>
            {/* Account Section */}
            <OnboardingSection title="Account" showDivider={true}>
              <TextInput
                label="Display name"
                value={displayName}
                onChangeText={(text) => {
                  setDisplayName(text);
                  if (errors.displayName) setErrors({ ...errors, displayName: '' });
                }}
                error={!!errors.displayName}
                disabled={isSubmitting}
                style={styles.input}
                returnKeyType="next"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              {errors.displayName ? (
                <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
                  {errors.displayName}
                </Text>
              ) : null}

              <ReadOnlyRow label="Email" value={user?.email || ''} />
            </OnboardingSection>

            {/* Preferences Section */}
            <OnboardingSection title="Preferences" showDivider={true}>
              <View style={styles.segmentedContainer}>
                <Text variant="labelMedium" style={[styles.segmentedLabel, { color: theme.colors.onSurface }]}>
                  Sex
                </Text>
                <SegmentedButtons
                  value={sex}
                  onValueChange={(value) => {
                    setSex(value as any);
                    if (errors.sex) setErrors({ ...errors, sex: '' });
                  }}
                  buttons={[
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                    { value: 'other', label: 'Other' },
                  ]}
                  style={styles.segmented}
                  density="medium"
                />
                {errors.sex ? (
                  <Text variant="bodySmall" style={[styles.error, styles.sexError, { color: theme.colors.error }]}>
                    {errors.sex}
                  </Text>
                ) : null}
              </View>

              <View style={styles.segmentedContainer}>
                <Text variant="labelMedium" style={[styles.segmentedLabel, { color: theme.colors.onSurface }]}>
                  Units
                </Text>
                <SegmentedButtons
                  value={units}
                  onValueChange={setUnits}
                  buttons={[
                    { value: 'imperial', label: 'Imperial' },
                    { value: 'metric', label: 'Metric' },
                  ]}
                  style={styles.segmented}
                  density="medium"
                />
              </View>
            </OnboardingSection>

            {/* Body Section */}
            <OnboardingSection title="Body" showDivider={false}>
              {IS_SMALL_SCREEN ? (
                // Single column for small screens
                <>
                  <TextInput
                    label="Age"
                    value={age}
                    onChangeText={(text) => {
                      setAge(text.replace(/[^0-9]/g, ''));
                      if (errors.age) setErrors({ ...errors, age: '' });
                    }}
                    error={!!errors.age}
                    disabled={isSubmitting}
                    keyboardType="number-pad"
                    style={styles.input}
                    returnKeyType="next"
                    ref={ageInputRef}
                    onSubmitEditing={() => heightInputRef.current?.focus()}
                  />
                  {errors.age ? (
                    <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
                      {errors.age}
                    </Text>
                  ) : null}

                  <View>
                    <TextInput
                      label="Height"
                      value={height}
                      onChangeText={(text) => {
                        setHeight(text.replace(/[^0-9.]/g, ''));
                        if (errors.height) setErrors({ ...errors, height: '' });
                      }}
                      error={!!errors.height}
                      disabled={isSubmitting}
                      keyboardType="decimal-pad"
                      style={styles.input}
                      returnKeyType="next"
                      ref={heightInputRef}
                      onSubmitEditing={() => weightInputRef.current?.focus()}
                    />
                    <Text variant="bodySmall" style={[styles.unitText, { color: theme.colors.onSurfaceVariant }]}>
                      {units === 'imperial' ? 'in' : 'cm'}
                    </Text>
                    {errors.height ? (
                      <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
                        {errors.height}
                      </Text>
                    ) : null}
                  </View>

                  <View>
                    <TextInput
                      label="Current weight"
                      value={weightCurrent}
                      onChangeText={(text) => {
                        setWeightCurrent(text.replace(/[^0-9.]/g, ''));
                        if (errors.weightCurrent) setErrors({ ...errors, weightCurrent: '' });
                      }}
                      error={!!errors.weightCurrent}
                      disabled={isSubmitting}
                      keyboardType="decimal-pad"
                      style={styles.input}
                      returnKeyType="done"
                      ref={weightInputRef}
                      onSubmitEditing={handleContinue}
                    />
                    <Text variant="bodySmall" style={[styles.unitText, { color: theme.colors.onSurfaceVariant }]}>
                      {units === 'imperial' ? 'lbs' : 'kg'} • Optional — helps tailor targets
                    </Text>
                    {errors.weightCurrent ? (
                      <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
                        {errors.weightCurrent}
                      </Text>
                    ) : null}
                  </View>
                </>
              ) : (
                // Two column layout for larger screens
                <>
                  <View style={styles.twoColumnRow}>
                    <View style={styles.column}>
                      <TextInput
                        label="Age"
                        value={age}
                        onChangeText={(text) => {
                          setAge(text.replace(/[^0-9]/g, ''));
                          if (errors.age) setErrors({ ...errors, age: '' });
                        }}
                        error={!!errors.age}
                        disabled={isSubmitting}
                        keyboardType="number-pad"
                        style={styles.input}
                        returnKeyType="next"
                        ref={ageInputRef}
                        onSubmitEditing={() => heightInputRef.current?.focus()}
                      />
                      {errors.age ? (
                        <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
                          {errors.age}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.column}>
                      <View>
                        <TextInput
                          label="Height"
                          value={height}
                          onChangeText={(text) => {
                            setHeight(text.replace(/[^0-9.]/g, ''));
                            if (errors.height) setErrors({ ...errors, height: '' });
                          }}
                          error={!!errors.height}
                          disabled={isSubmitting}
                          keyboardType="decimal-pad"
                          style={styles.input}
                          returnKeyType="next"
                          ref={heightInputRef}
                          onSubmitEditing={() => weightInputRef.current?.focus()}
                        />
                        <Text variant="bodySmall" style={[styles.unitText, { color: theme.colors.onSurfaceVariant }]}>
                          {units === 'imperial' ? 'in' : 'cm'}
                        </Text>
                        {errors.height ? (
                          <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
                            {errors.height}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  <View>
                    <TextInput
                      label="Current weight"
                      value={weightCurrent}
                      onChangeText={(text) => {
                        setWeightCurrent(text.replace(/[^0-9.]/g, ''));
                        if (errors.weightCurrent) setErrors({ ...errors, weightCurrent: '' });
                      }}
                      error={!!errors.weightCurrent}
                      disabled={isSubmitting}
                      keyboardType="decimal-pad"
                      style={styles.input}
                      returnKeyType="done"
                      ref={weightInputRef}
                      onSubmitEditing={handleContinue}
                    />
                    <Text variant="bodySmall" style={[styles.unitText, { color: theme.colors.onSurfaceVariant }]}>
                      {units === 'imperial' ? 'lbs' : 'kg'} • Optional — helps tailor targets
                    </Text>
                    {errors.weightCurrent ? (
                      <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
                        {errors.weightCurrent}
                      </Text>
                    ) : null}
                  </View>
                </>
              )}

              {errors.general ? (
                <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
                  {errors.general}
                </Text>
              ) : null}
            </OnboardingSection>
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
    flex: 1,
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
    gap: 0,
  },
  input: {
    marginBottom: 4,
  },
  segmentedContainer: {
    marginBottom: 0,
  },
  segmentedLabel: {
    marginBottom: 6,
    fontWeight: '500',
  },
  segmented: {
    marginBottom: 0,
  },
  error: {
    marginTop: 4,
    marginBottom: 0,
  },
  sexError: {
    marginTop: 4,
    marginBottom: 0,
  },
  helperText: {
    marginTop: 4,
    fontSize: 12,
    opacity: 0.7,
  },
  unitText: {
    marginTop: 4,
    fontSize: 12,
    opacity: 0.6,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  column: {
    flex: 1,
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
