import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { getNotificationPreferences, saveNotificationPreferences } from './notificationPreferences';
import { upsertMyPublicUser } from './publicUsers';

/** User-facing notification toggles (design 15). */
export type AppNotificationSettings = {
  streakReminder: boolean; // mirrors the local reminder scheduler's `enabled`
  /**
   * DAILY crew chatter: "X logged today", daily champion. This is the volume
   * knob — up to one push per teammate per day.
   */
  teamActivity: boolean;
  /**
   * RARE crew moments: goal completions, tier promotions, challenge start/end.
   * Split out from teamActivity (2026-07-31) because muting the daily noise
   * also silenced the celebrations, so the only way to stop the chatter was to
   * miss the good stuff.
   */
  milestones: boolean;
  nudgesAllowed: boolean; // also mirrored to the user profile so teammates know
  chatMessages: boolean;
  weeklyRecap: boolean; // Monday recap + rank-change pushes
};

const KEY = 'app_notification_settings';
const DEFAULTS: AppNotificationSettings = {
  streakReminder: true,
  teamActivity: true,
  milestones: true,
  nudgesAllowed: false,
  chatMessages: true,
  weeklyRecap: true,
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

  // Mirror every toggle server-side: Cloud Functions gate chat / team-activity /
  // streak-risk pushes on users/{uid}.notifPrefs (missing field = enabled).
  if (uid && db) {
    try {
      await setDoc(
        doc(db, 'users', uid),
        {
          notifPrefs: {
            streakReminder: next.streakReminder,
            teamActivity: next.teamActivity,
            milestones: next.milestones,
            chatMessages: next.chatMessages,
            weeklyRecap: next.weeklyRecap,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch {
      /* non-fatal */
    }
  }

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
      // Private authoritative copy (function reads this to gate delivery)…
      await setDoc(doc(db, 'users', uid), { allowNudges: value, updatedAt: serverTimestamp() }, { merge: true });
      // …and a public mirror so teammates' apps can show/hide the Nudge button.
      await upsertMyPublicUser(uid, { allowNudges: value as boolean });
    } catch {
      /* non-fatal */
    }
  }
}

/**
 * One-shot mirror of the CURRENT local toggles to users/{uid}.notifPrefs.
 * Runs at sign-in (PushRegistrar) so users who set their toggles before the
 * server-side pushes existed still get their prefs honored.
 */
export async function syncNotifPrefsToServer(uid: string): Promise<void> {
  if (!db) return;
  try {
    const s = await getAppNotificationSettings();
    await setDoc(
      doc(db, 'users', uid),
      {
        notifPrefs: {
          streakReminder: s.streakReminder,
          teamActivity: s.teamActivity,
          chatMessages: s.chatMessages,
          weeklyRecap: s.weeklyRecap,
        },
      },
      { merge: true },
    );
  } catch {
    /* non-fatal */
  }
}
