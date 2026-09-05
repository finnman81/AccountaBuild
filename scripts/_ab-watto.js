// Dry-run A/B: patched scorer vs stored weekly docs for Watto W35/W36.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json')) });
const db = admin.firestore();
const { computeUserWeek } = require('../functions/mmr-compute');
(async () => {
  const uid='WZWzubjLkjTGV4L6G5Yq3qNRFtk1';
  for (const weekId of ['2026-W35','2026-W36']) {
    const stored = (await db.collection('users').doc(uid).collection('weekly').doc(weekId).get()).data();
    const r = await computeUserWeek(db, { uid, weekId, apply:false });
    console.log(weekId, JSON.stringify({ stored:{mmrAfter:stored.mmrAfter, wb:stored.weightBonus}, dry:{mmrAfter:r.mmrAfter, bonus:r.bonus, bonusAwardedNow:r.bonusAwardedNow, goalCompletedNow:r.goalCompletedNow, checkpointsHitNow:r.checkpointsHitNow} }));
  }
  process.exit(0);
})();
