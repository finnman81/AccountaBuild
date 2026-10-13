/**
 * Social nudge: "Kari and Grace logged today." Daily, mid-afternoon, to
 * members who haven't logged yet while at least 2 teammates have.
 *
 * WHY: the phone's own reminders used to say "Your group is active. Don't be
 * the one who didn't log today." Scheduled a day ahead, that was often FALSE,
 * and Coven read it as rude. The server knows who actually logged, so the
 * social line moved here, with real names and the member's chosen tone
 * (users.notifPrefs.reminderStyle: friendly | direct | savage, default friendly).
 *
 * Gates: push token; teamActivity pref; not shielded (vacation / hibernation);
 * hasn't logged today in any group; once per day (socialNudgeDate).
 */
const { FieldValue } = require('firebase-admin/firestore');
const core = require('./mmr-core');
const { isExpoToken, prefEnabled } = require('./push-helper');
const { isShielded } = require('./notif-logic');

const TZ = core.DEFAULT_TZ;
const MIN_TEAMMATES = 2;
const SKIP_GROUPS = new Set(['demo-review-crew']);

function firstName(n) {
  const s = String(n || '').trim();
  return s ? s.split(/\s+/)[0] : null;
}

function namesLine(names) {
  if (names.length <= 2) return names.join(' and ');
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? 'other' : 'others'}`;
}

const TONE = {
  friendly: 'Join them when you get a minute.',
  direct: 'Your turn.',
  savage: 'You?',
};

function toneFor(user) {
  const s = user && user.notifPrefs && user.notifPrefs.reminderStyle;
  return s === 'direct' || s === 'savage' ? s : 'friendly';
}

/** Build (not send) the pushes. `apply:false` for dry runs. */
async function evaluateSocialNudge(db, now = new Date(), { apply = true } = {}) {
  const today = core.yyyyMmDdInTz(now, TZ);
  const weekId = core.isoWeekIdInTz(now, TZ);
  const groups = await db.collection('groups').get();

  // Who logged today, per group, and every member's groups.
  const loggedByGroup = new Map();
  const groupsOf = new Map();
  for (const g of groups.docs) {
    if (SKIP_GROUPS.has(g.id)) continue;
    const logs = await db.collection('groups').doc(g.id).collection('logs').where('date', '==', today).get();
    loggedByGroup.set(g.id, new Set(logs.docs.map((d) => String(d.get('uid') || '')).filter(Boolean)));
    const members = await db.collection('groups').doc(g.id).collection('members').get();
    members.docs.forEach((m) => {
      if (!groupsOf.has(m.id)) groupsOf.set(m.id, []);
      groupsOf.get(m.id).push(g.id);
    });
  }
  const loggedAnywhere = new Set();
  for (const set of loggedByGroup.values()) for (const u of set) loggedAnywhere.add(u);

  const nameCache = new Map();
  const nameOf = async (uid) => {
    if (!nameCache.has(uid)) {
      const p = await db.collection('publicUsers').doc(uid).get();
      nameCache.set(uid, firstName(p.exists && p.get('displayName')));
    }
    return nameCache.get(uid);
  };

  const items = [];
  for (const [uid, gids] of groupsOf) {
    if (loggedAnywhere.has(uid)) continue;
    // Teammates who logged today, across all my groups (deduped).
    const mates = new Set();
    for (const gid of gids) for (const u of loggedByGroup.get(gid) || []) if (u !== uid) mates.add(u);
    if (mates.size < MIN_TEAMMATES) continue;

    const us = await db.collection('users').doc(uid).get();
    const user = us.exists ? us.data() || {} : {};
    if (!isExpoToken(user.expoPushToken)) continue;
    if (!prefEnabled(user, 'teamActivity')) continue;
    if (user.socialNudgeDate === today) continue;
    if (await isShielded(db, uid, user, weekId)) continue;

    const names = [];
    for (const m of mates) {
      const n = await nameOf(m);
      if (n) names.push(n);
    }
    if (names.length < MIN_TEAMMATES) continue;
    names.sort();
    items.push({
      uid,
      token: user.expoPushToken,
      title: `👟 ${namesLine(names)} logged today`,
      body: TONE[toneFor(user)],
      data: { type: 'socialNudge', screen: 'Today' },
    });
  }
  if (apply) {
    await Promise.all(items.map((i) => db.collection('users').doc(i.uid).set({ socialNudgeDate: today }, { merge: true }).catch(() => {})));
  }
  return { items, today };
}

module.exports = { evaluateSocialNudge, namesLine, TONE };
