// Admin grant: extend Alex's vacation through W38 (back Mon Sep 21).
// Keeps the W35 start so past weeks stay shielded for the daily streak.
// Over the 2/season allowance on purpose (Jake's call), so vacationUsed is
// left alone. Dry run by default.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json')) });
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');
const uid = 'jzFKbPLJDXPLsqlXjKItFql2l0n2';
(async () => {
  const pubRef = db.doc(`publicUsers/${uid}`);
  const wkRef = db.doc(`users/${uid}/weekly/2026-W38`);
  const [pub, wk] = await Promise.all([pubRef.get(), wkRef.get()]);
  const p = pub.data() || {};
  console.log(p.displayName, '| now', p.vacationFromWeekId, '->', p.vacationUntilWeekId, '| W38 vacation', wk.data()?.vacation);
  if (!APPLY) return console.log('[dry run] would set W38 vacation=true, mirror W35 -> W38. Pass --apply');
  await wkRef.set({ vacation: true, vacationSetAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await pubRef.set({ vacationFromWeekId: '2026-W35', vacationUntilWeekId: '2026-W38', vacationWeekId: '2026-W38' }, { merge: true });
  const after = (await pubRef.get()).data();
  console.log('done |', after.vacationFromWeekId, '->', after.vacationUntilWeekId, '| W38 vacation', (await wkRef.get()).data().vacation);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
