import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { PaperProvider } from 'react-native-paper';
import { ActivityIndicator, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';

import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/store/AuthContext';
import { ActiveGroupProvider } from './src/store/ActiveGroupContext';
import { NotificationProvider } from './src/components/notifications/NotificationProvider';
import { appTheme } from './src/theme/theme';

export default function App() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  if (!loaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: appTheme.colors.background }}>
        <ActivityIndicator color={appTheme.colors.primary} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <ActiveGroupProvider>
        <NotificationProvider>
          <PaperProvider theme={appTheme}>
            <AppNavigator />
            <StatusBar style="light" />
          </PaperProvider>
        </NotificationProvider>
      </ActiveGroupProvider>
    </AuthProvider>
  );
}
