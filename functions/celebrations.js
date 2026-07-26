/**
 * Auto-celebrations: when the scorer detects a once-only milestone (currently:
 * weight-goal completion), queue the celebration pop-up for everyone and push
 * the honoree's teammates.
 *
 * Fired from computeUserWeek at the moment the completion bonus is AWARDED —
 * that award is idempotent (anchored on the weekly doc), so this runs exactly
 * once per completion. The announcement id is deterministic on top of that,
 * making a double-post impossible even across concurrent runs.
 *
 * The pop-up carries a `celebrate` payload; WhatsNewModal renders hype buttons
 * that send the honoree a real cheer push (see the client). Manual precedent:
 * the Watto card, 2026-07-26.
 */
const { FieldValue } = require('firebase-admin/firestore');
const { sendExpoPushes, isExpoToken, prefEnabled } = require('./push-helper');

const MAX_QUEUE = 12;
const HYPE_IDS = ['champ', 'fire', 'goat', 'beast'];

function fmtLb(x) {
  const n = Number(x);
  return Number.isFinite(n) ? `${Math.round(n * 10) / 10} lb` : null;
}

/** "nine weeks early" flavor line when the goal beat its own deadline. */
function earlyLine(completedOn, targetEndDate) {
  const end = Date.parse(`${targetEndDate}T12:00:00`);
  const done = completedOn.getTime();
  if (!Number.isFinite(end) || done >= end) return null;
  const weeks = Math.floor((end - done) / (7 * 24 * 60 * 60 * 1000));
  if (weeks < 1) return null;
  return `That's ${weeks === 1 ? 'a week' : `${weeks} weeks`} ahead of their own deadline.`;
}

async function celebrateGoalCompletion(db, { uid, goalId, goal, now = new Date() }) {
  try {
    const userSnap = await db.collection('users').doc(uid).get();
    const user = userSnap.exists ? userSnap.data() : {};
    const name = String(user.displayName ?? '').trim() || 'A teammate';
    const isGain = goalId === 'weightGain';

    const from = fmtLb(goal?.startWeight);
    const to = fmtLb(goal?.goalWeight);
    const lines = [];
    if (from && to) lines.push(`${from} → ${to}. Goal ${isGain ? 'gained' : 'done'}.`);
    const early = goal?.targetEndDate ? earlyLine(now, String(goal.targetEndDate)) : null;
    if (early) lines.push(early);
    lines.push('Send them some hype 👇');

    const ann = {
      id: `goal-${goalId}-${uid}-${now.toISOString().slice(0, 10)}`,
      emoji: '🎯',
      title: `${name} hit their goal weight`,
      lines,
      celebrate: { uid, name, hypeIds: HYPE_IDS },
    };

    // Queue append with dedupe + cap. Transaction so two concurrent completions
    // (different users, same 6h run) can't clobber each other's append.
    const cfgRef = db.doc('config/app');
    let queued = false;
    await db.runTransaction(async (tx) => {
      const cfg = (await tx.get(cfgRef)).data() || {};
      const queue = Array.isArray(cfg.announcements) ? cfg.announcements : [];
      if (queue.some((a) => a && a.id === ann.id)) return;
      const next = [...queue, ann].slice(-MAX_QUEUE);
      tx.set(cfgRef, {
        announcements: next,
        announcement: ann, // legacy single field — old bundles read ONLY this
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      queued = true;
    });
    if (!queued) return { queued: false };

    // Push the honoree's group-mates (never the honoree — it's their news).
    const groupsSnap = await db.collection('users').doc(uid).collection('groups').get();
    const groupIds = groupsSnap.docs.map((d) => String(d.data()?.groupId ?? d.id)).filter(Boolean);
    const mateUids = new Set();
    for (const gid of groupIds) {
      const members = await db.collection('groups').doc(gid).collection('members').get();
      members.docs.forEach((m) => { if (m.id !== uid) mateUids.add(m.id); });
    }
    const pushes = [];
    for (const mateUid of mateUids) {
      const mateSnap = await db.collection('users').doc(mateUid).get();
      const mate = mateSnap.exists ? mateSnap.data() : {};
      if (!isExpoToken(mate.expoPushToken)) continue;
      if (!prefEnabled(mate, 'teamActivity')) continue;
      pushes.push({
        uid: mateUid,
        token: mate.expoPushToken,
        title: `🎯 ${name} hit their goal weight!`,
        body: 'Open the app to send some hype 👏',
        data: { type: 'milestone', screen: 'Today' },
      });
    }
    const sent = pushes.length ? await sendExpoPushes(db, pushes) : { sent: 0 };
    console.log(`[celebrations] ${name} ${goalId} celebrated; pushes sent ${sent.sent}`);
    return { queued: true, pushed: sent.sent ?? 0 };
  } catch (e) {
    // Celebration must never break scoring.
    console.warn('[celebrations] failed for', uid, goalId, e);
    return { queued: false, error: String(e?.message ?? e) };
  }
}

module.exports = { celebrateGoalCompletion };
