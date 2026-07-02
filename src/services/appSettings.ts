import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { getNotificationPreferences, saveNotificationPreferences } from './notificationPreferences';

/** User-facing notification toggles (design 15). */
export type AppNotificationSettings = {
  streakReminder: boolean; // mirrors the local reminder scheduler's `enabled`
  teamActivity: boolean;
  nudgesAllowed: boolean; // also mirrored to the user profile so teammates know
  chatMessages: boolean;
};

const KEY = 'app_notification_settings';
const DEFAULTS: AppNotificationSettings = {
  streakReminder: true,
  teamActivity: true,
  nudgesAllowed: false,
  chatMessages: true,
};

export async function getAppNotificationSettings(): Promise<AppNotificationSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<AppNotificationSettings>) : {};
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Persist a single toggle. `streakReminder` also flips the local reminder
 * scheduler's `enabled`; `nudgesAllowed` is mirrored to the user profile so
 * teammates can tell whether they're allowed to nudge this user.
 */
export async function setAppNotificationSetting<K extends keyof AppNotificationSettings>(
  uid: string | undefined,
  key: K,
  value: AppNotificationSettings[K],
): Promise<void> {
  const current = await getAppNotificationSettings();
  const next = { ...current, [key]: value };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));

  if (key === 'streakReminder') {
    try {
      const prefs = await getNotificationPreferences();
      await saveNotificationPreferences({ ...prefs, enabled: value as boolean });
    } catch {
      /* non-fatal */
    }
  }
  if (key === 'nudgesAllowed' && uid && db) {
    try {
      await setDoc(doc(db, 'users', uid), { allowNudges: value, updatedAt: serverTimestamp() }, { merge: true });
    } catch {
      /* non-fatal */
    }
  }
}
