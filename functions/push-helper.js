/**
 * Shared Expo push delivery for all Cloud Functions.
 *
 * Hardened vs the original inline fetch: parses Expo ticket responses (a 200
 * from Expo can still carry per-message errors), clears dead tokens
 * (DeviceNotRegistered) so we stop pushing to uninstalled devices, and chunks
 * to Expo's 100-message limit.
 */
const { FieldValue } = require('firebase-admin/firestore');
const { DAILY_CAP, getNotifConfig, effectiveLevel, groupOf, levelAllows } = require('./notif-level');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function isExpoToken(token) {
  return typeof token === 'string' && token.indexOf('ExponentPushToken') === 0;
}

/**
 * Notification prefs live at users/{uid}.notifPrefs (mirrored from the app's
 * local toggles). Absence of the field means "enabled" — matching the client
 * defaults — so users who never opened Settings still get pushes.
 */
function prefEnabled(userData, key) {
  const prefs = userData && userData.notifPrefs;
  return !(prefs && prefs[key] === false);
}

/** Quiet hours: no chat/activity pushes 22:00–08:00 in the recipient-facing TZ. */
function inQuietHours(date, timeZone) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(date),
  );
  return hour >= 22 || hour < 8;
}

function ymdIn(date, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
}

/**
 * The one place levels are enforced (see notif-level.js): drop what the
 * member's level does not carry, hold Standard to its daily cap, and keep a
 * per-day tally at pushLog/{ymd}_{uid} ({sent, dropped} by kind). Until this
 * tally existed nobody could say how many pushes a member got. A member with
 * no level passes straight through. Any failure here sends the push anyway.
 */
async function applyLevels(db, items) {
  if (!items.length) return items;
  let cfg = {};
  try {
    cfg = await getNotifConfig(db);
  } catch {
    return items;
  }
  const now = new Date();
  const users = new Map();
  const used = new Map(); // uid -> capped pushes already counted today
  const out = [];
  for (const item of items) {
    const type = String((item.data && item.data.type) || 'unknown');
    let keep = true;
    let ymd = ymdIn(now, 'America/New_York');
    try {
      if (!users.has(item.uid)) {
        const snap = await db.doc(`users/${item.uid}`).get();
        users.set(item.uid, snap.exists ? snap.data() || {} : {});
      }
      const user = users.get(item.uid);
      ymd = ymdIn(now, (user.notifPrefs && user.notifPrefs.reminderTz) || 'America/New_York');
      const level = effectiveLevel(user, item.uid, cfg);
      const group = groupOf(type);
      if (level && !levelAllows(level, user, group)) keep = false;
      const cap = level ? DAILY_CAP[level] : undefined;
      if (keep && cap && group && group !== 'direct') {
        if (!used.has(item.uid)) used.set(item.uid, user.pushDay && user.pushDay.ymd === ymd ? Number(user.pushDay.n) || 0 : 0);
        const n = used.get(item.uid);
        if (n >= cap) {
          keep = false;
        } else {
          used.set(item.uid, n + 1);
          await db.doc(`users/${item.uid}`).set({ pushDay: { ymd, n: n + 1 } }, { merge: true }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[push] level check failed, sending anyway', item.uid, e && e.message);
      keep = true;
    }
    db.doc(`pushLog/${ymd}_${item.uid}`)
      .set({ uid: item.uid, ymd, [keep ? 'sent' : 'dropped']: { [type]: FieldValue.increment(1) } }, { merge: true })
      .catch(() => {});
    if (keep) out.push(item);
  }
  return out;
}

/**
 * Send pushes and reconcile tickets.
 * @param {FirebaseFirestore.Firestore} db
 * @param {Array<{uid: string, token: string, title: string, body: string, data?: object}>} items
 * @returns {Promise<{sent: number, errors: number, deadTokensCleared: number}>}
 */
async function sendExpoPushes(db, items) {
  const valid = await applyLevels(db, items.filter((m) => isExpoToken(m.token)));
  let sent = 0;
  let errors = 0;
  let deadTokensCleared = 0;
  const nonTokenErrors = [];

  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100);
    const body = chunk.map((m) => ({
      to: m.token,
      sound: 'default',
      title: m.title,
      body: m.body,
      data: m.data || {},
      channelId: 'default',
    }));

    let tickets = [];
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn('[push] Expo non-OK', res.status, text);
        errors += chunk.length;
        continue;
      }
      const json = await res.json();
      tickets = Array.isArray(json && json.data) ? json.data : [];
    } catch (e) {
      console.error('[push] Expo request failed', e);
      errors += chunk.length;
      continue;
    }

    for (let j = 0; j < chunk.length; j++) {
      const ticket = tickets[j];
      const item = chunk[j];
      if (ticket && ticket.status === 'ok') {
        sent += 1;
        continue;
      }
      errors += 1;
      const errCode = ticket && ticket.details && ticket.details.error;
      console.warn('[push] ticket error', item.uid, errCode || (ticket && ticket.message) || 'unknown');
      if (errCode === 'DeviceNotRegistered') {
        deadTokensCleared += 1;
        await db
          .doc(`users/${item.uid}`)
          .update({ expoPushToken: null })
          .catch(() => {});
      } else {
        // Everything that is NOT a dead token gets recorded where a human will
        // actually see it. Until 2026-07-21 these only hit Cloud Functions logs
        // that nobody reads — which is how InvalidCredentials (FCM credentials
        // registered under a stale package name) silently broke EVERY Android
        // push for weeks without a single alert.
        nonTokenErrors.push({
          uid: item.uid,
          code: errCode || (ticket && ticket.message) || 'unknown',
        });
      }
    }
  }

  if (nonTokenErrors.length) await recordPushFailures(db, nonTokenErrors);

  return { sent, errors, deadTokensCleared };
}

/**
 * Persist non-token push failures to `pushFailures/{code}` — one rolling doc
 * per error code with a count, the last few affected uids, and timestamps.
 * A doc appearing here means delivery is broken for a class of users, not that
 * one device went away. Deliberately a tiny aggregate (not per-event) so a
 * systemic outage can't write thousands of docs.
 */
async function recordPushFailures(db, failures) {
  const byCode = new Map();
  for (const f of failures) {
    if (!byCode.has(f.code)) byCode.set(f.code, []);
    byCode.get(f.code).push(f.uid);
  }
  await Promise.all(
    [...byCode.entries()].map(([code, uids]) =>
      db
        .doc(`pushFailures/${encodeURIComponent(code).slice(0, 120)}`)
        .set(
          {
            code,
            count: FieldValue.increment(uids.length),
            lastUids: uids.slice(0, 10),
            lastSeenAt: FieldValue.serverTimestamp(),
            firstSeenAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
        .catch(() => {}),
    ),
  );
}

module.exports = { sendExpoPushes, isExpoToken, prefEnabled, inQuietHours };
