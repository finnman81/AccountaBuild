/**
 * Reset demotion/missed-week flags and set 7-day streak for all users.
 *
 * Usage:
 *   node scripts/reset-demotion-streaks.js <projectId> <serviceAccountKeyPath>
 *
 * Example:
 *   node scripts/reset-demotion-streaks.js accountabuild ./accountabuild-firebase-adminsdk-fbsvc-96d847c201.json
 */

let admin;
try {
  admin = require('firebase-admin');
} catch (error) {
  console.error('❌ Error: firebase-admin is not installed.');
  console.error('Please install it first: npm install --save-dev firebase-admin');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node scripts/reset-demotion-streaks.js <projectId> <serviceAccountKeyPath>');
  process.exit(1);
}

const [projectId, serviceAccountPath] = args;

if (!admin.apps.length) {
  try {
    const serviceAccount = require(require('path').resolve(serviceAccountPath));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
    console.log('✅ Firebase Admin initialized with service account key');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    process.exit(1);
  }
}

const db = admin.firestore();
const FieldPath = admin.firestore.FieldPath;

async function resetUser(userDoc) {
  const uid = userDoc.id;
  const userRef = userDoc.ref;

  // Update user state to clear demotion/missed week flags and set streak
  await userRef.set(
    {
      consecutiveMissedWeeks: 0,
      tierShieldWeeksRemaining: 5,
      streakWeeks: 7,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // Update latest weekly summary to clear missedWeek/demotion flags
  const weeklyRef = userRef.collection('weekly');
  const weeklySnap = await weeklyRef.get();
  if (!weeklySnap.empty) {
    let latestDoc = weeklySnap.docs[0];
    for (const doc of weeklySnap.docs) {
      if (doc.id > latestDoc.id) latestDoc = doc;
    }
    await latestDoc.ref.set(
      {
        missedWeek: false,
        completedWeek: true,
        penalty: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
}

async function run() {
  console.log('='.repeat(60));
  console.log('Reset demotion/missed weeks and set streaks');
  console.log('Project:', projectId);
  console.log('='.repeat(60));

  const usersSnap = await db.collection('users').get();
  console.log(`Found ${usersSnap.size} users`);

  let processed = 0;
  for (const userDoc of usersSnap.docs) {
    await resetUser(userDoc);
    processed += 1;
    if (processed % 25 === 0) {
      console.log(`Processed ${processed}/${usersSnap.size} users...`);
    }
  }

  console.log(`✅ Completed. Updated ${processed} users.`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
