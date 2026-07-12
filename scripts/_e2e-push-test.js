// End-to-end cheer/nudge pipeline test against the DEPLOYED sendSocialPush
// function. Writes real pushQueue docs (like the app does), waits, then
// verifies: queue consumed, activity items written, gating enforced.
//
// Cases:
//  1. cheer -> Jake (token, allowNudges=true): expect activity + push to phone
//  2. nudge -> Jake (allowNudges=true):        expect activity + push to phone
//  3. nudge -> Watto (allowNudges NOT set):    expect BLOCKED (no activity)
//  4. cheer -> Matt (no token):                expect activity, no push, consumed
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const users = await db.collection('users').get();
  const byName = (n) => users.docs.find((d) => (d.data().displayName || '') === n);
  const jake = byName('Finnman81');
  const watto = byName('Watto');
  const matt = byName('Matt');
  if (!jake || !watto || !matt) throw new Error('missing test users');

  const activityCountBefore = async (uid) => (await db.collection('users').doc(uid).collection('activity').get()).size;
  const before = { jake: await activityCountBefore(jake.id), watto: await activityCountBefore(watto.id), matt: await activityCountBefore(matt.id) };

  const enqueue = (toUid, type, label) =>
    db.collection('pushQueue').add({ toUid, fromUid: 'e2e-test', fromName: label, type, createdAt: admin.firestore.FieldValue.serverTimestamp() });

  console.log('Enqueueing 4 test items through the real pipeline…');
  await enqueue(jake.id, 'cheer', 'E2E CheerTest');
  await enqueue(jake.id, 'nudge', 'E2E NudgeTest');
  await enqueue(watto.id, 'nudge', 'E2E GateTest');
  await enqueue(matt.id, 'cheer', 'E2E NoTokenTest');

  console.log('Waiting 20s for the deployed function to process…');
  await sleep(20000);

  const leftovers = await db.collection('pushQueue').get();
  const after = { jake: await activityCountBefore(jake.id), watto: await activityCountBefore(watto.id), matt: await activityCountBefore(matt.id) };

  console.log('\n=== RESULTS ===');
  console.log(`pushQueue leftovers: ${leftovers.size} (expect 0 = all consumed)`);
  console.log(`Jake activity: ${before.jake} -> ${after.jake} (expect +2: cheer + nudge)`);
  console.log(`Watto activity: ${before.watto} -> ${after.watto} (expect +0: nudge blocked, allowNudges not set)`);
  console.log(`Matt activity: ${before.matt} -> ${after.matt} (expect +1: cheer recorded despite no token)`);

  const pass =
    leftovers.size === 0 &&
    after.jake === before.jake + 2 &&
    after.watto === before.watto &&
    after.matt === before.matt + 1;
  console.log(pass ? '\n✅ ALL PIPELINE CHECKS PASSED (Jake: check your phone for 2 pushes)' : '\n❌ SOMETHING FAILED — see above');
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
