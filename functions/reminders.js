/**
 * Daily "log today" reminders, sent from the server.
 *
 * WHY: the phone used to schedule these itself and cancel them when you
 * logged in the app. A workout Apple Health synced while the app was closed
 * cancelled nothing, so people who had already trained still got "Nothing
 * logged. Fix that." The server reads the real logs, so a reminder only goes
 * out when nothing is in for the day.
 *
 * Runs every 5 minutes. A user's slots (HH:mm in their own time zone) and
 * style come from users/{uid}.notifPrefs, written by the app. Only users whose
 * app has switched over (reminderSource === 'server') get server reminders,
 * so an un-updated phone never hears both.
 *
 * Copy: the same lines as src/services/reminderStyle.ts (parity-tested).
 */
const { FieldValue } = require('firebase-admin/firestore');
const core = require('./mmr-core');
const { getGroupIds } = require('./mmr-compute');
const { isExpoToken, prefEnabled } = require('./push-helper');
const { isShielded } = require('./notif-logic');

const DEFAULT_TZ = core.DEFAULT_TZ;
const WINDOW_MIN = 6; // cron is every 5 min; a slot fires once in the run after its time

const FRIENDLY_GREETING = {
  morning: 'Good morning ☀️',
  afternoon: 'Afternoon check-in 👋',
  evening: 'Evening 🌙',
};

const FRIENDLY_LINES = {
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

const SAVAGE_LINES = {
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

const NO_GROUP_LINE = 'Streaks last longer with someone watching. Start a group or join one with a code.';

function periodFor(hour) {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function styleOf(user) {
  const s = user && user.notifPrefs && user.notifPrefs.reminderStyle;
  return s === 'savage' ? 'savage' : 'friendly';
}

function reminderBodyFor(style, hour, dayIndex) {
  const period = periodFor(hour);
  const lines = (style === 'savage' ? SAVAGE_LINES : FRIENDLY_LINES)[period];
  const line = lines[((dayIndex % lines.length) + lines.length) % lines.length];
  return style === 'friendly' ? `${FRIENDLY_GREETING[period]} ${line}` : line;
}

/** Local HH and mm in `tz` for `date`; falls back to the app default zone. */
function localClock(date, tz) {
  let zone = tz;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    zone = DEFAULT_TZ;
  }
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(date);
  const get = (t) => Number((parts.find((p) => p.type === t) || {}).value);
  const hour = get('hour') % 24;
  return { hour, minute: get('minute'), ymd: core.yyyyMmDdInTz(date, zone), tz: zone };
}

function dayIndexOf(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function parseSlot(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute, key: `${String(hour).padStart(2, '0')}:${m[2]}` };
}

async function loggedToday(db, uid, groupIds, ymd) {
  for (const gid of groupIds) {
    const snap = await db.collection('groups').doc(gid).collection('logs')
      .where('uid', '==', uid).where('date', '==', ymd).limit(1).get();
    if (!snap.empty) return true;
  }
  return false;
}

/**
 * Which reminders are due right now? Returns { items, evaluated, report } and,
 * with apply, stamps users.reminderSent so a slot never fires twice.
 */
async function evaluateReminderSlots(db, now = new Date(), { apply = true } = {}) {
  const usersSnap = await db.collection('users').get();
  const items = [];
  const report = [];
  let evaluated = 0;

  for (const u of usersSnap.docs) {
    const data = u.data() || {};
    const prefs = data.notifPrefs || {};
    if (prefs.reminderSource !== 'server') continue;
    if (!isExpoToken(data.expoPushToken)) continue;
    if (!prefEnabled(data, 'streakReminder') || prefs.reminderEnabled === false) continue;
    const slots = Array.isArray(prefs.reminderTimes) ? prefs.reminderTimes.map(parseSlot).filter(Boolean) : [];
    if (!slots.length) continue;
    evaluated += 1;

    const clock = localClock(now, prefs.reminderTz);
    const nowMin = clock.hour * 60 + clock.minute;
    const sent = data.reminderSent && data.reminderSent.ymd === clock.ymd ? data.reminderSent.slots || [] : [];
    const dueSlots = slots.filter((s) => {
      const diff = nowMin - (s.hour * 60 + s.minute);
      return diff >= 0 && diff < WINDOW_MIN && !sent.includes(s.key);
    });
    if (!dueSlots.length) continue;

    try {
      const groupIds = await getGroupIds(db, u.id);
      let body = null;
      let kind = 'reminder';
      if (!groupIds.length) {
        // No group: one "start a group" nudge a day, at the first slot only.
        const first = [...slots].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))[0];
        if (dueSlots.some((s) => s.key === first.key) && !sent.length) {
          body = NO_GROUP_LINE;
          kind = 'noGroup';
        } else {
          kind = 'noGroupSkip';
        }
      } else {
        const weekId = core.isoWeekIdInTz(now, clock.tz);
        if (await isShielded(db, u.id, data, weekId)) {
          kind = 'shielded';
        } else if (await loggedToday(db, u.id, groupIds, clock.ymd)) {
          kind = 'logged';
        } else {
          body = reminderBodyFor(styleOf(data), dueSlots[0].hour, dayIndexOf(clock.ymd));
        }
      }
      report.push({ uid: u.id, name: data.displayName || u.id, slot: dueSlots[0].key, tz: clock.tz, kind, body });
      if (body) {
        items.push({
          uid: u.id,
          token: data.expoPushToken,
          title: 'AccountaBuild',
          body,
          data: { type: 'reminder', screen: 'Today' },
        });
      }
      if (apply) {
        await u.ref.set(
          { reminderSent: { ymd: clock.ymd, slots: [...sent, ...dueSlots.map((s) => s.key)], at: FieldValue.serverTimestamp() } },
          { merge: true },
        ).catch(() => {});
      }
    } catch (e) {
      console.warn('[reminders] failed for', u.id, e && e.message);
    }
  }
  return { items, evaluated, report };
}

module.exports = {
  evaluateReminderSlots,
  reminderBodyFor,
  periodFor,
  localClock,
  FRIENDLY_GREETING,
  FRIENDLY_LINES,
  SAVAGE_LINES,
  NO_GROUP_LINE,
};
