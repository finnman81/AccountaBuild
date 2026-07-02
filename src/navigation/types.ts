export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Onboarding: undefined;
  MainTabs: undefined;
  LogToday: { groupId: string };
  AddCalories: {
    groupId: string;
    edit?: { logId: string; date: string; calories: number; meal: import('../services/logs').MealType; note?: string | null };
  };
  AddWorkout: {
    groupId: string;
    edit?: {
      logId: string;
      date: string;
      workoutType: import('../services/logs').WorkoutType;
      durationMinutes: number;
      note?: string | null;
    };
  };
  AddWeight: { groupId: string; edit?: { logId: string; date: string; weight: number; note?: string | null } };
  AddPhoto: { groupId: string };
  EditProfile:
    | { focusField?: 'displayName' | 'height' | 'age' | 'weightCurrent' | 'weightGoal' | 'weightTargetDate' | 'units' }
    | undefined;
  MMRGoals: undefined;
  LogComposer: { initialType?: import('../services/logs').LogType } | undefined;
  MemberDetail: { groupId: string; uid: string };
  RankUp: { tier: import('../mmr/types').Tier; division: number | null; kind: 'promotion' | 'demotion'; mmr?: number };
};

export type OnboardingStackParamList = {
  Welcome: undefined;
  BasicInfo: undefined;
  Accountability: undefined;
  Goals: undefined;
  Finish: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  Today: undefined;
  GroupDetail: { groupId: string };
  Leaderboard: { groupId: string };
  GroupCharts: { groupId: string };
  GroupChat: { groupId: string };
  ViewPhotos: { groupId: string };
  Issues: { groupId: string };
  SetGoals: { groupId: string };
  GroupSettings: { groupId: string };
};

export type GroupsStackParamList = {
  GroupList: undefined;
  CreateGroup: undefined;
  JoinGroup: undefined;
};

export type ProgressStackParamList = {
  Progress: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  Settings: undefined;
  SeasonHistory: undefined;
  MMRHistory: undefined;
  Notifications: undefined;
  HealthSettings: undefined;
};

export type TabsParamList = {
  HomeTab: undefined;
  LogTab: undefined;
  ProgressTab: undefined;
  GroupsTab: undefined;
  ProfileTab: undefined;
};


