/**
 * Notification levels.
 *
 * WHY: last week (2026-11-04..10) the middle member got 4.6 pushes a day and
 * the busiest got 8. Three kinds made 98% of them: "X logged a workout", the
 * three daily reminders, and the morning champion. Four toggles deep in
 * Settings could not fix that. A member now picks one level, and the server
 * holds the level to its promise:
 *
 *   quiet     only what is sent to you, plus the Monday recap
 *   standard  + one reminder, your progress, the morning line, events (max 3 a day)
 *   allin     everything, three reminders
 *   custom    the member's own six switches (notifPrefs.groups)
 *
 * The level lives at users/{uid}.notifPrefs.level. With none set, the default
 * comes from config/app.notifDefaultLevel; accounts on the preview lane
 * (config/app.previewUids) get 'standard' ahead of everyone else. No level and
 * no default = the old behaviour, untouched.
 *
 * The gate sits in sendExpoPushes (push-helper.js), keyed on each push's
 * data.type, so no sender has to know about levels. The older per-kind
 * toggles still run in each sender; they only ever remove more.
 */
const GROUP_OF = {
  chat: 'direct',
  cheer: 'direct',
  nudge: 'direct',
  reaction: 'direct',
  reminder: 'reminder',
  streakRisk: 'progress',
  vacationPrompt: 'progress',
  goalDeadline: 'progress',
  signNudge: 'progress',
  rankChange: 'progress',
  freeze: 'progress',
  checkpoint: 'progress',
  weeklyRecap: 'recap',
  dailyChampion: 'morning',
  teamActivity: 'teammate',
  socialNudge: 'teammate',
  challenge: 'events',
  contest: 'events',
  milestone: 'events',
  checkIn: 'events',
  recruit: 'events',
};

const LEVEL_GROUPS = {
  quiet: new Set(['direct', 'recap']),
  standard: new Set(['direct', 'reminder', 'progress', 'recap', 'morning', 'events']),
  allin: new Set(['direct', 'reminder', 'progress', 'recap', 'morning', 'teammate', 'events']),
};

/** Pushes a day that are not sent to you directly. Standard only. */
const DAILY_CAP = { standard: 3 };
const DEFAULT_REMINDER_TIME = '18:00';
const ALLIN_REMINDER_TIMES = ['09:00', '12:00', '21:00'];

const isLevel = (v) => v === 'quiet' || v === 'standard' || v === 'allin' || v === 'custom';

let cfgCache = { at: 0, value: {} };
/** config/app, cached for 5 minutes per instance. */
async function getNotifConfig(db) {
  if (Date.now() - cfgCache.at < 5 * 60 * 1000) return cfgCache.value;
  try {
    const snap = await db.doc('config/app').get();
    cfgCache = { at: Date.now(), value: snap.exists ? snap.data() || {} : {} };
  } catch {
    cfgCache = { at: Date.now(), value: cfgCache.value || {} };
  }
  return cfgCache.value;
}

/** The member's level, or null for the old behaviour. */
function effectiveLevel(user, uid, cfg) {
  const own = user && user.notifPrefs && user.notifPrefs.level;
  if (isLevel(own)) return own;
  if (cfg && isLevel(cfg.notifDefaultLevel) && cfg.notifDefaultLevel !== 'custom') return cfg.notifDefaultLevel;
  if (cfg && Array.isArray(cfg.previewUids) && cfg.previewUids.includes(uid)) return 'standard';
  return null;
}

function groupOf(type) {
  return GROUP_OF[type] || null;
}

/** Does this level let a push of this group through? Unknown kinds always pass. */
function levelAllows(level, user, group) {
  if (!level || !group) return true;
  if (level === 'custom') {
    const g = (user && user.notifPrefs && user.notifPrefs.groups) || {};
    if (group === 'recap') return g.progress !== false;
    if (group === 'teammate') return g.teammate === true; // off unless asked for
    return g[group] !== false;
  }
  return LEVEL_GROUPS[level].has(group);
}

/** Reminder slots (HH:mm) for a member on a level. */
function reminderTimesFor(level, user) {
  const prefs = (user && user.notifPrefs) || {};
  const one = /^\d{1,2}:\d{2}$/.test(String(prefs.reminderTime || '')) ? prefs.reminderTime : DEFAULT_REMINDER_TIME;
  if (level === 'quiet') return [];
  if (level === 'allin') return ALLIN_REMINDER_TIMES;
  if (level === 'custom') return levelAllows('custom', user, 'reminder') ? [one] : [];
  return [one];
}

module.exports = { GROUP_OF, DAILY_CAP, getNotifConfig, effectiveLevel, groupOf, levelAllows, reminderTimesFor };
