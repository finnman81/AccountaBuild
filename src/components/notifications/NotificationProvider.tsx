import React, { useContext, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, AppStateStatus } from 'react-native';

import { AuthContext } from '../../store/AuthContext';
import { scheduleNotifications, getNotificationPreferences } from '../../services/notifications';
import { useNotificationBadge } from '../../hooks/useNotificationBadge';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useContext(AuthContext);
  
  // Use badge hook to manage badge count
  useNotificationBadge();

  // Set up notification handlers
  useEffect(() => {
    // Handle notification received while app is in foreground
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);
    });

    // Handle notification tapped
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification tapped:', response);
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  // Initialize notifications when user logs in
  useEffect(() => {
    if (!user?.uid) return;

    void (async () => {
      try {
        const prefs = await getNotificationPreferences();
        if (prefs.enabled) {
          await scheduleNotifications();
        }
      } catch (e) {
        console.error('Failed to initialize notifications:', e);
      }
    })();
  }, [user?.uid]);

  // Re-schedule notifications when app comes to foreground
  useEffect(() => {
    if (!user?.uid) return;

    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        try {
          const prefs = await getNotificationPreferences();
          if (prefs.enabled) {
            await scheduleNotifications();
          }
        } catch (e) {
          console.error('Failed to re-schedule notifications:', e);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user?.uid]);

  return <>{children}</>;
}
