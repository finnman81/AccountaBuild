/**
 * Put a member into (or out of) hibernation from the server.
 *
 *   node scripts/_hibernate.js <admin-key.json> status "Nick Umana"
 *   node scripts/_hibernate.js <admin-key.json> set "Nick Umana" 6 "army training" [--apply]
 *   node scripts/_hibernate.js <admin-key.json> clear "Nick Umana" [--apply]
 *
 * The callable is the normal path (Settings -> Hibernation, or a group admin
 * acting for someone). This exists for the case it was built for: the member
 * already left and can't tap anything.
 *
 * Dry-run by default. It prints what the weeks would cost if they DIDN'T
 * hibernate, which is the whole argument for the feature.
 */
const path = require('path');
const admin = require(path.join(process.cwd(), 'functions', 'node_modules', 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();
const { applyHibernation, clearHibernation } = require(path.join(process.cwd(), 'functions', 'hibernation'));

const [, , , cmd, name, weeksArg, reasonArg] = process.argv;
const APPLY = process.argv.includes('--apply');

async function findUid(displayName) {
  const snap = await db.collection('publicUsers').where('displayName', '==', displayName).get();
  if (snap.empty) throw new Error(`no user named "${displayName}"`);
  return snap.docs[0].id;
}

(async () => {
  const uid = await findUid(name);
  const user = (await db.doc(`users/${uid}`).get()).data() || {};

  if (cmd === 'status') {
    console.log(`${name} (${uid})`);
    console.log('  mmr', user.mmr, '| tier', user.rankTier, user.rankDivision, '| streak', user.streakWeeks);
    console.log('  hibernation:', JSON.stringify(user.hibernation || null));
    process.exit(0);
  }

  if (cmd === 'clear') {
    console.log(`${APPLY ? 'WAKING' : '[dry run] would wake'} ${name}`);
    if (APPLY) await clearHibernation(db, uid);
    process.exit(0);
  }

  if (cmd === 'set') {
    const weeks = Number(weeksArg);
    // What the absence costs WITHOUT the shield — the before/after that makes
    // the case for the feature.
    let m = Number(user.mmr) || 0;
    for (let i = 0; i < weeks; i += 1) m = Math.max(0, Math.round(m - Math.max(30, 0.015 * m)));
    console.log(`${name}: ${user.mmr} FP, ${user.rankTier} ${user.rankDivision}, ${user.streakWeeks}w streak`);
    console.log(`  unprotected ${weeks} weeks -> ${m} FP (${m - user.mmr}), streak 0`);
    console.log(`  hibernating ${weeks} weeks -> ${user.mmr} FP held, streak ${user.streakWeeks} held, +1 grace week`);
    if (!APPLY) return console.log('\npass --apply to set it');
    const h = await applyHibernation(db, { uid, weeks, reason: reasonArg, setBy: 'admin-script' });
    console.log(`\nset: ${h.fromWeekId} -> ${h.untilWeekId} (grace ${h.graceWeekId})`);
    process.exit(0);
  }

  console.error('usage: _hibernate.js <key> (status|set|clear) "<Display Name>" [weeks] [reason] [--apply]');
  process.exit(1);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
