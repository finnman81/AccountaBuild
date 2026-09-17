const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const core = require('./mmr-core');
const { publishCelebration } = require('./celebrations');
const { rebuildBadgesPublic } = require('./badges');

const TZ = 'America/New_York';
const MILESTONES = [7, 14, 30, 50, 100, 150, 200, 365];
const BIG_FROM = 30; // pop-up + teammate push + badge start here
const FRESH_MS = 48 * 60 * 60 * 1000;

/**
 * streakMilestone({ milestone })
 *
 * The daily streak is computed on the member's phone (it needs their full log
 * history), so the phone reports the milestone and this function makes it the
 * GROUP's news: a chat line for every milestone; from 30 days up also the
 * celebration pop-up with hype buttons, a push to teammates, and a career
 * badge. 7 and 14 stay chat-only so a group of eight isn't pinged weekly.
 *
 * Checked against the member's own streak mirror (fresh, and at least the
 * milestone), and exactly-once per member + milestone + month via a create()
 * marker, so retries and a second phone can't double-post.
 */
const streakMilestone = onCall(async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const m = Number(req.data && req.data.milestone);
  if (!MILESTONES.includes(m)) throw new HttpsError('invalid-argument', 'Not a milestone.');

  const db = admin.firestore();
  const pubSnap = await db.doc(`publicUsers/${uid}`).get();
  const pub = pubSnap.exists ? pubSnap.data() : {};
  const streak = Number(pub.streakDaysPublic) || 0;
  const fresh = Date.now() - (Number(pub.streakDaysUpdatedAtMs) || 0) < FRESH_MS;
  if (!fresh || streak < m) throw new HttpsError('failed-precondition', 'Streak does not match.');

  const month = core.yyyyMmDdInTz(new Date(), TZ).slice(0, 7);
  try {
    await db.doc(`users/${uid}/streakMilestones/${m}-${month}`).create({ milestone: m, streak, at: FieldValue.serverTimestamp() });
  } catch {
    return { posted: false }; // already announced
  }

  const name = String(pub.displayName || '').trim() || 'A teammate';
  const groups = await db.collection(`users/${uid}/groups`).get();
  await Promise.all(
    groups.docs.map((g) =>
      db.collection(`groups/${String(g.data()?.groupId ?? g.id)}/messages`).add({
        uid: 'system',
        system: true,
        senderName: 'AccountaBuild',
        text: `🔥 ${name} hit a ${m}-day streak.`,
        createdAt: FieldValue.serverTimestamp(),
      }).catch(() => {}),
    ),
  );

  if (m >= BIG_FROM) {
    await publishCelebration(db, {
      uid,
      ann: {
        id: `streak-${uid}-${m}-${month}`,
        emoji: '🔥',
        title: `${name} hit a ${m}-day streak`,
        lines: [`${m} days without breaking the chain. Rest days included, excuses not.`, 'Send them some hype 👇'],
        celebrate: { uid, name, hypeIds: ['champ', 'fire', 'goat', 'beast'] },
      },
      pushTitle: `🔥 ${name}: ${m}-day streak`,
      pushBody: 'Open the app to send some hype 👏',
    });
    try {
      // Career badge: no season prefix, create-only.
      await db.doc(`users/${uid}/badges/achv-streakDays${m}`).create({
        type: 'achievement', achievementId: `streakDays${m}`, title: `${m}-Day Streak`, earnedAt: FieldValue.serverTimestamp(),
      });
      await rebuildBadgesPublic(db, uid);
    } catch {
      /* already earned on an earlier run of this streak length */
    }
  }
  return { posted: true };
});

module.exports = { streakMilestone, MILESTONES };
