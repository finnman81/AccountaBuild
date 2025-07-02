import React, { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { AuthContext } from '../store/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HomeScreen from '../screens/HomeScreen';
import GroupListScreen from '../screens/GroupListScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import ChatScreen from '../screens/ChatScreen';
import GoalOverviewScreen from '../screens/GoalOverviewScreen';
import CreateGoalScreen from '../screens/CreateGoalScreen';
import { RootStackParamList } from './types'; // We'll create this file next

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator = () => {
  const { isAuthenticated, isLoading } = useContext(AuthContext);

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="GroupList" component={GroupListScreen} options={{ title: 'Your Groups' }} />
            <Stack.Screen name="CreateGroup" component={CreateGroupScreen} options={{ title: 'Create Group' }} />
            <Stack.Screen name="Chat" component={ChatScreen} options={({ route }) => ({ title: route.params.groupId })} />
            <Stack.Screen name="GoalOverview" component={GoalOverviewScreen} options={{ title: 'Your Goals' }} />
            <Stack.Screen name="CreateGoal" component={CreateGoalScreen} options={{ title: 'Set New Goal' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AppNavigator; 