// Refund FP lost to weeks scored BEFORE the account existed (fixed in
// mmr-compute accountCreatedYmd, 2026-10-11). Deletes those weekly docs and
// adds their FP back by raising this week's anchored mmrBefore, then
// recomputes this week. Test/demo accounts skipped. Dry run unless --apply.
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json')) });
const core = require('../functions/mmr-core');
const { computeUserWeek } = require('../functions/mmr-compute');
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');
const TZ = core.DEFAULT_TZ;
const SKIP_NAMES = /^(Explorer|Test User|Test|test)$/;

(async () => {
  const demo = new Set((await db.collection('groups/demo-review-crew/members').get()).docs.map((d) => d.id));
  const now = new Date();
  const thisWeek = core.isoWeekIdInTz(now, TZ);
  const list = await admin.auth().listUsers(1000);
  for (const a of list.users) {
    if (demo.has(a.uid)) continue;
    const created = core.yyyyMmDdInTz(new Date(a.metadata.creationTime), TZ);
    const userRef = db.doc(`users/${a.uid}`);
    const u = (await userRef.get()).data() || {};
    if (SKIP_NAMES.test(String(u.displayName || ''))) continue;
    const weekly = await db.collection(`users/${a.uid}/weekly`).get();
    const bad = weekly.docs.filter((d) => core.isoWeekDatesInTz(d.id, TZ)[6] < created);
    if (!bad.length) continue;
    const refund = Math.round(bad.reduce((s, d) => s + ((Number(d.get('mmrBefore')) || 0) - (Number(d.get('mmrAfter')) || 0)), 0));
    if (refund <= 0) continue;
    const cur = weekly.docs.find((d) => d.id === thisWeek);
    console.log(`${String(u.displayName || a.uid).padEnd(16)} created ${created}  bad ${bad.map((d) => d.id).join(',')}  refund +${refund}  mmr ${u.mmr} -> ~${(u.mmr || 0) + refund}`);
    if (!APPLY) continue;
    if (!u.createdAt) await userRef.set({ createdAt: admin.firestore.Timestamp.fromDate(new Date(a.metadata.creationTime)) }, { merge: true });
    for (const d of bad) await d.ref.delete();
    if (cur) await cur.ref.update({ mmrBefore: (Number(cur.get('mmrBefore')) || 0) + refund });
    else await userRef.update({ mmr: (Number(u.mmr) || 0) + refund });
    const r = await computeUserWeek(db, { uid: a.uid, weekId: thisWeek, apply: true, now });
    console.log(`   applied: ${thisWeek} mmrBefore ${r.mmrBefore} -> mmrAfter ${r.mmrAfter} (${r.rankAfter})`);
  }
  if (!APPLY) console.log('DRY RUN. Re-run with --apply.');
  process.exit(0);
})();
