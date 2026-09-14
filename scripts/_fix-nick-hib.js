// Repair: the auto-wake overwrote Nick's range with 'x' before W37 closed, so
// W37 lost its shield (-39 FP, 3-week streak -> 0). Restore the range, then
// re-close W37 and recompute W38. Dry run by default.
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json')) });
const db = admin.firestore();
const { computeUserWeek } = require('../functions/mmr-compute');
const APPLY = process.argv.includes('--apply');
const uid = 'ZOf2lXKIZyS2yE86MPNfMPoCeYi2';
(async () => {
  const hibFix = { 'hibernation.fromWeekId': '2026-W34', 'hibernation.untilWeekId': '2026-W37', 'hibernation.graceWeekId': '2026-W38', 'hibernation.awake': true };
  if (APPLY) {
    await db.doc(`users/${uid}`).update(hibFix);
    await db.doc(`publicUsers/${uid}`).set({ hibernatingFromWeekId: '2026-W34', hibernatingUntilWeekId: '2026-W37' }, { merge: true });
  }
  for (const weekId of ['2026-W37', '2026-W38']) {
    if (!APPLY) {
      // Dry run needs the restored range visible to the scorer: simulate by
      // reporting what the stored doc says; the real check is post-apply.
      const s = (await db.doc(`users/${uid}/weekly/${weekId}`).get()).data();
      console.log('stored', weekId, Math.round(s.mmrBefore), '->', Math.round(s.mmrAfter), 'pen', s.penalty, 'stk', s.streakBefore, '->', s.streakAfter);
      continue;
    }
    const r = await computeUserWeek(db, { uid, weekId, apply: true });
    console.log('applied', weekId, Math.round(r.mmrBefore), '->', Math.round(r.mmrAfter), 'pen', r.penalty, 'stk', r.streakAfter);
  }
  const u = (await db.doc(`users/${uid}`).get()).data();
  console.log('user', Math.round(u.mmr), 'streakWeeks', u.streakWeeks, JSON.stringify(u.hibernation));
  process.exit(0);
})();
