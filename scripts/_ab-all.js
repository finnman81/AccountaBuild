// Dry-run A/B: current scorer code vs stored weekly results, every BPM member.
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json')) });
const db = admin.firestore();
const { computeUserWeek } = require('../functions/mmr-compute');
const WEEKS = process.argv.slice(2).length ? process.argv.slice(2) : ['2026-W37', '2026-W38'];
(async () => {
  const mem = await db.collection('groups/WMKt9Qpke5Q6Xhimbyxq/members').get();
  let diffs = 0;
  for (const m of mem.docs) {
    const name = (await db.doc(`publicUsers/${m.id}`).get()).data()?.displayName;
    for (const weekId of WEEKS) {
      const st = (await db.doc(`users/${m.id}/weekly/${weekId}`).get()).data();
      if (!st) continue;
      const r = await computeUserWeek(db, { uid: m.id, weekId, apply: false });
      const same = Math.round(r.mmrAfter) === Math.round(st.mmrAfter) && r.streakAfter === st.streakAfter;
      if (!same) diffs++;
      console.log(same ? 'same' : 'DIFF', String(name).padEnd(13), weekId, 'stored', Math.round(st.mmrAfter), st.streakAfter, '| dry', Math.round(r.mmrAfter), r.streakAfter, r.checkpointsHitNow?.length ? `rungs ${r.checkpointsHitNow}` : '');
    }
  }
  console.log(diffs ? `${diffs} DIFFS` : 'NO DIFFS');
  process.exit(0);
})();
