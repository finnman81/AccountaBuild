import React, { useContext } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DarkTheme as NavDarkTheme, NavigationContainer } from '@react-navigation/native';
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
import LogTodayScreen from '../screens/LogTodayScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import MMRGoalsScreen from '../screens/MMRGoalsScreen';
import LogComposerScreen from '../screens/LogComposerScreen';
import MemberDetailScreen from '../screens/MemberDetailScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import { RootStackParamList } from './types';
import TabsNavigator from './TabsNavigator';
import OnboardingNavigator from './OnboardingNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { user, isLoading } = useContext(AuthContext);
  const theme = useTheme();
  const { isCompleted: onboardingCompleted, isLoading: onboardingLoading } = useOnboardingStatus(user?.uid ?? null);

  if (!isFirebaseConfigured() || firebaseInitError) {
    return <FirebaseConfigErrorScreen />;
  }

  if (isLoading || onboardingLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer
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

            <Stack.Screen
              name="LogToday"
              component={LogTodayScreen}
              options={{
                title: 'Log today',
                headerBackTitle: 'Group',
              }}
            />
            <Stack.Screen name="AddCalories" component={AddCaloriesScreen} options={{ title: 'Log Calories' }} />
            <Stack.Screen name="AddWorkout" component={AddWorkoutScreen} options={{ title: 'Log Workout' }} />
            <Stack.Screen name="AddWeight" component={AddWeightScreen} options={{ title: 'Log Weight' }} />
            <Stack.Screen name="AddPhoto" component={AddPhotoScreen} options={{ title: 'Upload Photo' }} />
            <Stack.Screen
              name="EditProfile"
              component={EditProfileScreen}
              options={{ title: 'Edit profile', presentation: 'modal' }}
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
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}


