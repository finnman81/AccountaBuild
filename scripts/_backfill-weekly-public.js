// One-time backfill: mirror users/{uid}/weekly -> publicUsers/{uid}/weeklyPublic
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();
(async () => {
  const users = await db.collection('users').get();
  let mirrored = 0;
  for (const u of users.docs) {
    const weekly = await db.collection('users').doc(u.id).collection('weekly').get();
    for (const w of weekly.docs) {
      const d = w.data();
      const rankAfter = d.rankAfter || {};
      await db.collection('publicUsers').doc(u.id).collection('weeklyPublic').doc(w.id).set({
        weekId: w.id,
        seasonId: d.seasonId ?? null,
        mmrAfter: Number(d.mmrAfter) || 0,
        deltaMMR: Number(d.deltaMMR) || 0,
        tier: rankAfter.tier ?? null,
        division: rankAfter.division ?? null,
        completedWeek: Boolean(d.completedWeek),
        workoutsDone: Number(d.workoutsDone) || 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      mirrored += 1;
    }
  }
  console.log(`Mirrored ${mirrored} weekly docs across ${users.size} users.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
