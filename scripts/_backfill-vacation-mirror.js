// One-time: write publicUsers.vacationWeekIds for every user (the new shield
// list), folding in each user's legacy From/Until range. Dry run by default.
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json')) });
const db = admin.firestore();
const { mirrorVacation } = require('../functions/vacation');
const APPLY = process.argv.includes('--apply');
(async () => {
  const users = await db.collection('users').get();
  for (const u of users.docs) {
    const pub = (await db.doc(`publicUsers/${u.id}`).get()).data() || {};
    const flagged = (await db.collection(`users/${u.id}/weekly`).where('vacation', '==', true).get()).docs.map((d) => d.id);
    if (!flagged.length && !pub.vacationFromWeekId) continue;
    if (!APPLY) { console.log(String(pub.displayName).padEnd(14), 'flags', flagged.join(','), '| range', pub.vacationFromWeekId, '-', pub.vacationUntilWeekId); continue; }
    const ids = await mirrorVacation(db, u.id);
    console.log(String(pub.displayName).padEnd(14), '->', ids.join(','));
  }
  if (!APPLY) console.log('[dry run] pass --apply');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
