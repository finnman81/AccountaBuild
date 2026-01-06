import React, { useContext } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { IconButton, useTheme } from 'react-native-paper';

import { isFirebaseConfigured } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import FirebaseConfigErrorScreen from '../screens/FirebaseConfigErrorScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import AddCaloriesScreen from '../screens/AddCaloriesScreen';
import AddWorkoutScreen from '../screens/AddWorkoutScreen';
import AddWeightScreen from '../screens/AddWeightScreen';
import GroupDetailScreen from '../screens/GroupDetailScreen';
import GroupListScreen from '../screens/GroupListScreen';
import JoinGroupScreen from '../screens/JoinGroupScreen';
import SetGoalsScreen from '../screens/SetGoalsScreen';
import AddPhotoScreen from '../screens/AddPhotoScreen';
import ViewPhotosScreen from '../screens/ViewPhotosScreen';
import GroupChartsScreen from '../screens/GroupChartsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import GroupChatScreen from '../screens/GroupChatScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { user, isLoading } = useContext(AuthContext);
  const theme = useTheme();

  if (!isFirebaseConfigured()) {
    return <FirebaseConfigErrorScreen />;
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          contentStyle: { backgroundColor: theme.colors.background },
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerTitleStyle: { color: theme.colors.onSurface },
        }}
      >
        {user ? (
          <>
            <Stack.Screen
              name="GroupList"
              component={GroupListScreen}
              options={({ navigation }) => ({
                title: 'Your Groups',
                headerRight: () => (
                  <IconButton
                    icon="account"
                    iconColor={theme.colors.primary}
                    onPress={() => navigation.navigate('Profile')}
                    accessibilityLabel="Profile"
                  />
                ),
              })}
            />
            <Stack.Screen name="CreateGroup" component={CreateGroupScreen} options={{ title: 'Create Group' }} />
            <Stack.Screen name="JoinGroup" component={JoinGroupScreen} options={{ title: 'Join Group' }} />
            <Stack.Screen name="GroupDetail" component={GroupDetailScreen} options={{ title: 'Group' }} />
            <Stack.Screen name="AddCalories" component={AddCaloriesScreen} options={{ title: 'Log Calories' }} />
            <Stack.Screen name="AddWorkout" component={AddWorkoutScreen} options={{ title: 'Log Workout' }} />
            <Stack.Screen name="AddWeight" component={AddWeightScreen} options={{ title: 'Log Weight' }} />
            <Stack.Screen name="SetGoals" component={SetGoalsScreen} options={{ title: 'My Goals' }} />
            <Stack.Screen name="AddPhoto" component={AddPhotoScreen} options={{ title: 'Upload Photo' }} />
            <Stack.Screen name="ViewPhotos" component={ViewPhotosScreen} options={{ title: 'Photos' }} />
            <Stack.Screen name="GroupCharts" component={GroupChartsScreen} options={{ title: 'Charts' }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
            <Stack.Screen name="GroupChat" component={GroupChatScreen} options={{ title: 'Group Chat' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Login' }} />
            <Stack.Screen
              name="Register"
              component={RegisterScreen}
              options={{ title: 'Create Account' }}
            />
            <Stack.Screen
              name="ForgotPassword"
              component={ForgotPasswordScreen}
              options={{ title: 'Reset Password' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}


