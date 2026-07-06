import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from './types';
import OnboardingWelcomeScreen from '../screens/onboarding/OnboardingWelcomeScreen';
import OnboardingGoalsScreen from '../screens/onboarding/OnboardingGoalsScreen';
import OnboardingMMRScreen from '../screens/onboarding/OnboardingMMRScreen';
import OnboardingBasicInfoScreen from '../screens/onboarding/OnboardingBasicInfoScreen';
import OnboardingRecommendedScreen from '../screens/onboarding/OnboardingRecommendedScreen';
import OnboardingAccountabilityScreen from '../screens/onboarding/OnboardingAccountabilityScreen';
import OnboardingFinishScreen from '../screens/onboarding/OnboardingFinishScreen';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export default function OnboardingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={OnboardingWelcomeScreen} />
      <Stack.Screen name="Goals" component={OnboardingGoalsScreen} />
      <Stack.Screen name="MMRIntro" component={OnboardingMMRScreen} />
      <Stack.Screen name="BasicInfo" component={OnboardingBasicInfoScreen} />
      <Stack.Screen name="Recommended" component={OnboardingRecommendedScreen} />
      <Stack.Screen name="Accountability" component={OnboardingAccountabilityScreen} />
      <Stack.Screen name="Finish" component={OnboardingFinishScreen} />
    </Stack.Navigator>
  );
}
