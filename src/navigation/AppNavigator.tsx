import React, { useContext, useEffect, useRef } from 'react';
import { Linking } from 'react-native';
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
import MemberProfileScreen from '../screens/MemberProfileScreen';
import WeekReviewScreen from '../screens/WeekReviewScreen';
import RankUpScreen from '../screens/RankUpScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import { RootStackParamList } from './types';
import TabsNavigator from './TabsNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import { navigationRef, flushPendingNavigation, navigateToJoinGroup } from './navigationRef';
import { registerSentryNavigation } from '../services/sentry';
import {
  clearPendingJoinCode,
  consumePendingJoinCode,
  parseJoinCodeFromUrl,
  setPendingJoinCode,
} from '../services/inviteLinks';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Process-wide: the launch URL is handled at most once (see AppNavigator).
let initialUrlHandled = false;

export default function AppNavigator() {
  const { user, isLoading } = useContext(AuthContext);
  const theme = useTheme();
  const { isCompleted: onboardingCompleted, isLoading: onboardingLoading } = useOnboardingStatus(user?.uid ?? null);

  const configError = !isFirebaseConfigured() || firebaseInitError;
  const ready = configError || (!isLoading && !onboardingLoading);

  // Invite links (accountabuild://join/CODE, https://app.munitor.ai/join/CODE).
  // A signed-in, onboarded user gets navigated straight to JoinGroup. Anyone
  // else (signed out, mid-onboarding, auth still restoring on cold start) gets
  // the code stashed, and the next join UI to mount consumes it.
  const canNavigateToJoin = !!user && onboardingCompleted;
  const canNavigateRef = useRef(canNavigateToJoin);
  canNavigateRef.current = canNavigateToJoin;
  useEffect(() => {
    const handle = (url: string | null) => {
      const code = parseJoinCodeFromUrl(url);
      if (!code) return;
      if (canNavigateRef.current) navigateToJoinGroup(code);
      else setPendingJoinCode(code);
    };
    // getInitialURL() returns the SAME launch URL for the whole process life,
    // so read it once. Re-reading it on every auth/onboarding flip re-opened
    // JoinGroup with the launch code after each sign-out/in.
    if (!initialUrlHandled) {
      initialUrlHandled = true;
      Linking.getInitialURL().then(handle).catch(() => {});
    }
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);

  // A code stashed while the user couldn't be navigated (the usual cold start:
  // the link resolves before auth does) opens JoinGroup once they can be.
  useEffect(() => {
    if (!canNavigateToJoin) return;
    let cancelled = false;
    consumePendingJoinCode().then((code) => { if (code && !cancelled) navigateToJoinGroup(code); });
    return () => { cancelled = true; };
  }, [canNavigateToJoin]);

  // Sign-out (or an account switch) drops any stashed code, so the next
  // account on this device doesn't inherit the last one's invite. A code
  // stashed while signed OUT survives the sign-in that follows.
  const uid = user?.uid ?? null;
  const prevUidRef = useRef<string | null>(uid);
  useEffect(() => {
    if (prevUidRef.current && prevUidRef.current !== uid) clearPendingJoinCode();
    prevUidRef.current = uid;
  }, [uid]);

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
      onReady={() => {
        flushPendingNavigation();
        registerSentryNavigation(navigationRef); // no-op until Sentry's native module ships
      }}
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
              name="MemberProfile"
              component={MemberProfileScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="RankUp"
              component={RankUpScreen}
              options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }}
            />
            <Stack.Screen
              name="WeekReview"
              component={WeekReviewScreen}
              options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}


