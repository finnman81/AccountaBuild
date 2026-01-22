import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NotificationPreferences {
  enabled: boolean;
  count: 1 | 2 | 3 | 4 | 5;
  times: string[]; // HH:mm format, local time
}

const STORAGE_KEY = 'notification_preferences';
const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  count: 3,
  times: ['09:00', '12:00', '21:00'],
};

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(stored) as Partial<NotificationPreferences>;
    // Validate and merge with defaults
    return {
      enabled: parsed.enabled ?? DEFAULT_PREFERENCES.enabled,
      count: (parsed.count === 1 || parsed.count === 2 || parsed.count === 3 || parsed.count === 4 || parsed.count === 5)
        ? parsed.count
        : DEFAULT_PREFERENCES.count,
      times: Array.isArray(parsed.times) && parsed.times.length > 0
        ? parsed.times.slice(0, parsed.count ?? 3)
        : DEFAULT_PREFERENCES.times,
    };
  } catch (e) {
    return DEFAULT_PREFERENCES;
  }
}

export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  try {
    // Ensure times array matches count
    const validated: NotificationPreferences = {
      ...prefs,
      times: prefs.times.slice(0, prefs.count),
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
  } catch (e) {
    console.error('Failed to save notification preferences:', e);
    throw e;
  }
}
