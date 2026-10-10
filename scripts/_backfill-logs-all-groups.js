// One-time: copy every member's existing logs into ALL their groups (same doc
// id), matching the "every log posts to all groups" rule (commit b372de1).
// Copies carry backfilled:true so the log triggers (team push, health
// hygiene, check-ins) skip them. Dry run by default; --apply writes.
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json')) });
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');
const SKIP = new Set(['demo-review-crew']);

(async () => {
  const users = await db.collection('users').get();
  let total = 0;
  for (const u of users.docs) {
    const gs = await db.collection(`users/${u.id}/groups`).get();
    const groupIds = gs.docs.map((d) => String(d.get('groupId') || d.id)).filter((g) => g && !SKIP.has(g));
    if (groupIds.length < 2) continue;
    // Only groups they're really a member of.
    const live = [];
    for (const g of groupIds) if ((await db.doc(`groups/${g}/members/${u.id}`).get()).exists) live.push(g);
    if (live.length < 2) continue;

    const byGroup = {};
    for (const g of live) {
      const snap = await db.collection(`groups/${g}/logs`).where('uid', '==', u.id).get();
      byGroup[g] = new Map(snap.docs.map((d) => [d.id, d.data()]));
    }
    const union = new Map();
    for (const g of live) for (const [id, data] of byGroup[g]) if (!union.has(id)) union.set(id, data);

    const name = (await db.doc(`publicUsers/${u.id}`).get()).get('displayName') || u.id;
    for (const g of live) {
      const missing = [...union].filter(([id]) => !byGroup[g].has(id));
      console.log(`${String(name).padEnd(14)} -> ${g}: has ${byGroup[g].size}, copying ${missing.length}`);
      total += missing.length;
      if (!APPLY) continue;
      for (let i = 0; i < missing.length; i += 400) {
        const batch = db.batch();
        for (const [id, data] of missing.slice(i, i + 400)) {
          const { reactions, ...rest } = data; // reactions belong to the source group's members
          batch.set(db.doc(`groups/${g}/logs/${id}`), { ...rest, backfilled: true });
        }
        await batch.commit();
      }
    }
  }
  console.log(APPLY ? `copied ${total}` : `DRY RUN: would copy ${total}. Re-run with --apply.`);
  process.exit(0);
})();
