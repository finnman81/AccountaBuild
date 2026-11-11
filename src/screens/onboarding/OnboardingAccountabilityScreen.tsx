import React, { useContext, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthContext } from '../../store/AuthContext';
import { OnboardingStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import EvidenceCard from '../../components/onboarding/EvidenceCard';
import PrimaryButton from '../../components/ui/PrimaryButton';
import AppText from '../../components/ui/AppText';
import { updateOnboardingStep } from '../../services/onboarding';
import { onboardingAnalytics } from '../../services/analytics';
import { onboardingCopy } from '../../constants/onboardingCopy';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Accountability'>;

/** Why a group: the one study number, then on to joining or starting one. */
export default function OnboardingAccountabilityScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const copy = onboardingCopy.accountability;

  useEffect(() => {
    onboardingAnalytics.screenView(3, 'Accountability', 1);
    onboardingAnalytics.transitionViewed();
  }, []);

  const handleContinue = async () => {
    if (!user?.uid) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await updateOnboardingStep(user.uid, 3);
      onboardingAnalytics.continue(3, 4);
      navigation.navigate('Group');
    } catch (error) {
      console.error('[Onboarding] Error saving step:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <OnboardingHeader currentStep={5} totalSteps={7} showBack onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText variant="pageTitle" color="primary">{copy.headline}</AppText>
        <AppText variant="body" color="secondary" style={styles.subtext}>{copy.subtext}</AppText>

        <View style={styles.evidence}>
          <EvidenceCard win={copy.win} lose={copy.lose} citation={copy.citation} />
        </View>

        <AppText variant="body" color="secondary" style={styles.subtext}>{copy.supportingLine}</AppText>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton onPress={handleContinue}>{copy.cta}</PrimaryButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.base },
  subtext: { marginTop: spacing.sm, lineHeight: 21 },
  evidence: { marginTop: spacing.xl, marginBottom: spacing.base },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.base, paddingTop: spacing.md },
});
