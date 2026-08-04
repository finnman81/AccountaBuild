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

/**
 * Shared publisher: queue the pop-up + push the honoree's group-mates.
 * `ann` must carry a deterministic id — that's the dedupe key.
 */
async function publishCelebration(db, { uid, ann, pushTitle, pushBody }) {
  try {
    // Which groups does this person belong to? A celebration is THEIR crew's
    // news — publishing to a global queue would pop it up for strangers the
    // moment a second group exists.
    const groupsSnap = await db.collection('users').doc(uid).collection('groups').get();
    const groupIds = groupsSnap.docs.map((d) => String(d.data()?.groupId ?? d.id)).filter(Boolean);
    if (!groupIds.length) return { queued: false, reason: 'no groups' };

    // Write the announcement into each group's own queue. Deterministic doc id
    // = the dedupe, so recomputes and concurrent runs can't double-post.
    let queued = 0;
    for (const gid of groupIds) {
      const ref = db.collection('groups').doc(gid).collection('announcements').doc(ann.id);
      try {
        await ref.create({ ...ann, createdAt: FieldValue.serverTimestamp() });
        queued += 1;
      } catch {
        /* already published to this group — the exactly-once path */
      }
      // Keep each queue bounded.
      try {
        const all = await db.collection('groups').doc(gid).collection('announcements')
          .orderBy('createdAt', 'desc').get();
        const stale = all.docs.slice(MAX_QUEUE);
        await Promise.all(stale.map((d) => d.ref.delete().catch(() => {})));
      } catch {
        /* trimming is best-effort */
      }
    }
    if (!queued) return { queued: false };

    // Push the honoree's group-mates (never the honoree — it's their news).
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
      // 'milestones', not 'teamActivity': muting daily chatter must not
      // silence a teammate finishing a goal or jumping a tier.
      if (!prefEnabled(mate, 'milestones')) continue;
      pushes.push({
        uid: mateUid,
        token: mate.expoPushToken,
        title: pushTitle,
        body: pushBody,
        data: { type: 'milestone', screen: 'Today' },
      });
    }
    const sent = pushes.length ? await sendExpoPushes(db, pushes) : { sent: 0 };
    console.log(`[celebrations] queued ${ann.id} to ${queued} group(s); pushes sent ${sent.sent}`);
    return { queued: true, groups: queued, pushed: sent.sent ?? 0 };
  } catch (e) {
    // Celebration must never break scoring.
    console.warn('[celebrations] failed for', uid, ann && ann.id, e);
    return { queued: false, error: String(e?.message ?? e) };
  }
}

/** Weight goal finished. */
async function celebrateGoalCompletion(db, { uid, goalId, goal, now = new Date() }) {
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

  return publishCelebration(db, {
    uid,
    ann: {
      id: `goal-${goalId}-${uid}-${now.toISOString().slice(0, 10)}`,
      emoji: '🎯',
      title: `${name} hit their goal weight`,
      lines,
      celebrate: { uid, name, hypeIds: HYPE_IDS },
    },
    pushTitle: `🎯 ${name} hit their goal weight!`,
    pushBody: 'Open the app to send some hype 👏',
  });
}

/**
 * TIER promotion (Silver -> Gold). Division ticks deliberately excluded — see
 * the tierPromotedNow note in mmr-compute.js.
 */
async function celebrateTierPromotion(db, { uid, prevTier, newTier, newDivision, weekId, now = new Date() }) {
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.exists ? userSnap.data() : {};
  const name = String(user.displayName ?? '').trim() || 'A teammate';
  const ROMAN = ['', 'I', 'II', 'III', 'IV'];
  const label = `${newTier}${newDivision ? ` ${ROMAN[newDivision]}` : ''}`;

  return publishCelebration(db, {
    uid,
    ann: {
      // Keyed by uid + destination tier + week: re-running the week can't
      // re-queue, and a LATER promotion to the same tier (after a demotion)
      // gets its own id.
      id: `tier-${uid}-${newTier}-${weekId}`,
      emoji: '⬆️',
      title: `${name} reached ${newTier}`,
      lines: [
        `${prevTier} → ${label}. A whole tier, earned a week at a time.`,
        'Send them some hype 👇',
      ],
      celebrate: { uid, name, hypeIds: HYPE_IDS },
    },
    pushTitle: `⬆️ ${name} reached ${newTier}!`,
    pushBody: 'Open the app to send some hype 👏',
  });
}


/**
 * PERSONAL milestone push (10/25/75% rungs). Deliberately not a group event —
 * the group pop-up stays exclusive to 100% so it keeps its weight.
 * Respects the streakReminder-class "teamActivity" pref like other nudges.
 */
async function notifyCheckpoint(db, { uid, goalId, goal, pct, fp }) {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const u = snap.exists ? snap.data() : {};
    if (!isExpoToken(u.expoPushToken)) return { pushed: 0 };

    const W0 = Number(goal?.startWeight);
    const Wg = Number(goal?.goalWeight);
    const isGain = goalId === 'weightGain';
    const total = Number.isFinite(W0) && Number.isFinite(Wg) ? Math.abs(W0 - Wg) : null;
    const done = total != null ? Math.round(total * pct * 10) / 10 : null;
    const left = total != null ? Math.round((total - total * pct) * 10) / 10 : null;

    const label = `${Math.round(pct * 100)}%`;
    // The 10% rung is the clinically meaningful one — name it as an achievement,
    // not a consolation prize.
    const title = pct <= 0.1 ? `🩺 First milestone: ${label} there` : `📍 ${label} of the way`;
    const body = done != null && left != null
      ? `${done} lb ${isGain ? 'gained' : 'down'}, ${left} to go — +${Math.round(fp)} FP banked. That progress is locked in.`
      : `+${Math.round(fp)} FP banked. That progress is locked in.`;

    const res = await sendExpoPushes(db, [{
      uid, token: u.expoPushToken, title, body,
      data: { type: 'checkpoint', screen: 'Progress' },
    }]);
    console.log(`[celebrations] checkpoint ${label} -> ${uid}; pushed ${res.sent}`);
    return { pushed: res.sent ?? 0 };
  } catch (e) {
    console.warn('[celebrations] checkpoint notify failed for', uid, e);
    return { pushed: 0, error: String(e?.message ?? e) };
  }
}

module.exports = { celebrateGoalCompletion, celebrateTierPromotion, notifyCheckpoint, publishCelebration };
