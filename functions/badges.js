/**
 * Post-compute badge awards + the LIVE badgesPublic mirror.
 *
 * WHY post-transaction: the admin SDK requires all tx reads before writes, so
 * in-tx awards need their refs enumerated up front — impossible for dynamic ids
 * like `achv-reached-Gold`. `create()` (fails if the doc exists) gives the same
 * exactly-once guarantee without the read, and every condition below is
 * monotonic within a week (minutes only accumulate, adherence ratios only
 * rise), so awarding mid-week is safe.
 *
 * WHY the mirror: badgesPublic used to be a one-time backfill script, so every
 * badge earned since simply never appeared on teammate profiles.
 */
const { FieldValue } = require('firebase-admin/firestore');

/** Decide which badges this run's outputs earn. Pure — easy to test. */
function badgesForRun({ seasonId, summary, minutesDone, completedWeek, missedBefore }) {
  const out = [];
  const add = (docId, achievementId, title) =>
    out.push({ docId, data: { type: 'achievement', seasonId, achievementId, title } });

  if (summary.goalCompletedNow) add(`${seasonId}-achv-goalCrusher`, 'goalCrusher', 'Goal Crusher');
  if (summary.tierPromotedNow && summary.newTier) {
    // Career badge — you only ever FIRST reach a tier once, so no season prefix.
    add(`achv-reached-${summary.newTier}`, `reached-${summary.newTier}`, `Reached ${summary.newTier}`);
  }
  if (completedWeek && Number(summary.streakAfter) >= 12) add(`${seasonId}-achv-streakLord12`, 'streakLord12', '12-Week Streak');
  if (Number(minutesDone) >= 600) add(`${seasonId}-achv-marathonWeek`, 'marathonWeek', 'Marathon Week');
  if (completedWeek && Number(missedBefore) > 0) add(`${seasonId}-achv-comeback`, 'comeback', 'Comeback');
  return out;
}

/** Rebuild publicUsers.badgesPublic from the badges collection (newest first). */
async function rebuildBadgesPublic(db, uid) {
  const snap = await db.collection('users').doc(uid).collection('badges').get();
  const rows = snap.docs
    .map((d) => {
      const b = d.data() || {};
      const ms = typeof b.earnedAt?.toMillis === 'function' ? b.earnedAt.toMillis() : 0;
      const label =
        b.type === 'seasonRank' ? `Season rank: ${b.tier ?? '?'}${b.division ? ` ${['', 'I', 'II', 'III', 'IV'][b.division]}` : ''}`
        : b.type === 'seasonPeak' ? `Season peak: ${b.tier ?? '?'}${b.division ? ` ${['', 'I', 'II', 'III', 'IV'][b.division]}` : ''}`
        : String(b.title ?? d.id);
      return { id: d.id, type: String(b.type ?? 'achievement'), label, seasonId: b.seasonId ?? null, ms };
    })
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 12)
    .map(({ ms, ...rest }) => rest);
  await db.collection('publicUsers').doc(uid).set({ badgesPublic: rows }, { merge: true });
  return rows.length;
}

/**
 * Award any newly earned badges (create-only = exactly-once) and refresh the
 * mirror when something new landed. Never allowed to break scoring.
 */
async function awardBadges(db, uid, args) {
  try {
    const candidates = badgesForRun(args);
    let created = 0;
    for (const c of candidates) {
      try {
        await db.collection('users').doc(uid).collection('badges').doc(c.docId).create({
          ...c.data,
          earnedAt: FieldValue.serverTimestamp(),
        });
        created += 1;
      } catch {
        /* already earned — the exactly-once path */
      }
    }
    if (created > 0) {
      await rebuildBadgesPublic(db, uid);
      console.log(`[badges] ${uid}: awarded ${created} new badge(s)`);
    }
    return created;
  } catch (e) {
    console.warn('[badges] award failed for', uid, e);
    return 0;
  }
}

module.exports = { awardBadges, badgesForRun, rebuildBadgesPublic };
