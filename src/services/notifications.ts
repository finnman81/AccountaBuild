import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNotificationPreferences, type NotificationPreferences } from './notificationPreferences';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const REMINDER_MESSAGES = [
  "Time to log your workout!",
  "Don't forget to track your progress today!",
  "Ready to log your workout?",
  "Keep your streak going - log your workout!",
  "Your workout log is waiting for you!",
];

const LAST_MESSAGE_INDEX_KEY = 'notification_last_message_index';

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
    return 'undetermined';
  }
}

function parseTime(timeStr: string): { hour: number; minute: number } {
  const [hour, minute] = timeStr.split(':').map(Number);
  return { hour: hour ?? 9, minute: minute ?? 0 };
}

export async function scheduleNotifications(): Promise<void> {
  try {
    // Cancel all existing notifications first
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    const prefs = await getNotificationPreferences();
    if (!prefs.enabled) {
      return;
    }
    
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.warn('Notification permissions not granted, cannot schedule notifications');
      return;
    }
    
    // Schedule notifications for each time slot
    for (let i = 0; i < prefs.count; i++) {
      const timeStr = prefs.times[i];
      if (!timeStr) continue;
      
      const { hour, minute } = parseTime(timeStr);
      const messageIndex = await getNextMessageIndex();
      const body = REMINDER_MESSAGES[messageIndex];
      
      // Create a daily repeating notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'AccountaBuild',
          body,
          sound: true,
          badge: 1,
        },
        trigger: {
          hour,
          minute,
          repeats: true,
        },
      });
    }
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
