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
export type ReminderStyle = 'friendly' | 'savage';

export const REMINDER_STYLES: Array<{ value: ReminderStyle; label: string; sample: string }> = [
  { value: 'friendly', label: 'Friendly', sample: 'Good morning ☀️ Log today and keep your streak going!' },
  { value: 'savage', label: 'Savage', sample: "Excuses don't count. Logs do." },
];

/**
 * Friendly reminders are written per time of day: three lines each for
 * morning, afternoon and evening, with a greeting that fits the slot's hour
 * (the phone knows the time it schedules for). The line advances once a day,
 * so a 9:00 slot never repeats itself two days running. Savage has the same shape
 * and skips the greeting.
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
    'Remember to log today, you got this!',
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

/** Savage: same three-per-period shape, no greeting. BPM's copy (Jake, 2026-10-27). */
export const SAVAGE_LINES: Record<DayPeriod, string[]> = {
  morning: [
    "Excuses don't count. Move.",
    "The day's already started. Have you?",
    "Everyone's got 24 hours. Don't waste yours.",
  ],
  afternoon: [
    "Half the day's gone. Nothing logged. Fix that.",
    "Your rank isn't locked in yet. Log today to protect your standing.",
    "The group can see who logged. They can see who didn't.",
  ],
  evening: [
    "Don't be the one who didn't log today.",
    "The day is ending and your log isn't in. Handle it.",
    "Streak's on the line tonight. Log or lose it.",
  ],
};

const LINES: Record<ReminderStyle, Record<DayPeriod, string[]>> = { friendly: FRIENDLY_LINES, savage: SAVAGE_LINES };

/** The period's line for this day, with a greeting for friendly. `dayIndex` = any count that steps once a day. */
export function reminderBodyFor(style: ReminderStyle, hour: number, dayIndex: number): string {
  const period = periodFor(hour);
  const lines = LINES[style][period];
  const line = lines[((dayIndex % lines.length) + lines.length) % lines.length];
  return style === 'friendly' ? `${FRIENDLY_GREETING[period]} ${line}` : line;
}

/** Every line, flat, for tests and audits. */
export const REMINDER_MESSAGES: Record<ReminderStyle, string[]> = {
  friendly: [...FRIENDLY_LINES.morning, ...FRIENDLY_LINES.afternoon, ...FRIENDLY_LINES.evening],
  savage: [...SAVAGE_LINES.morning, ...SAVAGE_LINES.afternoon, ...SAVAGE_LINES.evening],
};

export function reminderBody(style: ReminderStyle, hour: number, dayIndex = Math.floor(Date.now() / 86_400_000)): string {
  return reminderBodyFor(style, hour, dayIndex);
}

const KEY = 'reminder_style';

export function asReminderStyle(v: unknown): ReminderStyle {
  return v === 'savage' ? v : 'friendly';
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
