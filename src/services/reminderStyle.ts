import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';

/**
 * How the daily reminders talk to you. Coven read the BPM-era copy ("Your
 * group is active. Don't be the one who didn't log today.") as rude, and BPM
 * likes it that way, so it's a choice.
 *
 * Source of truth: users/{uid}.notifPrefs.reminderStyle (the server can set
 * it, e.g. BPM -> savage, and the 2pm social push reads it). The phone keeps a
 * local copy because it schedules the reminders itself. Missing = friendly.
 *
 * Every line must be TRUE whenever it fires: local reminders are scheduled a
 * day ahead and only cancelled once you log, so they can say "not logged yet"
 * but can never claim what the group did ("your group is active" was often
 * false). The server's social push carries the real names instead.
 */
export type ReminderStyle = 'friendly' | 'direct' | 'savage';

export const REMINDER_STYLES: Array<{ value: ReminderStyle; label: string; sample: string }> = [
  { value: 'friendly', label: 'Friendly', sample: 'Good morning ☀️ Log today and keep your streak going!' },
  { value: 'direct', label: 'Direct', sample: "Today isn't logged yet. Keep the streak alive." },
  { value: 'savage', label: 'Savage', sample: "Excuses don't count. Logs do." },
];

/**
 * Friendly reminders open with a greeting that fits the slot's hour (the
 * phone knows the time it schedules for), then one of these. Direct and
 * savage skip the greeting.
 */
export function friendlyGreeting(hour: number): string {
  if (hour < 12) return 'Good morning ☀️';
  if (hour < 17) return 'Afternoon check-in 👋';
  return 'Evening 🌙';
}

export const REMINDER_MESSAGES: Record<ReminderStyle, string[]> = {
  friendly: [
    'Log today and keep your streak going!',
    "Ten seconds to log and today's in the books 💪",
    'A walk, a lift, a stretch. It all counts. Log it!',
    'Your streak is rooting for you. Log today 🔥',
    'Small wins stack up. Log what you did today 🙌',
  ],
  direct: [
    "Today isn't logged yet. Keep the streak alive.",
    'Log your workout, calories or weigh-in today.',
    "Your week's still open. Log today.",
    'Streak check: nothing logged today yet.',
    'Log today to protect your rank.',
  ],
  savage: [
    "Excuses don't count. Logs do.",
    "Your rank isn't locked in yet. Log today to protect your standing.",
    'Still on a streak. Log now to keep it alive.',
    "Don't be the one who didn't log today.",
    'It takes 10 seconds. Your future self will care.',
  ],
};

export function reminderBody(style: ReminderStyle, line: string, hour: number): string {
  return style === 'friendly' ? `${friendlyGreeting(hour)} ${line}` : line;
}

const KEY = 'reminder_style';

export function asReminderStyle(v: unknown): ReminderStyle {
  return v === 'direct' || v === 'savage' ? v : 'friendly';
}

export async function getLocalReminderStyle(): Promise<ReminderStyle> {
  try {
    return asReminderStyle(await AsyncStorage.getItem(KEY));
  } catch {
    return 'friendly';
  }
}

export async function setLocalReminderStyle(style: ReminderStyle): Promise<void> {
  await AsyncStorage.setItem(KEY, style).catch(() => {});
}

/** User picked a style in Settings: local copy + server copy. */
export async function saveReminderStyle(uid: string, style: ReminderStyle): Promise<void> {
  await setLocalReminderStyle(style);
  try {
    await setDoc(doc(db, 'users', uid), { notifPrefs: { reminderStyle: style }, updatedAt: serverTimestamp() }, { merge: true });
  } catch {
    /* local copy still drives the reminders */
  }
}
