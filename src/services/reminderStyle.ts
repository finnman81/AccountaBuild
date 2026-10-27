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
 * Friendly reminders are written per time of day: three lines each for
 * morning, afternoon and evening, with a greeting that fits the slot's hour
 * (the phone knows the time it schedules for). The line advances once a day,
 * so a 9:00 slot never repeats itself two days running. Direct and savage
 * share one pool and skip the greeting.
 */
export type DayPeriod = 'morning' | 'afternoon' | 'evening';

export function periodFor(hour: number): DayPeriod {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

const FRIENDLY_GREETING: Record<DayPeriod, string> = {
  morning: 'Good morning ☀️',
  afternoon: 'Afternoon check-in 👋',
  evening: 'Evening 🌙',
};

export const FRIENDLY_LINES: Record<DayPeriod, string[]> = {
  morning: [
    'Log today and keep your streak going!',
    "New day, fresh start. One log and you're on the board 💪",
    'Breakfast, a walk, a lift. Whatever today holds, log it!',
  ],
  afternoon: [
    "Ten seconds to log and today's in the books 💪",
    'Halfway through the day. Got something to log yet?',
    'A walk counts. A stretch counts. Log it when you can 🙌',
  ],
  evening: [
    'Still time to log today. Keep that streak alive 🔥',
    'Before you wind down, log today. Future you says thanks ✨',
    'Small wins stack up. Log what you did today 🙌',
  ],
};

/** Greeting + the period's line for this day. `dayIndex` = any count that steps once a day. */
export function friendlyBody(hour: number, dayIndex: number): string {
  const period = periodFor(hour);
  const lines = FRIENDLY_LINES[period];
  const line = lines[((dayIndex % lines.length) + lines.length) % lines.length];
  return `${FRIENDLY_GREETING[period]} ${line}`;
}

export const REMINDER_MESSAGES: Record<ReminderStyle, string[]> = {
  friendly: [...FRIENDLY_LINES.morning, ...FRIENDLY_LINES.afternoon, ...FRIENDLY_LINES.evening],
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

export function reminderBody(style: ReminderStyle, line: string, hour: number, dayIndex = Math.floor(Date.now() / 86_400_000)): string {
  return style === 'friendly' ? friendlyBody(hour, dayIndex) : line;
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
