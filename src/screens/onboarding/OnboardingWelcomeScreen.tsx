import React, { useContext, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, FadeInDown } from 'react-native-reanimated';

import { AuthContext } from '../../store/AuthContext';
import { OnboardingStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import WelcomeHeroCard from '../../components/onboarding/WelcomeHeroCard';
import { updateOnboardingStep } from '../../services/onboarding';
import { onboardingAnalytics } from '../../services/analytics';
import { onboardingCopy } from '../../constants/onboardingCopy';
import type { Tier } from '../../mmr/types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Welcome'>;

export default function OnboardingWelcomeScreen({ navigation }: Props) {
  const theme = useTheme();
  const { user } = useContext(AuthContext);

  // Animation values
  const heroOpacity = useSharedValue(0);
  const heroTranslateY = useSharedValue(20);
  const buttonOpacity = useSharedValue(0);

  useEffect(() => {
    onboardingAnalytics.screenView(1, 'Welcome', 1);
    
    // Animate hero card in
    heroOpacity.value = withDelay(200, withTiming(1, { duration: 600 }));
    heroTranslateY.value = withDelay(200, withTiming(0, { duration: 600 }));
    
    // Animate button in
    buttonOpacity.value = withDelay(400, withTiming(1, { duration: 500 }));
  }, []);

  const heroAnimatedStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ translateY: heroTranslateY.value }],
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
  }));

  const handleContinue = async () => {
    if (!user?.uid) return;

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await updateOnboardingStep(user.uid, 1);
      onboardingAnalytics.continue(1, 2);
      navigation.navigate('BasicInfo');
    } catch (error) {
      console.error('[Onboarding] Error saving step:', error);
    }
  };

  // Default hero card values (example data)
  const defaultRank: Tier = 'Bronze';
  const defaultWorkouts = { current: 3, target: 4 };
  const defaultCalories = { current: 5, target: 7 };
  const defaultWeightLogged = true;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <OnboardingHeader currentStep={1} totalSteps={5} showBack={false} onBack={() => {}} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.textContainer}>
          <Text variant="headlineLarge" style={[styles.headline, { color: theme.colors.onSurface }]}>
            {onboardingCopy.welcome.headline}
          </Text>
          <Text variant="bodyLarge" style={[styles.subtext, { color: theme.colors.onSurfaceVariant }]}>
            {onboardingCopy.welcome.subtext}
          </Text>
          <Text variant="bodySmall" style={[styles.credibilityLine, { color: theme.colors.onSurfaceVariant }]}>
            {onboardingCopy.welcome.credibilityLine}
          </Text>
        </View>

        <Animated.View style={heroAnimatedStyle}>
          <WelcomeHeroCard
            rankLabel={defaultRank}
            workouts={defaultWorkouts}
            calories={defaultCalories}
            weightLogged={defaultWeightLogged}
          />
        </Animated.View>
      </ScrollView>

      <Animated.View style={[styles.footer, buttonAnimatedStyle, { backgroundColor: theme.colors.background }]}>
        <PrimaryButton onPress={handleContinue} style={styles.button}>
          {onboardingCopy.welcome.cta}
        </PrimaryButton>
        <Text variant="bodySmall" style={[styles.buttonSubtext, { color: theme.colors.onSurfaceVariant }]}>
          {onboardingCopy.welcome.ctaSubtext}
        </Text>
      </Animated.View>
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
    paddingTop: 24,
  },
  textContainer: {
    marginBottom: 16,
  },
  headline: {
    marginBottom: 12,
    fontWeight: '600',
  },
  subtext: {
    lineHeight: 24,
    marginBottom: 8,
  },
  credibilityLine: {
    marginTop: 4,
    opacity: 0.7,
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 16,
    alignItems: 'center',
  },
  button: {
    minHeight: 48,
    width: '100%',
  },
  buttonSubtext: {
    marginTop: 8,
    fontSize: 11,
    opacity: 0.6,
  },
});
