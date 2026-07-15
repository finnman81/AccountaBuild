import React, { useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Icon, useTheme } from 'react-native-paper';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type {
  GroupsStackParamList,
  HomeStackParamList,
  ProfileStackParamList,
  ProgressStackParamList,
  RootStackParamList,
  TabsParamList,
} from './types';

import GroupChatScreen from '../screens/GroupChatScreen';
import ViewPhotosScreen from '../screens/ViewPhotosScreen';
import IssuesScreen from '../screens/IssuesScreen';
import GroupSettingsScreen from '../screens/GroupSettingsScreen';
import GroupListScreen from '../screens/GroupListScreen';
import GroupInfoScreen from '../screens/GroupInfoScreen';
import ChallengeScreen from '../screens/ChallengeScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import JoinGroupScreen from '../screens/JoinGroupScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import RankChangeWatcher from '../components/mmr/RankChangeWatcher';
import FpGainOverlay from '../components/mmr/FpGainOverlay';
import FirstLogCelebration from '../components/mmr/FirstLogCelebration';
import BadgeCelebrationWatcher from '../components/mmr/BadgeCelebrationWatcher';
import WeekReviewLauncher from '../components/mmr/WeekReviewLauncher';
import PushRegistrar from '../components/system/PushRegistrar';
import SeasonHistoryScreen from '../screens/SeasonHistoryScreen';
import MMRHistoryScreen from '../screens/MMRHistoryScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import HealthSettingsScreen from '../screens/HealthSettingsScreen';
import ProgressScreen from '../screens/ProgressScreen';
import HistoryScreen from '../screens/HistoryScreen';
import HomeScreen from '../screens/HomeScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import { colors } from '../theme/colors';
import HomeTodayScreen from '../screens/HomeTodayScreen';
import ActivityScreen from '../screens/ActivityScreen';

const Tab = createBottomTabNavigator<TabsParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const GroupsStack = createNativeStackNavigator<GroupsStackParamList>();
const ProgressStack = createNativeStackNavigator<ProgressStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Today" component={HomeTodayScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Activity" component={ActivityScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Challenge" component={ChallengeScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: 'Leaderboard' }} />
      <HomeStack.Screen name="GroupChat" component={GroupChatScreen} options={{ title: 'Chat' }} />
      <HomeStack.Screen name="ViewPhotos" component={ViewPhotosScreen} options={{ title: 'Photos' }} />
      <HomeStack.Screen name="Issues" component={IssuesScreen} options={{ title: 'Issues / Suggestions' }} />
      <HomeStack.Screen name="GroupSettings" component={GroupSettingsScreen} options={{ title: 'Group settings' }} />
    </HomeStack.Navigator>
  );
}

function GroupsStackNavigator() {
  return (
    <GroupsStack.Navigator>
      <GroupsStack.Screen name="GroupList" component={GroupListScreen} options={{ headerShown: false }} />
      <GroupsStack.Screen name="CreateGroup" component={CreateGroupScreen} options={{ title: 'Create group' }} />
      <GroupsStack.Screen name="JoinGroup" component={JoinGroupScreen} options={{ title: 'Join group' }} />
      <GroupsStack.Screen name="GroupInfo" component={GroupInfoScreen} options={{ headerShown: false }} />
      <GroupsStack.Screen name="Challenge" component={ChallengeScreen} options={{ headerShown: false }} />
      <GroupsStack.Screen name="GroupChat" component={GroupChatScreen} options={{ title: 'Chat' }} />
      <GroupsStack.Screen name="ViewPhotos" component={ViewPhotosScreen} options={{ title: 'Photos' }} />
      <GroupsStack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: 'Leaderboard' }} />
      <GroupsStack.Screen name="Issues" component={IssuesScreen} options={{ title: 'Issues / Suggestions' }} />
      <GroupsStack.Screen name="GroupSettings" component={GroupSettingsScreen} options={{ title: 'Group settings' }} />
    </GroupsStack.Navigator>
  );
}

function ProgressStackNavigator() {
  return (
    <ProgressStack.Navigator>
      <ProgressStack.Screen name="Progress" component={ProgressScreen} options={{ title: 'Progress' }} />
      <ProgressStack.Screen name="History" component={HistoryScreen} options={{ headerShown: false }} />
    </ProgressStack.Navigator>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="SeasonHistory" component={SeasonHistoryScreen} options={{ title: 'Season history' }} />
      <ProfileStack.Screen name="MMRHistory" component={MMRHistoryScreen} options={{ title: 'FP history' }} />
      <ProfileStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <ProfileStack.Screen name="HealthSettings" component={HealthSettingsScreen} options={{ title: 'Health & Fitness' }} />
    </ProfileStack.Navigator>
  );
}

function LogPlaceholder() {
  return <View />;
}

export default function TabsNavigator() {
  const theme = useTheme();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const tabBarStyle = useMemo(
    () => ({
      backgroundColor: colors.tabBar,
      borderTopColor: colors.divider,
    }),
    [],
  );

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
        }}
      >
        <Tab.Screen
          name="HomeTab"
          component={HomeStackNavigator}
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <Icon source="home-variant" color={color} size={size} />,
          }}
        />

        <Tab.Screen
          name="ProgressTab"
          component={ProgressStackNavigator}
          options={{
            title: 'Progress',
            tabBarIcon: ({ color, size }) => <Icon source="chart-line" color={color} size={size} />,
          }}
        />

        <Tab.Screen
          name="LogTab"
          component={LogPlaceholder}
          options={{
            title: '',
            tabBarIcon: ({ color, size }) => <Icon source="plus" color={color} size={size} />,
            tabBarButton: (props) => (
              <TouchableOpacity
                {...(props as any)}
                onPress={() => rootNav.navigate('LogComposer')}
                style={{
                  marginTop: -18,
                  width: 64,
                  height: 64,
                  borderRadius: 999,
                  backgroundColor: theme.colors.primary,
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: '#000',
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  elevation: 2,
                }}
              >
                <Icon source="plus" color={theme.colors.onPrimary} size={26} />
              </TouchableOpacity>
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              rootNav.navigate('LogComposer');
            },
          }}
        />

        <Tab.Screen
          name="GroupsTab"
          component={GroupsStackNavigator}
          options={{
            title: 'Groups',
            tabBarIcon: ({ color, size }) => <Icon source="account-group" color={color} size={size} />,
          }}
        />

        <Tab.Screen
          name="ProfileTab"
          component={ProfileStackNavigator}
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => <Icon source="account" color={color} size={size} />,
          }}
        />
      </Tab.Navigator>
      <RankChangeWatcher />
      <FpGainOverlay />
      <FirstLogCelebration />
      <BadgeCelebrationWatcher />
      <WeekReviewLauncher />
      <PushRegistrar />
    </>
  );
}

