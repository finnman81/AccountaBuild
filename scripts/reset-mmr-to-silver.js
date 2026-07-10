/**
 * Reset every user's MMR to the start of Silver (fresh-push baseline).
 *
 * Sets, for each user:
 *   users/{uid}:        mmr=1800, rankTier=Silver, rankDivision=4, mp=0,
 *                       streakWeeks=0, tierShieldWeeksRemaining=0,
 *                       consecutiveMissedWeeks=0, prevMmr=1800,
 *                       prevRankTier=Silver, prevRankDivision=4,
 *                       lastWeekIdUpdated=<current ISO week>
 *   publicUsers/{uid}:  mmrPublic=1800, rankTierPublic=Silver,
 *                       rankDivisionPublic=4, mpPublic=0
 *
 * Silver IV (min 1800) is the entry to the Silver tier — everyone starts even
 * and climbs from there. To start higher, change TARGET below (e.g. Silver I =
 * 2400). prevMmr is seeded equal so nobody shows a rank-up/movement on day one.
 *
 * Auth (either one):
 *   A) Service-account key:  pass the JSON path as the 2nd arg.
 *   B) Application Default Credentials: run `gcloud auth application-default login`
 *      once, then pass `adc` (or omit the 2nd arg) instead of a key path.
 *
 * Usage:
 *   node scripts/reset-mmr-to-silver.js <projectId> [serviceAccountKeyPath|adc] [--dry-run]
 *
 * Examples:
 *   node scripts/reset-mmr-to-silver.js accountabuild ./accountabuild-firebase-adminsdk-XXXX.json --dry-run
 *   node scripts/reset-mmr-to-silver.js accountabuild adc --dry-run
 *   node scripts/reset-mmr-to-silver.js accountabuild adc          # apply
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
const positional = args.filter((a) => !a.startsWith('--'));
if (positional.length < 1) {
  console.error('Usage: node scripts/reset-mmr-to-silver.js <projectId> [serviceAccountKeyPath|adc] [--dry-run]');
  process.exit(1);
}
const [projectId, serviceAccountPath] = positional;
const useAdc = !serviceAccountPath || serviceAccountPath.toLowerCase() === 'adc';

/** Current ISO week id (YYYY-Www), Monday-based, UTC — matches app week ids closely enough for a reset baseline. */
function currentIsoWeekId() {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3); // nearest Thursday
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

async function run() {
  console.log('='.repeat(60));
  console.log(`Reset all MMR → ${TARGET.rankTier} ${TARGET.rankDivision} (${TARGET.mmr} MMR)`);
  console.log('Project:', projectId, dryRun ? '· DRY RUN (no writes)' : '· APPLYING');
  console.log('='.repeat(60));

  const usersSnap = await db.collection('users').get();
  console.log(`Found ${usersSnap.size} users`);

  let processed = 0;
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    if (!dryRun) {
      const batch = db.batch();
      batch.set(
        userDoc.ref,
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
          // Fresh start THIS week so catch-up doesn't re-penalize prior weeks.
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

      // Durability: clear stale weekly summaries, or the app's next recompute
      // reuses the old weekly `mmrBefore` baseline and silently reverts this
      // reset (this bit us on the single-user script — same fix).
      const weekly = await db.collection('users').doc(uid).collection('weekly').get();
      if (!weekly.empty) {
        const delBatch = db.batch();
        weekly.docs.forEach((d) => delBatch.delete(d.ref));
        await delBatch.commit();
      }
    }
    processed += 1;
    if (processed % 25 === 0) console.log(`Processed ${processed}/${usersSnap.size}...`);
  }

  console.log(`✅ ${dryRun ? 'Would update' : 'Updated'} ${processed} users to ${TARGET.rankTier} ${TARGET.rankDivision}.`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
