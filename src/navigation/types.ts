export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
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
  EditProfile: { focusField?: 'displayName' | 'height' | 'age' | 'weightCurrent' | 'weightGoal' | 'units' } | undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  GroupDetail: { groupId: string };
  GroupCharts: { groupId: string };
  GroupChat: { groupId: string };
  ViewPhotos: { groupId: string };
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
};

export type TabsParamList = {
  HomeTab: undefined;
  LogTab: undefined;
  ProgressTab: undefined;
  GroupsTab: undefined;
  ProfileTab: undefined;
};


