// Surgical cleanup: remove Finnman81's PRE-RESET weekly docs (weekId < 2026-W28,
// the fleet-reset week) and clamp firstWeekId to the reset week so catch-up never
// recomputes that era. Current MMR + post-reset weeks untouched.
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();

const RESET_WEEK = '2026-W28';

(async () => {
  const snap = await db.collection('users').get();
  const jake = snap.docs.find((d) => (d.data().displayName || '') === 'Finnman81');
  if (!jake) throw new Error('Finnman81 not found');
  const u = jake.data();
  console.log(`Before: mmr=${u.mmr} rank=${u.rankTier} ${u.rankDivision} firstWk=${u.firstWeekId} lastWk=${u.lastWeekIdUpdated}`);

  const weekly = await db.collection('users').doc(jake.id).collection('weekly').get();
  const stale = weekly.docs.filter((d) => d.id < RESET_WEEK);
  const kept = weekly.docs.filter((d) => d.id >= RESET_WEEK).map((d) => d.id);
  console.log(`Weekly docs: ${weekly.size} total; deleting ${stale.length} pre-reset [${stale.map((d) => d.id).join(', ')}]; keeping [${kept.join(', ')}]`);

  const batch = db.batch();
  stale.forEach((d) => batch.delete(d.ref));
  batch.set(db.collection('users').doc(jake.id), { firstWeekId: RESET_WEEK, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();

  const after = (await db.collection('users').doc(jake.id).get()).data();
  console.log(`After:  mmr=${after.mmr} rank=${after.rankTier} ${after.rankDivision} firstWk=${after.firstWeekId} lastWk=${after.lastWeekIdUpdated}`);
  console.log('✅ Pre-reset history cleaned; current standing preserved.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
