import React, { useContext, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Icon } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

import { AuthContext } from '../../store/AuthContext';
import { OnboardingStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import AppText from '../../components/ui/AppText';
import { updateOnboardingStep } from '../../services/onboarding';
import { onboardingAnalytics } from '../../services/analytics';
import { onboardingCopy } from '../../constants/onboardingCopy';
import { db } from '../../firebase/firebase';
import { colors, spacing, radius } from '../../theme';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Goals'>;

/**
 * "What are you training for?" — intent picker (design 02). Each intent seeds
 * sensible default goals (goalMode + calorie/workout targets); the user tunes
 * details later in Edit Profile, so onboarding stays low-friction.
 */
export default function OnboardingGoalsScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { goalsIntent } = onboardingCopy;

  const [selected, setSelected] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onboardingAnalytics.screenView(2, 'Goals', 1);
  }, []);

  const handleSelect = (key: string) => {
    setSelected(key);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleContinue = async () => {
    if (!user?.uid || !selected) return;
    const option = goalsIntent.options.find((o) => o.key === selected);
    if (!option) return;

    setIsSubmitting(true);
    try {
      // Only record the intent here. Actual calorie/workout targets are
      // computed on the Recommended screen after Basic Info, so they can be
      // personalized (and so re-onboarded users' existing goals survive).
      if (db) {
        await setDoc(
          doc(db, 'users', user.uid),
          { goalMode: option.defaults.goalMode, trainingIntent: option.key, updatedAt: serverTimestamp() },
          { merge: true },
        );
      }
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await updateOnboardingStep(user.uid, 1);
      onboardingAnalytics.continue(1, 2);
      navigation.navigate('MMRIntro');
    } catch (error) {
      console.error('[Onboarding] Error saving intent:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <OnboardingHeader currentStep={1} totalSteps={6} showBack onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText variant="pageTitle" color="primary" style={styles.headline}>
          {goalsIntent.headline}
        </AppText>
        <AppText variant="body" color="secondary" style={styles.subtext}>
          {goalsIntent.subtext}
        </AppText>

        <View style={styles.cards}>
          {goalsIntent.options.map((opt) => {
            const isSel = selected === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                activeOpacity={0.8}
                onPress={() => handleSelect(opt.key)}
                style={[styles.card, isSel && styles.cardSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSel }}
              >
                <View style={[styles.iconTile, isSel && styles.iconTileSelected]}>
                  <Icon source={opt.icon} size={22} color={isSel ? colors.primary : colors.textSecondary} />
                </View>
                <View style={styles.cardText}>
                  <AppText variant="rowTitle" color="primary">{opt.title}</AppText>
                  <AppText variant="rowSubtitle" color="muted">{opt.subtitle}</AppText>
                </View>
                <View style={[styles.radio, isSel && styles.radioSelected]}>
                  {isSel && <Icon source="check" size={14} color="#FFFFFF" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton onPress={handleContinue} loading={isSubmitting} disabled={!selected || isSubmitting} style={styles.button}>
          {goalsIntent.cta}
        </PrimaryButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.base },
  headline: { fontSize: 26, fontWeight: '800' },
  subtext: { marginTop: spacing.sm, lineHeight: 20 },
  cards: { marginTop: spacing.xl, gap: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.listGroup,
    borderWidth: 1,
    borderColor: colors.borderCard,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  cardSelected: {
    borderColor: 'rgba(62,139,255,0.5)',
    backgroundColor: colors.surface2,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.tile,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTileSelected: { backgroundColor: colors.primaryTint },
  cardText: { flex: 1, gap: 2 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.base, paddingTop: spacing.md },
  button: { width: '100%' },
});
