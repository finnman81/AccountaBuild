/**
 * Check-ins: "Nobody left behind", made literal.
 *
 * DAILY (findQuietMembers): a member with no log in QUIET_DAYS, who isn't on
 * vacation or hibernating, gets flagged. Every ACTIVE teammate (logged in the
 * same window) gets a push and a pop-up asking them to reach out directly.
 * Once per absence: the flag is keyed on the member's last log date, so the
 * group is asked once, not every day.
 *
 * ON LOG (trackComeback): the flagged member's next log marks them back (chat
 * line, pop-up withdrawn). Logging on RETURN_LOG_DAYS different days within
 * RETURN_WINDOW_DAYS of returning completes the comeback: COMEBACK_FP once per
 * season (paid by the scorer, anchored on the weekly doc), a "Back on Track"
 * badge, and a "Brought One Back" badge for every teammate who reached out.
 *
 * Doc: groups/{gid}/checkIns/{uid}
 *   { lastActiveYmd, flaggedAt, status: 'out' | 'back' | 'done' | 'lapsed',
 *     returnedYmd?, logDays?, reachedOutBy? }
 */
const { FieldValue } = require('firebase-admin/firestore');
const core = require('./mmr-core');
const { sendExpoPushes, isExpoToken, prefEnabled } = require('./push-helper');
const { isShielded } = require('./notif-logic');
const { rebuildBadgesPublic } = require('./badges');

const TZ = core.DEFAULT_TZ;
const DAY_MS = 24 * 60 * 60 * 1000;
const QUIET_DAYS = 7;
// Gone longer than this when the feature first runs = already left, not
// slipping. Don't open with a pop-up about someone who quit in July.
const MAX_QUIET_DAYS = 21;
const LOOKBACK_DAYS = 60;
const RETURN_WINDOW_DAYS = 7;
const RETURN_LOG_DAYS = 3;
const COMEBACK_FP = 30; // = the floor of one missed-week penalty
// App Review's demo group: fake members, and the reviewer must never get
// a pop-up about a seeded account going quiet.
const SKIP_GROUPS = new Set(['demo-review-crew']);

function ymdMinus(now, days) {
  return core.yyyyMmDdInTz(new Date(now.getTime() - days * DAY_MS), TZ);
}

function daysBetween(fromYmd, toYmd) {
  return Math.round((Date.parse(`${toYmd}T12:00:00Z`) - Date.parse(`${fromYmd}T12:00:00Z`)) / DAY_MS);
}

function firstName(name) {
  const n = String(name || '').trim();
  return n ? n.split(/\s+/)[0] : 'A teammate';
}

/** Latest log date for uid in this group within the lookback, or null. */
async function lastLogYmd(db, gid, uid, sinceYmd) {
  const snap = await db.collection('groups').doc(gid).collection('logs')
    .where('uid', '==', uid).where('date', '>=', sinceYmd).get();
  let max = null;
  snap.docs.forEach((d) => {
    const date = String(d.get('date') || '');
    if (date && (!max || date > max)) max = date;
  });
  return max;
}

/** Any week touching [fromYmd, todayYmd] shielded = they told us they're away. */
async function shieldedDuring(db, uid, userData, fromYmd, now) {
  const weeks = new Set();
  for (let t = Date.parse(`${fromYmd}T12:00:00Z`); t <= now.getTime() + DAY_MS; t += DAY_MS) {
    weeks.add(core.isoWeekIdInTz(new Date(t), TZ));
  }
  for (const w of weeks) if (await isShielded(db, uid, userData, w)) return true;
  return false;
}

function announcementFor({ uid, name, days }) {
  const first = firstName(name);
  return {
    id: `checkin-${uid}`,
    // No `lines`: pre-check-in bundles validate on lines[] and skip this doc,
    // so an old client can never show "check on X" to X themselves.
    kind: 'checkIn',
    emoji: '👋',
    title: `Check on ${first}`,
    body: [
      `${first} hasn't logged in ${days} days. A text from you does more than any reminder we can send.`,
      'Nobody left behind.',
    ],
    checkIn: { uid, name: first },
    hideFrom: [uid],
  };
}

async function findQuietMembers(db, now = new Date(), { apply = true } = {}) {
  const today = core.yyyyMmDdInTz(now, TZ);
  const lookback = ymdMinus(now, LOOKBACK_DAYS);
  const activeSince = ymdMinus(now, QUIET_DAYS - 1);
  const groups = await db.collection('groups').get();
  const report = [];
  const pushes = [];

  for (const g of groups.docs) {
    const gid = g.id;
    if (SKIP_GROUPS.has(gid)) continue;
    const members = await db.collection('groups').doc(gid).collection('members').get();
    if (members.size < 2) continue;

    const last = new Map();
    for (const m of members.docs) last.set(m.id, await lastLogYmd(db, gid, m.id, lookback));
    const active = [...last.entries()].filter(([, d]) => d && d >= activeSince).map(([uid]) => uid);

    for (const m of members.docs) {
      const uid = m.id;
      const lastYmd = last.get(uid);
      if (!lastYmd) continue; // never logged here (or gone 60+ days)
      const days = daysBetween(lastYmd, today);
      if (days < QUIET_DAYS || days > MAX_QUIET_DAYS) continue;

      const ref = db.collection('groups').doc(gid).collection('checkIns').doc(uid);
      const prev = await ref.get();
      if (prev.exists && prev.get('lastActiveYmd') === lastYmd) continue; // already asked this absence

      const userSnap = await db.collection('users').doc(uid).get();
      const userData = userSnap.exists ? userSnap.data() || {} : {};
      if (await shieldedDuring(db, uid, userData, lastYmd, now)) continue;

      const pub = await db.collection('publicUsers').doc(uid).get();
      const name = (pub.exists && pub.get('displayName')) || userData.displayName || 'A teammate';
      const ann = announcementFor({ uid, name, days });
      const recipients = active.filter((x) => x !== uid);
      report.push({ gid, uid, name, lastYmd, days, recipients: recipients.length });
      if (!recipients.length) continue;

      if (apply) {
        await ref.set({ lastActiveYmd: lastYmd, flaggedAt: FieldValue.serverTimestamp(), status: 'out', reachedOutBy: [] });
        await db.collection('groups').doc(gid).collection('announcements').doc(ann.id)
          .set({ ...ann, createdAt: FieldValue.serverTimestamp() });
      }
      for (const r of recipients) {
        const rs = await db.collection('users').doc(r).get();
        const ru = rs.exists ? rs.data() || {} : {};
        if (!isExpoToken(ru.expoPushToken) || !prefEnabled(ru, 'milestones')) continue;
        pushes.push({
          uid: r,
          token: ru.expoPushToken,
          title: `👋 Check on ${firstName(name)}`,
          body: `${firstName(name)} hasn't logged in ${days} days. Shoot them a text. Nobody left behind.`,
          data: { type: 'checkIn', screen: 'Today' },
        });
      }
    }
  }
  const sent = apply && pushes.length ? await sendExpoPushes(db, pushes) : { sent: 0 };
  return { report, pushes: pushes.length, sent: sent.sent ?? 0 };
}

async function postChat(db, gid, text) {
  await db.collection('groups').doc(gid).collection('messages').add({
    uid: 'system', system: true, senderName: 'AccountaBuild', text, createdAt: FieldValue.serverTimestamp(),
  }).catch(() => {});
}

async function awardBadge(db, uid, docId, achievementId, title, seasonId) {
  try {
    await db.doc(`users/${uid}/badges/${docId}`).create({
      type: 'achievement', seasonId, achievementId, title, earnedAt: FieldValue.serverTimestamp(),
    });
    await rebuildBadgesPublic(db, uid);
  } catch {
    /* already earned this season */
  }
}

/**
 * Called for every new log. Cheap when there's no check-in doc (one read).
 * `computeWeek(uid)` recomputes the member's current week so the FP lands now.
 */
async function trackComeback(db, { gid, uid, date, now = new Date(), computeWeek }) {
  const ref = db.collection('groups').doc(gid).collection('checkIns').doc(uid);
  const snap = await ref.get();
  if (!snap.exists || !date) return null;
  const c = snap.data() || {};
  if (date <= String(c.lastActiveYmd || '')) return null; // backfill from before the absence

  const pub = await db.collection('publicUsers').doc(uid).get();
  const first = firstName(pub.exists && pub.get('displayName'));

  if (c.status === 'out') {
    await ref.update({ status: 'back', returnedYmd: date, logDays: [date] });
    await db.collection('groups').doc(gid).collection('announcements').doc(`checkin-${uid}`).delete().catch(() => {});
    await postChat(db, gid, `👊 ${first} is back.`);
    return 'back';
  }
  if (c.status !== 'back') return null;

  if (daysBetween(String(c.returnedYmd), date) >= RETURN_WINDOW_DAYS) {
    await ref.update({ status: 'lapsed' });
    return 'lapsed';
  }
  const logDays = [...new Set([...(c.logDays || []), date])];
  if (logDays.length < RETURN_LOG_DAYS) {
    await ref.update({ logDays });
    return 'back';
  }

  // Comeback complete.
  await ref.update({ status: 'done', logDays, doneAt: FieldValue.serverTimestamp() });
  const seasonId = core.seasonIdFromDate(now, TZ);
  const weekId = core.isoWeekIdInTz(now, TZ);
  let fp = 0;
  try {
    // Deterministic id per member + season: once per season, retry-safe.
    await db.doc(`users/${uid}/comebacks/${seasonId}`).create({
      weekId, seasonId, fp: COMEBACK_FP, groupId: gid, at: FieldValue.serverTimestamp(),
    });
    fp = COMEBACK_FP;
  } catch {
    /* already paid this season: badge and hype only */
  }
  if (fp && computeWeek) await computeWeek(uid).catch((e) => console.warn('[checkIn] recompute failed', uid, e));
  await awardBadge(db, uid, `${seasonId}-achv-backOnTrack`, 'backOnTrack', 'Back on Track', seasonId);

  const helpers = (c.reachedOutBy || []).filter((x) => x && x !== uid);
  for (const h of helpers) await awardBadge(db, h, `${seasonId}-achv-broughtBack`, 'broughtBack', 'Brought One Back', seasonId);

  await postChat(db, gid, `💪 ${first} made it all the way back. ${RETURN_LOG_DAYS} days logged in a week.`);

  const pushes = [];
  const me = await db.collection('users').doc(uid).get();
  const mu = me.exists ? me.data() || {} : {};
  if (isExpoToken(mu.expoPushToken)) {
    pushes.push({
      uid, token: mu.expoPushToken,
      title: '💪 Comeback complete',
      body: fp ? `${RETURN_LOG_DAYS} days logged since you got back. +${fp} FP and a Back on Track badge.` : `${RETURN_LOG_DAYS} days logged since you got back. Back on Track badge earned.`,
      data: { type: 'checkIn', screen: 'Today' },
    });
  }
  for (const h of helpers) {
    const hs = await db.collection('users').doc(h).get();
    const hu = hs.exists ? hs.data() || {} : {};
    if (!isExpoToken(hu.expoPushToken) || !prefEnabled(hu, 'milestones')) continue;
    pushes.push({
      uid: h, token: hu.expoPushToken,
      title: `🤝 ${first} is back on track`,
      body: 'You reached out and it worked. Brought One Back badge earned.',
      data: { type: 'checkIn', screen: 'Today' },
    });
  }
  if (pushes.length) await sendExpoPushes(db, pushes);
  return 'done';
}

/** A teammate tapped Text or Nudge on the pop-up. Server-side so rules stay shut. */
async function recordReachOut(db, { gid, uid, by }) {
  if (!gid || !uid || !by || uid === by) return false;
  const member = await db.doc(`groups/${gid}/members/${by}`).get();
  if (!member.exists) return false;
  const ref = db.doc(`groups/${gid}/checkIns/${uid}`);
  const snap = await ref.get();
  if (!snap.exists || !['out', 'back'].includes(snap.get('status'))) return false;
  await ref.update({ reachedOutBy: FieldValue.arrayUnion(by) });
  return true;
}

module.exports = {
  findQuietMembers, trackComeback, recordReachOut, announcementFor,
  QUIET_DAYS, RETURN_LOG_DAYS, RETURN_WINDOW_DAYS, COMEBACK_FP,
};
