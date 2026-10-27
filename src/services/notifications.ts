import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { auth, db } from '../firebase/firebase';
import { getLocalReminderStyle } from './reminderStyle';
import { getNotificationPreferences } from './notificationPreferences';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // expo-notifications 0.32 replaced `shouldShowAlert` with `shouldShowBanner`
    // (heads-up banner) + `shouldShowList` (notification center).
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Copy lives in reminderStyle.ts (three tones, all true whenever they fire).

const SERVER_SYNC_KEY = 'notification_server_sync';


export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    return finalStatus === 'granted';
  } catch (e) {
    console.error('Failed to request notification permissions:', e);
    return false;
  }
}

export async function getNotificationPermissionsStatus(): Promise<Notifications.PermissionStatus> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch (e) {
    return 'undetermined' as Notifications.PermissionStatus;
  }
}

// Serialize ALL scheduling: the flow is cancelAll -> schedule, so two
// interleaved calls (mount + foreground + group-load can all trigger a
// re-arm) each pass the dedupe check, each cancel, and each schedule —
// double reminders at the same slot (seen in prod: two 9:00 messages).
let schedulingChain: Promise<void> = Promise.resolve();

export function scheduleNotifications(options?: { force?: boolean; startFromTomorrow?: boolean; minLeadSeconds?: number }): Promise<void> {
  const next = schedulingChain.then(() => scheduleNotificationsInner(options), () => scheduleNotificationsInner(options));
  schedulingChain = next;
  return next;
}

async function scheduleNotificationsInner(options?: { force?: boolean; startFromTomorrow?: boolean; minLeadSeconds?: number }): Promise<void> {
  // Reminders are sent by the server now (functions/reminders.js): it reads
  // the real logs, so a Health-synced workout cancels them too. The phone's
  // job is to hand over the slots and make sure no local copies remain.
  void options;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await syncReminderPrefsToServer();
  } catch (e) {
    console.error('Failed to sync reminders:', e);
  }
}

/**
 * Hand the slots to the server: users/{uid}.notifPrefs.{reminderTimes,
 * reminderTz, reminderEnabled, reminderSource}. `reminderSource: 'server'` is
 * the switch; a phone that hasn't updated never writes it, so the server stays
 * silent for it and the old local reminders keep working there.
 */
export async function syncReminderPrefsToServer(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const prefs = await getNotificationPreferences();
  const style = await getLocalReminderStyle();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  const times = prefs.times.slice(0, prefs.count).filter((t) => /^\d{1,2}:\d{2}$/.test(t));
  const signature = JSON.stringify([uid, prefs.enabled, times, tz, style]);
  const last = await AsyncStorage.getItem(SERVER_SYNC_KEY).catch(() => null);
  if (last === signature) return;
  await setDoc(
    doc(db, 'users', uid),
    {
      notifPrefs: {
        reminderSource: 'server',
        reminderTimes: times,
        reminderTz: tz,
        reminderEnabled: prefs.enabled,
        reminderStyle: style,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await AsyncStorage.setItem(SERVER_SYNC_KEY, signature).catch(() => {});
}

/**
 * No group yet: the server sends one "start or join a group" line a day at
 * the first slot. Nothing to schedule here beyond handing over the slots.
 */
export async function holdRemindersUntilGroup(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await syncReminderPrefsToServer();
  } catch (e) {
    console.warn('holdRemindersUntilGroup failed', e);
  }
}

export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await syncReminderPrefsToServer();
  } catch (e) {
    console.error('Failed to cancel notifications:', e);
  }
}

export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (e) {
    console.error('Failed to set badge count:', e);
  }
}

export async function clearBadge(): Promise<void> {
  await setBadgeCount(0);
}

export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (e) {
    console.error('Failed to get scheduled notifications:', e);
    return [];
  }
}
