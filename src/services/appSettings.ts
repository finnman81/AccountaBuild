import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

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

// ---------------------------------------------------------------------------
// Notification levels (2026-11-11). One choice instead of a list of toggles;
// the server enforces it (functions/notif-level.js). The older toggles above
// still exist server-side but the level screen sets them all on.
// ---------------------------------------------------------------------------
export type NotifLevel = 'quiet' | 'standard' | 'allin' | 'custom';
export type NotifGroup = 'direct' | 'reminder' | 'progress' | 'morning' | 'teammate' | 'events';
export type NotifLevelSettings = {
  /** null = this account has no level yet (the old toggles still apply). */
  level: NotifLevel | null;
  groups: Record<NotifGroup, boolean>;
  reminderTime: string; // HH:mm, the member's own time zone
};

export const DEFAULT_NOTIF_GROUPS: Record<NotifGroup, boolean> = {
  direct: true,
  reminder: true,
  progress: true,
  morning: true,
  teammate: false,
  events: true,
};
/** The three ready-made levels, with the pushes a day each one means. */
export const NOTIF_LEVELS: Array<{ value: Exclude<NotifLevel, 'custom'>; label: string; count: string; body: string }> = [
  { value: 'quiet', label: 'Quiet', count: '0 to 1 a day', body: 'Only what is sent to you: cheers, reactions, chat. Plus the Monday recap.' },
  { value: 'standard', label: 'Standard', count: 'About 2 a day', body: 'A morning line. One reminder if you have not logged. Anything sent to you.' },
  { value: 'allin', label: 'All in', count: '5 or more a day', body: 'Everything in Standard, plus a push each time a teammate trains, and three reminders.' },
];
const LEVEL_KEY = 'notif_level_settings';
const isLevel = (v: unknown): v is NotifLevel => v === 'quiet' || v === 'standard' || v === 'allin' || v === 'custom';

/**
 * The member's level. Order: what this phone saved, then the server copy
 * (another phone, or a reinstall), then the app-wide default
 * (config/app.notifDefaultLevel; preview-lane accounts get Standard early).
 */
export async function getNotifLevelSettings(uid: string | undefined): Promise<NotifLevelSettings> {
  const base: NotifLevelSettings = { level: null, groups: { ...DEFAULT_NOTIF_GROUPS }, reminderTime: '18:00' };
  try {
    const raw = await AsyncStorage.getItem(LEVEL_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<NotifLevelSettings>;
      if (isLevel(p.level)) return { level: p.level, groups: { ...DEFAULT_NOTIF_GROUPS, ...(p.groups ?? {}) }, reminderTime: p.reminderTime || '18:00' };
    }
  } catch {
    /* fall through to the server copy */
  }
  if (!uid || !db) return base;
  try {
    const [userSnap, cfgSnap] = await Promise.all([getDoc(doc(db, 'users', uid)), getDoc(doc(db, 'config', 'app'))]);
    const prefs = (userSnap.data() as any)?.notifPrefs ?? {};
    const cfg = (cfgSnap.data() as any) ?? {};
    const fallback = isLevel(cfg.notifDefaultLevel)
      ? cfg.notifDefaultLevel
      : Array.isArray(cfg.previewUids) && cfg.previewUids.includes(uid)
        ? 'standard'
        : null;
    return {
      level: isLevel(prefs.level) ? prefs.level : fallback,
      groups: { ...DEFAULT_NOTIF_GROUPS, ...(prefs.groups ?? {}) },
      reminderTime: typeof prefs.reminderTime === 'string' && /^\d{1,2}:\d{2}$/.test(prefs.reminderTime) ? prefs.reminderTime : '18:00',
    };
  } catch {
    return base;
  }
}

/**
 * Save the level here and on the server. Picking a level turns the older
 * toggles back on (locally too, or the sign-in mirror would switch them off
 * again): from here the level decides, and the server enforces it.
 */
export async function saveNotifLevelSettings(uid: string | undefined, next: NotifLevelSettings): Promise<void> {
  if (!next.level) return;
  await AsyncStorage.setItem(LEVEL_KEY, JSON.stringify(next)).catch(() => {});
  try {
    const current = await getAppNotificationSettings();
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...current, streakReminder: true, teamActivity: true, milestones: true, chatMessages: true, weeklyRecap: true }));
    const reminders = await getNotificationPreferences();
    if (!reminders.enabled) await saveNotificationPreferences({ ...reminders, enabled: true });
  } catch {
    /* non-fatal */
  }
  if (!uid || !db) return;
  await setDoc(
    doc(db, 'users', uid),
    {
      notifPrefs: {
        level: next.level,
        groups: next.groups,
        reminderTime: next.reminderTime,
        reminderTz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
        reminderSource: 'server',
        reminderEnabled: true,
        streakReminder: true,
        teamActivity: true,
        milestones: true,
        chatMessages: true,
        weeklyRecap: true,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
