import React, { useContext, useEffect } from 'react';
import * as Notifications from 'expo-notifications';

import { AuthContext } from '../../store/AuthContext';
import { useNotificationBadge } from '../../hooks/useNotificationBadge';
import { navigateToActivity, navigateToGroupChat } from '../../navigation/navigationRef';

/** Route a tapped push to the right in-app screen based on its data payload. */
function handleNotificationTap(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as { screen?: string; groupId?: string } | undefined;
  if (data?.screen === 'GroupChat' && data.groupId) navigateToGroupChat(data.groupId);
  else if (data?.screen === 'Activity') navigateToActivity();
}

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

    // Handle notification tapped while the app is running (foreground/background).
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationTap(response);
    });

    // Handle a cold start caused by tapping a notification (app was fully
    // closed). Clear it afterward so re-opening the app later doesn't replay
    // the same tap.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        handleNotificationTap(response);
        void Notifications.clearLastNotificationResponseAsync().catch(() => {});
      })
      .catch(() => {});

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  // NOTE: Notifications are scheduled on Settings save to avoid
  // re-triggering alerts when the app opens.

  return <>{children}</>;
}
