import React, { useContext, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

import { AuthContext } from '../../store/AuthContext';
import { OnboardingStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import AppText from '../../components/ui/AppText';
import TextField from '../../components/ui/TextField';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { updateOnboardingStep } from '../../services/onboarding';
import { updateMyProfile, subscribeMyProfile } from '../../services/profile';
import { onboardingAnalytics } from '../../services/analytics';
import { onboardingCopy } from '../../constants/onboardingCopy';
import { db } from '../../firebase/firebase';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'BasicInfo'>;

/**
 * Three things: a name, units, and a starting weight (optional).
 *
 * It used to ask for sex, age and height too, on one long page, and it was
 * the only step anyone quit on (2 of 17 signups after the App Store launch).
 * Those three only feed the calorie estimate, so they moved to the targets
 * step, where they are optional and sit next to the number they change.
 */
export default function OnboardingBasicInfoScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);

  const [displayName, setDisplayName] = useState('');
  const [units, setUnits] = useState<'imperial' | 'metric'>('imperial');
  const [weightCurrent, setWeightCurrent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Prefill from an existing profile (re-onboarding).
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyProfile(user.uid, (profile) => {
      if (!profile) return;
      if (profile.displayName) setDisplayName(profile.displayName);
      const u = (profile as any).units === 'metric' ? 'metric' : 'imperial';
      setUnits(u);
      // Stored in pounds.
      if (profile.weightCurrent != null) {
        const lb = Number(profile.weightCurrent);
        setWeightCurrent(String(u === 'metric' ? Math.round((lb / 2.20462) * 10) / 10 : Math.round(lb * 10) / 10));
      }
    });
  }, [user?.uid]);

  useEffect(() => {
    onboardingAnalytics.screenView(2, 'BasicInfo', 1);
  }, []);

  const handleContinue = async () => {
    if (!user?.uid) return;
    Keyboard.dismiss();

    const next: Record<string, string> = {};
    const name = displayName.trim();
    if (!name) next.displayName = 'Add a name your group will know you by.';
    else if (name.length < 2) next.displayName = 'Use at least 2 characters.';
    else if (name.length > 32) next.displayName = 'Use 32 characters or fewer.';

    const w = Number(weightCurrent);
    if (weightCurrent.trim()) {
      if (!Number.isFinite(w)) next.weightCurrent = 'Enter a number.';
      else if (units === 'imperial' && (w < 80 || w > 450)) next.weightCurrent = 'Enter a weight from 80 to 450 lbs.';
      else if (units === 'metric' && (w < 35 || w > 205)) next.weightCurrent = 'Enter a weight from 35 to 205 kg.';
    }
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    try {
      await updateMyProfile({
        uid: user.uid,
        displayName: name,
        ...(weightCurrent.trim() ? { weightCurrent: units === 'metric' ? w * 2.20462 : w } : {}),
      });
      if (db) await setDoc(doc(db, 'users', user.uid), { units, updatedAt: serverTimestamp() }, { merge: true });

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await updateOnboardingStep(user.uid, 2);
      onboardingAnalytics.basicInfoSaved();
      onboardingAnalytics.continue(2, 3);
      navigation.navigate('Recommended');
    } catch (error) {
      console.error('[Onboarding] Error saving basic info:', error);
      setErrors({ general: "Couldn't save. Try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <OnboardingHeader currentStep={3} totalSteps={7} showBack onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <AppText variant="pageTitle" color="primary">{onboardingCopy.basicInfo.headline}</AppText>
          <AppText variant="body" color="secondary" style={styles.subtext}>{onboardingCopy.basicInfo.subtext}</AppText>

          <View style={styles.form}>
            <TextField
              label="Name"
              value={displayName}
              onChangeText={(t) => {
                setDisplayName(t);
                if (errors.displayName) setErrors({ ...errors, displayName: '' });
              }}
              error={errors.displayName || undefined}
              editable={!isSubmitting}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />

            <View>
              <AppText variant="eyebrow" color="muted" style={styles.label}>Units</AppText>
              <SegmentedControl
                variant="primary"
                value={units}
                onChange={(u) => {
                  if (u === units) return;
                  // Keep the weight they typed, in the new unit.
                  const n = Number(weightCurrent);
                  if (weightCurrent.trim() && Number.isFinite(n)) {
                    setWeightCurrent(String(Math.round((u === 'metric' ? n / 2.20462 : n * 2.20462) * 10) / 10));
                  }
                  setUnits(u);
                }}
                options={[
                  { value: 'imperial', label: 'Pounds' },
                  { value: 'metric', label: 'Kilograms' },
                ]}
              />
            </View>

            <View>
              <TextField
                label={`Current weight (${units === 'imperial' ? 'lbs' : 'kg'})`}
                value={weightCurrent}
                onChangeText={(t) => {
                  setWeightCurrent(t.replace(/[^0-9.]/g, ''));
                  if (errors.weightCurrent) setErrors({ ...errors, weightCurrent: '' });
                }}
                error={errors.weightCurrent || undefined}
                editable={!isSubmitting}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={handleContinue}
              />
              <AppText variant="rowSubtitle" color="muted" style={styles.hint}>
                Optional. It is your starting point, and only you see the number.
              </AppText>
            </View>

            {errors.general ? <AppText variant="rowSubtitle" color="danger">{errors.general}</AppText> : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton onPress={handleContinue} loading={isSubmitting} disabled={isSubmitting}>Continue</PrimaryButton>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.base },
  subtext: { marginTop: spacing.sm, lineHeight: 21 },
  form: { marginTop: spacing.xl, gap: spacing.lg },
  label: { marginBottom: spacing.sm },
  hint: { marginTop: spacing.xs, lineHeight: 18 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.base, paddingTop: spacing.md },
});
