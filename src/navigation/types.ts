import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  GroupList: undefined;
  CreateGroup: undefined;
  Chat: { groupId: string };
  GoalOverview: undefined;
  CreateGoal: undefined;
  // We can add other screens and their params here later
};

// This allows us to type the `navigation` and `route` props in our components
export type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>;
export type RegisterScreenProps = NativeStackScreenProps<RootStackParamList, 'Register'>;
export type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;
export type GroupListScreenProps = NativeStackScreenProps<RootStackParamList, 'GroupList'>;
export type CreateGroupScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateGroup'>;
export type ChatScreenProps = NativeStackScreenProps<RootStackParamList, 'Chat'>;
export type GoalOverviewScreenProps = NativeStackScreenProps<RootStackParamList, 'GoalOverview'>;
export type CreateGoalScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateGoal'>; 