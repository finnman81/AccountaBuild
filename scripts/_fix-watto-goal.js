// Repair: Watto's NEW goal (216 -> 212, set 2026-08-31) was stamped "completed"
// by the old goal's (222 -> 215) math. Reset it to a fresh active goal and
// delete the duplicate daily celebrations (keep the genuine 08-31 one).
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json')) });
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');
(async () => {
  const uid='WZWzubjLkjTGV4L6G5Yq3qNRFtk1';
  const ref = db.collection('users').doc(uid).collection('goals').doc('weightLoss');
  const g = (await ref.get()).data();
  console.log('before', JSON.stringify(g));
  const patch = { checkpointsAwarded: [], completionBonusAwarded: false, status: 'active', completionDate: null };
  const ann = db.collection('groups').doc('WMKt9Qpke5Q6Xhimbyxq').collection('announcements');
  const dupes = ['2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05'].map(d=>`goal-weightLoss-${uid}-${d}`);
  if (!APPLY) { console.log('DRY RUN. would patch', patch, 'and delete', dupes); process.exit(0); }
  await ref.set(patch, { merge: true });
  for (const id of dupes) await ann.doc(id).delete();
  console.log('after', JSON.stringify((await ref.get()).data()));
  process.exit(0);
})();
