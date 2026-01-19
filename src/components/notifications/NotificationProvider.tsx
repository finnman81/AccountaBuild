import React, { useContext, useEffect } from 'react';
import * as Notifications from 'expo-notifications';

import { AuthContext } from '../../store/AuthContext';
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

  // NOTE: Notifications are scheduled on Settings save to avoid
  // re-triggering alerts when the app opens.

  return <>{children}</>;
}
