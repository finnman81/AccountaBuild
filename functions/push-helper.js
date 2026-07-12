/**
 * Shared Expo push delivery for all Cloud Functions.
 *
 * Hardened vs the original inline fetch: parses Expo ticket responses (a 200
 * from Expo can still carry per-message errors), clears dead tokens
 * (DeviceNotRegistered) so we stop pushing to uninstalled devices, and chunks
 * to Expo's 100-message limit.
 */
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

/**
 * Send pushes and reconcile tickets.
 * @param {FirebaseFirestore.Firestore} db
 * @param {Array<{uid: string, token: string, title: string, body: string, data?: object}>} items
 * @returns {Promise<{sent: number, errors: number, deadTokensCleared: number}>}
 */
async function sendExpoPushes(db, items) {
  const valid = items.filter((m) => isExpoToken(m.token));
  let sent = 0;
  let errors = 0;
  let deadTokensCleared = 0;

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
      }
    }
  }

  return { sent, errors, deadTokensCleared };
}

module.exports = { sendExpoPushes, isExpoToken, prefEnabled, inQuietHours };
