/**
 * Set ONE user's MMR to the start of Silver IV (1800) — same baseline as the
 * fleet-wide scripts/reset-mmr-to-silver.js, but scoped to a single account.
 *
 * Resolves the target account from an identifier, trying in order:
 *   1. exact users/{uid} doc id
 *   2. usernames/{identifier-lowercased} -> uid
 *   3. case-insensitive scan of users.displayName / users.username (exact, then contains)
 * If more than one account matches (and none is exact), it lists them and exits
 * without writing, so you can re-run with a precise uid.
 *
 * Auth (either one):
 *   A) Service-account key:  pass the JSON path as the 2nd arg.
 *   B) Application Default Credentials: `gcloud auth application-default login`
 *      once, then pass `adc` (or omit) instead of a key path.
 *
 * Usage:
 *   node scripts/set-user-mmr-silver.js <projectId> [keyPath|adc] --user <identifier> [--dry-run]
 *
 * Examples:
 *   node scripts/set-user-mmr-silver.js accountabuild adc --user redomond --dry-run
 *   node scripts/set-user-mmr-silver.js accountabuild ./firebase-adminsdk.json --user redomond
 */

const TARGET = { mmr: 1800, rankTier: 'Silver', rankDivision: 4, mp: 0 };

let admin;
try {
  admin = require('firebase-admin');
} catch (error) {
  console.error('❌ firebase-admin is not installed. Run: npm install --save-dev firebase-admin');
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const userIdx = args.indexOf('--user');
const identifier = userIdx >= 0 ? args[userIdx + 1] : null;
const positional = args.filter((a, i) => !a.startsWith('--') && i !== userIdx + 1);
if (positional.length < 1 || !identifier) {
  console.error('Usage: node scripts/set-user-mmr-silver.js <projectId> [keyPath|adc] --user <identifier> [--dry-run]');
  process.exit(1);
}
const [projectId, serviceAccountPath] = positional;
const useAdc = !serviceAccountPath || serviceAccountPath.toLowerCase() === 'adc';

function currentIsoWeekId() {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

if (!admin.apps.length) {
  try {
    if (useAdc) {
      admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
      console.log('✅ Firebase Admin initialized (Application Default Credentials)');
    } else {
      const serviceAccount = require(require('path').resolve(serviceAccountPath));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId });
      console.log('✅ Firebase Admin initialized (service-account key)');
    }
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    if (useAdc) console.error('   Tip: run `gcloud auth application-default login` first, or pass a service-account key path.');
    process.exit(1);
  }
}

const db = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();
const weekId = currentIsoWeekId();

async function resolveUid(id) {
  // 1. Exact uid.
  const byId = await db.collection('users').doc(id).get();
  if (byId.exists) return { uid: id, how: 'uid', data: byId.data() };

  // 2. usernames mapping (normalized lowercase).
  const norm = String(id).trim().toLowerCase();
  const uname = await db.collection('usernames').doc(norm).get();
  if (uname.exists && uname.data()?.uid) {
    const u = await db.collection('users').doc(uname.data().uid).get();
    return { uid: uname.data().uid, how: 'username', data: u.data() };
  }

  // 3. Scan users for displayName / username match.
  const snap = await db.collection('users').get();
  const wanted = norm;
  const exact = [];
  const contains = [];
  snap.forEach((doc) => {
    const d = doc.data() || {};
    const dn = String(d.displayName ?? '').trim().toLowerCase();
    const un = String(d.username ?? '').trim().toLowerCase();
    if (dn === wanted || un === wanted) exact.push({ uid: doc.id, data: d });
    else if (dn.includes(wanted) || un.includes(wanted)) contains.push({ uid: doc.id, data: d });
  });
  if (exact.length === 1) return { uid: exact[0].uid, how: 'displayName/username (exact)', data: exact[0].data };
  if (exact.length > 1) return { ambiguous: exact };
  if (contains.length === 1) return { uid: contains[0].uid, how: 'displayName/username (contains)', data: contains[0].data };
  if (contains.length > 1) return { ambiguous: contains };
  return null;
}

async function run() {
  console.log('='.repeat(60));
  console.log(`Set ONE user → ${TARGET.rankTier} ${TARGET.rankDivision} (${TARGET.mmr} MMR)`);
  console.log('Project:', projectId, '· identifier:', identifier, dryRun ? '· DRY RUN (no writes)' : '· APPLYING');
  console.log('='.repeat(60));

  const res = await resolveUid(identifier);
  if (!res) {
    console.error(`❌ No account matched "${identifier}" (by uid, username, or displayName).`);
    process.exit(2);
  }
  if (res.ambiguous) {
    console.error(`⚠️ "${identifier}" matched ${res.ambiguous.length} accounts — re-run with an exact uid:`);
    res.ambiguous.forEach((m) => console.error(`   ${m.uid}  displayName="${m.data?.displayName ?? ''}" username="${m.data?.username ?? ''}"`));
    process.exit(3);
  }

  const { uid, how, data } = res;
  console.log(`Matched via ${how}: uid=${uid}  displayName="${data?.displayName ?? ''}" username="${data?.username ?? ''}"`);
  console.log(`Current: mmr=${data?.mmr ?? '—'} ${data?.rankTier ?? '—'} ${data?.rankDivision ?? ''}`);

  if (dryRun) {
    console.log(`✅ DRY RUN — would set uid=${uid} to ${TARGET.rankTier} ${TARGET.rankDivision} (${TARGET.mmr}).`);
    return;
  }

  const batch = db.batch();
  batch.set(
    db.collection('users').doc(uid),
    {
      mmr: TARGET.mmr,
      rankTier: TARGET.rankTier,
      rankDivision: TARGET.rankDivision,
      mp: TARGET.mp,
      streakWeeks: 0,
      tierShieldWeeksRemaining: 0,
      consecutiveMissedWeeks: 0,
      prevMmr: TARGET.mmr,
      prevRankTier: TARGET.rankTier,
      prevRankDivision: TARGET.rankDivision,
      // Treat this reset as a fresh start THIS week so the app's catch-up doesn't
      // walk back and re-penalize prior weeks.
      firstWeekId: weekId,
      lastWeekIdUpdated: weekId,
      updatedAt: now,
    },
    { merge: true },
  );
  batch.set(
    db.collection('publicUsers').doc(uid),
    {
      mmrPublic: TARGET.mmr,
      rankTierPublic: TARGET.rankTier,
      rankDivisionPublic: TARGET.rankDivision,
      mpPublic: TARGET.mp,
      updatedAt: now,
    },
    { merge: true },
  );
  await batch.commit();

  // Clear existing weekly summaries. Otherwise the app's next recompute reuses a
  // stale weekly `mmrBefore` (idempotency) and reverts this reset.
  const weekly = await db.collection('users').doc(uid).collection('weekly').get();
  if (!weekly.empty) {
    const delBatch = db.batch();
    weekly.docs.forEach((d) => delBatch.delete(d.ref));
    await delBatch.commit();
    console.log(`   cleared ${weekly.size} stale weekly summary doc(s)`);
  }

  console.log(`✅ Set uid=${uid} to ${TARGET.rankTier} ${TARGET.rankDivision} (${TARGET.mmr}) — durable.`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
