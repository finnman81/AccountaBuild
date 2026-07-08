import React, { useContext, useEffect } from 'react';
import { DarkTheme as NavDarkTheme, NavigationContainer } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { IconButton, useTheme } from 'react-native-paper';

import { firebaseInitError, isFirebaseConfigured } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import FirebaseConfigErrorScreen from '../screens/FirebaseConfigErrorScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import AddCaloriesScreen from '../screens/AddCaloriesScreen';
import AddWorkoutScreen from '../screens/AddWorkoutScreen';
import AddWeightScreen from '../screens/AddWeightScreen';
import AddPhotoScreen from '../screens/AddPhotoScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import MMRGoalsScreen from '../screens/MMRGoalsScreen';
import LogComposerScreen from '../screens/LogComposerScreen';
import MemberDetailScreen from '../screens/MemberDetailScreen';
import RankUpScreen from '../screens/RankUpScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import { RootStackParamList } from './types';
import TabsNavigator from './TabsNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import { navigationRef, flushPendingNavigation } from './navigationRef';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { user, isLoading } = useContext(AuthContext);
  const theme = useTheme();
  const { isCompleted: onboardingCompleted, isLoading: onboardingLoading } = useOnboardingStatus(user?.uid ?? null);

  const configError = !isFirebaseConfigured() || firebaseInitError;
  const ready = configError || (!isLoading && !onboardingLoading);

  // Reveal the app (hide the held native splash) only once we know the first
  // screen. A 6s safety net hides it regardless, so a hung read can't strand
  // the user on the splash.
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 6000);
    return () => clearTimeout(t);
  }, []);

  if (configError) {
    return <FirebaseConfigErrorScreen />;
  }

  // Keep the native splash up until ready (render nothing rather than a spinner).
  if (!ready) return null;

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={flushPendingNavigation}
      theme={{
        ...NavDarkTheme,
        colors: {
          ...NavDarkTheme.colors,
          background: theme.colors.background,
          card: theme.colors.surface,
          text: theme.colors.onSurface,
          border: theme.colors.outlineVariant,
          primary: theme.colors.primary,
        },
      }}
    >
      <Stack.Navigator
        screenOptions={{
          contentStyle: { backgroundColor: theme.colors.background },
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerTitleStyle: { color: theme.colors.onSurface },
        }}
      >
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ headerShown: false }} />
          </>
        ) : !onboardingCompleted ? (
          <Stack.Screen name="Onboarding" component={OnboardingNavigator} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={TabsNavigator} options={{ headerShown: false }} />

            <Stack.Screen name="AddCalories" component={AddCaloriesScreen} options={{ title: 'Log Calories' }} />
            <Stack.Screen name="AddWorkout" component={AddWorkoutScreen} options={{ title: 'Log Workout' }} />
            <Stack.Screen name="AddWeight" component={AddWeightScreen} options={{ title: 'Log Weight' }} />
            <Stack.Screen name="AddPhoto" component={AddPhotoScreen} options={{ title: 'Upload Photo' }} />
            <Stack.Screen
              name="EditProfile"
              component={EditProfileScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <Stack.Screen name="MMRGoals" component={MMRGoalsScreen} options={{ title: 'Goals', presentation: 'modal' }} />
            <Stack.Screen
              name="LogComposer"
              component={LogComposerScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <Stack.Screen
              name="MemberDetail"
              component={MemberDetailScreen}
              options={{ headerShown: false, presentation: 'transparentModal', animation: 'fade' }}
            />
            <Stack.Screen
              name="RankUp"
              component={RankUpScreen}
              options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}


