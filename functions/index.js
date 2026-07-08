/**
 * AccountaBuild Cloud Functions.
 *
 * sendSocialPush: delivers cheers/nudges. The app enqueues a doc under
 * `pushQueue`; this trigger looks up the RECIPIENT's Expo push token
 * server-side (tokens are private — clients never read them), gates nudges on
 * the recipient's allowNudges setting, records an in-app Activity item, sends
 * the push via Expo, then deletes the queue doc.
 */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

exports.sendSocialPush = onDocumentCreated('pushQueue/{id}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data() || {};
  const { toUid, fromUid, fromName, type } = data;
  const cleanup = () => snap.ref.delete().catch(() => {});

  if (!toUid || (type !== 'cheer' && type !== 'nudge')) {
    await cleanup();
    return;
  }

  try {
    const userSnap = await db.doc(`users/${toUid}`).get();
    const user = userSnap.exists ? userSnap.data() : null;
    const token = user && user.expoPushToken;

    // Nudges require the recipient to have opted in; cheers are always allowed.
    if (type === 'nudge' && !(user && user.allowNudges === true)) {
      await cleanup();
      return;
    }

    const name = (fromName && String(fromName)) || 'A teammate';
    const message =
      type === 'cheer'
        ? { title: '💪 You got a cheer', body: `${name} cheered you on!` }
        : { title: '👋 Nudge', body: `${name} nudged you to log today.` };

    // Record an in-app Activity item regardless of push delivery (so the bell
    // shows it even when the recipient has notifications off / no token).
    await db.collection('users').doc(toUid).collection('activity').add({
      type,
      fromUid: fromUid || null,
      fromName: name,
      title: message.title,
      body: message.body,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    }).catch((e) => console.warn('[sendSocialPush] activity write failed', e));

    // Send the push only if we have a valid Expo token.
    if (token && typeof token === 'string' && token.indexOf('ExponentPushToken') === 0) {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: token,
          sound: 'default',
          title: message.title,
          body: message.body,
          data: { type, fromUid: fromUid || null, screen: 'Activity' },
          channelId: 'default',
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn('[sendSocialPush] Expo push non-OK', res.status, text);
      }
    }
  } catch (e) {
    console.error('[sendSocialPush] failed', e);
  } finally {
    await cleanup();
  }
});
