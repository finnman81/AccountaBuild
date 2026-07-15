import React, { useContext, useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthContext } from '../../store/AuthContext';
import { useActiveGroup } from '../../store/ActiveGroupContext';
import { useNotificationBadge } from '../../hooks/useNotificationBadge';
import { navigateToActivity, navigateToGroupChat } from '../../navigation/navigationRef';
import { scheduleNotifications } from '../../services/notifications';
import { subscribeLogSaved } from '../../services/fpEvents';
import { fetchMyLogsInRange } from '../../services/logs';
import { todayYYYYMMDD } from '../../utils/dates';

const CLEARED_PREFIX = 'remindersClearedFor';

/** Route a tapped push to the right in-app screen based on its data payload. */
function handleNotificationTap(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as { screen?: string; groupId?: string } | undefined;
  if (data?.screen === 'GroupChat' && data.groupId) navigateToGroupChat(data.groupId);
  else if (data?.screen === 'Activity') navigateToActivity();
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();

  // Use badge hook to manage badge count
  useNotificationBadge();

  // SMART daily reminders. Two jobs:
  //  1. Re-arm on every open/foreground — reminders are one-shot local
  //     notifications and nothing else reschedules them daily (they used to
  //     fire once after setup and then go silent forever).
  //  2. Any log today CANCELS today's remaining reminders (re-armed from
  //     tomorrow) — you showed up; more nagging is noise. The 6pm server
  //     streak-risk push stays as the smart safety net for dangerous days.
  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;
    const clearedKey = `${CLEARED_PREFIX}:${uid}`;

    const clearForToday = async () => {
      const today = todayYYYYMMDD();
      const cleared = await AsyncStorage.getItem(clearedKey).catch(() => null);
      if (cleared === today) return;
      await scheduleNotifications({ force: true, startFromTomorrow: true });
      await AsyncStorage.setItem(clearedKey, today).catch(() => {});
    };

    const rearm = async () => {
      try {
        const today = todayYYYYMMDD();
        const cleared = await AsyncStorage.getItem(clearedKey).catch(() => null);
        if (cleared === today) return; // today's reminders already cleared
        let loggedToday = false;
        if (activeGroupId) {
          const logs = await fetchMyLogsInRange({ groupId: activeGroupId, uid, startDate: today, endDate: today });
          loggedToday = logs.length > 0; // manual AND health-synced logs count
        }
        if (loggedToday) await clearForToday();
        else await scheduleNotifications(); // internally deduped per prefs+day
      } catch {
        /* non-fatal */
      }
    };

    void rearm();
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void rearm();
    });
    const unsubLogSaved = subscribeLogSaved(() => {
      void clearForToday();
    });
    return () => {
      appStateSub.remove();
      unsubLogSaved();
    };
  }, [user?.uid, activeGroupId]);

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
