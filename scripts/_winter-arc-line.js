// Add the Q4 scoring note to the Winter Arc kickoff pop-up (goes live Sep 28,
// 9 AM ET). Inserts before the closing "Nobody left behind." Dry run by default.
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json')) });
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');
const LINE =
  "A new season starts today too, with two changes. Ranks no longer reset every quarter, only once a year in January, and then by a single tier. And from Platinum up the climb gets steeper, so the same week earns fewer points than it used to. If your numbers look smaller at the top, that's the design and not a bug.";
(async () => {
  const ref = db.doc('groups/WMKt9Qpke5Q6Xhimbyxq/announcements/winter-arc-kickoff');
  const snap = await ref.get();
  if (!snap.exists) throw new Error('pop-up not found');
  const lines = snap.data().lines.filter((l) => l !== LINE);
  const i = lines.lastIndexOf('Nobody left behind.');
  const next = i >= 0 ? [...lines.slice(0, i), LINE, ...lines.slice(i)] : [...lines, LINE];
  console.log(`"${snap.data().title}" | live ${snap.data().activeFrom}\n`);
  next.forEach((l, n) => console.log(`${n + 1}. ${l}\n`));
  if (!APPLY) return console.log('[dry run] pass --apply');
  await ref.update({ lines: next });
  console.log('updated');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
