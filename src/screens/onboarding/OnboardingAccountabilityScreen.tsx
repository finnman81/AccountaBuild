import React, { useContext, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthContext } from '../../store/AuthContext';
import { OnboardingStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import EvidenceCard from '../../components/onboarding/EvidenceCard';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { updateOnboardingStep } from '../../services/onboarding';
import { onboardingAnalytics } from '../../services/analytics';
import { onboardingCopy } from '../../constants/onboardingCopy';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Accountability'>;

export default function OnboardingAccountabilityScreen({ navigation }: Props) {
  const theme = useTheme();
  const { user } = useContext(AuthContext);

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
      navigation.navigate('Finish');
    } catch (error) {
      console.error('[Onboarding] Error saving step:', error);
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <OnboardingHeader currentStep={5} totalSteps={6} showBack={true} onBack={handleBack} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.textContainer}>
          <Text variant="headlineLarge" style={[styles.headline, { color: theme.colors.onSurface }]}>
            {onboardingCopy.accountability.headline}
          </Text>
          <Text variant="bodyLarge" style={[styles.subtext, { color: theme.colors.onSurfaceVariant }]}>
            {onboardingCopy.accountability.subtext}
          </Text>
        </View>

        <View style={styles.evidenceContainer}>
          <EvidenceCard
            primaryStat={onboardingCopy.accountability.primaryStat}
            statHighlight={onboardingCopy.accountability.statHighlight}
            citation={onboardingCopy.accountability.citation}
            supportingLine={onboardingCopy.accountability.supportingLine}
          />
        </View>

        <Text variant="bodyMedium" style={[styles.productTieIn, { color: theme.colors.onSurfaceVariant }]}>
          {onboardingCopy.accountability.productTieIn}
        </Text>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.colors.background }]}>
        <PrimaryButton onPress={handleContinue} style={styles.button}>
          Continue
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
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 16,
  },
  textContainer: {
    marginBottom: 24,
  },
  headline: {
    marginBottom: 12,
    fontWeight: '600',
  },
  subtext: {
    lineHeight: 24,
  },
  evidenceContainer: {
    marginVertical: 24,
  },
  productTieIn: {
    marginTop: 16,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.8,
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
