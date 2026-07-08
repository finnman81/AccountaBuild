import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNotificationPreferences, type NotificationPreferences } from './notificationPreferences';

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

const REMINDER_MESSAGES = [
  "Your rank isn’t locked in yet. Log today to protect your standing.",
  "Your group is active. Don’t be the one who didn’t log today.",
  "Still on a streak. Log now to keep it alive.",
  "Progress beats perfection. Log whatever you did today.",
  "Quick check-in — log and move on.",
  "It takes 10 seconds. Your future self will care.",
];

const LAST_MESSAGE_INDEX_KEY = 'notification_last_message_index';
const LAST_SCHEDULED_PREFS_KEY = 'notification_last_scheduled_prefs';
const LAST_SCHEDULED_DAY_KEY = 'notification_last_scheduled_day';

async function getNextMessageIndex(): Promise<number> {
  try {
    const stored = await AsyncStorage.getItem(LAST_MESSAGE_INDEX_KEY);
    const lastIndex = stored ? parseInt(stored, 10) : -1;
    const nextIndex = (lastIndex + 1) % REMINDER_MESSAGES.length;
    await AsyncStorage.setItem(LAST_MESSAGE_INDEX_KEY, String(nextIndex));
    return nextIndex;
  } catch (e) {
    return 0;
  }
}

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

function parseTime(timeStr: string): { hour: number; minute: number } {
  const [hour, minute] = timeStr.split(':').map(Number);
  return { hour: hour ?? 9, minute: minute ?? 0 };
}

function localDayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nextOccurrenceDate(timeStr: string, minLeadSeconds: number, startFromTomorrow: boolean): Date {
  const { hour, minute } = parseTime(timeStr);
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  // If starting tomorrow, always push to next day.
  if (startFromTomorrow) {
    target.setDate(target.getDate() + 1);
    return target;
  }
  // If the target is in the past OR too soon, push to next day
  const diffMs = target.getTime() - now.getTime();
  if (target <= now || diffMs <= minLeadSeconds * 1000) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

function prefsSignature(prefs: NotificationPreferences) {
  return JSON.stringify({ enabled: prefs.enabled, count: prefs.count, times: prefs.times });
}

export async function scheduleNotifications(options?: { force?: boolean; startFromTomorrow?: boolean; minLeadSeconds?: number }): Promise<void> {
  try {
    const prefs = await getNotificationPreferences();
    if (!prefs.enabled) {
      return;
    }

    const signature = prefsSignature(prefs);
    const lastSignature = await AsyncStorage.getItem(LAST_SCHEDULED_PREFS_KEY);
    const todayKey = localDayKey(new Date());
    const lastDayKey = await AsyncStorage.getItem(LAST_SCHEDULED_DAY_KEY);
    if (!options?.force && lastSignature === signature && lastDayKey === todayKey) {
      return; // No changes, avoid rescheduling/spam
    }
    
    // Cancel all existing notifications before rescheduling
    await Notifications.cancelAllScheduledNotificationsAsync();
    // Clear any already-delivered notifications to avoid immediate bursts
    await Notifications.dismissAllNotificationsAsync();
    
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.warn('Notification permissions not granted, cannot schedule notifications');
      return;
    }
    
    // Schedule notifications for each time slot (single fire for next occurrence)
    // Use a small lead time to avoid immediate "save -> notify" behavior.
    const minLeadSeconds = options?.minLeadSeconds ?? 120;
    for (let i = 0; i < prefs.count; i++) {
      const timeStr = prefs.times[i];
      if (!timeStr) continue;
      const date = nextOccurrenceDate(timeStr, minLeadSeconds, Boolean(options?.startFromTomorrow));
      const messageIndex = await getNextMessageIndex();
      const body = REMINDER_MESSAGES[messageIndex];
      
      // Schedule next occurrence only (no catch-up bursts)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'AccountaBuild',
          body,
          sound: true,
          badge: 1,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
        },
      });
    }

    await AsyncStorage.setItem(LAST_SCHEDULED_PREFS_KEY, signature);
    await AsyncStorage.setItem(LAST_SCHEDULED_DAY_KEY, todayKey);
  } catch (e) {
    console.error('Failed to schedule notifications:', e);
  }
}

export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
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
