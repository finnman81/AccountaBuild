import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { PaperProvider } from 'react-native-paper';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';

import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/store/AuthContext';
import { ActiveGroupProvider } from './src/store/ActiveGroupContext';
import { NotificationProvider } from './src/components/notifications/NotificationProvider';
import HealthAutoSync from './src/components/health/HealthAutoSync';
import SafeUpdateChecker from './src/components/state/SafeUpdateChecker';
import { appTheme } from './src/theme/theme';
import { initSentry } from './src/services/sentry';

// Crash reporting. No-ops until a DSN is set AND a build ships the native
// module, so this is safe to carry through OTA updates in the meantime.
initSentry();

// Hold the native splash until the app is ready (fonts + auth + onboarding).
// AppNavigator hides it once it knows which screen to show — so the user goes
// straight splash -> Today (no bare spinner screens, no onboarding flash).
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  // Keep the native splash up while fonts load (return null, not a spinner).
  if (!loaded) return null;

  return (
    <AuthProvider>
      <ActiveGroupProvider>
        <NotificationProvider>
          <PaperProvider theme={appTheme}>
            <AppNavigator />
            <HealthAutoSync />
            <SafeUpdateChecker />
            <StatusBar style="light" />
          </PaperProvider>
        </NotificationProvider>
      </ActiveGroupProvider>
    </AuthProvider>
  );
}
