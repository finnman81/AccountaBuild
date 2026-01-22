/**
 * Inspect a user's MMR-related data to see why rank/MMR hasn't been computed.
 *
 * Usage:
 *   node scripts/inspect-mmr-user.js <projectId> <serviceAccountKeyPath> <uid>
 */

let admin;
try {
  admin = require('firebase-admin');
} catch {
  console.error('❌ firebase-admin not installed. Run: npm install --save-dev firebase-admin');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: node scripts/inspect-mmr-user.js <projectId> <serviceAccountKeyPath> <uid>');
  process.exit(1);
}

const [projectId, serviceAccountPath, uid] = args;

if (!admin.apps.length) {
  try {
    const serviceAccount = require(require('path').resolve(serviceAccountPath));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
    console.log('✅ Firebase Admin initialized');
  } catch (e) {
    console.error('❌ Failed to init admin:', e);
    process.exit(1);
  }
}

const db = admin.firestore();

async function run() {
  console.log('=== Inspecting MMR state for uid:', uid, '===');

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    console.log('User doc does NOT exist.');
    return;
  }

  const user = userSnap.data() || {};
  console.log('\n-- users/{uid} --');
  console.log(
    JSON.stringify(
      {
        mmr: user.mmr ?? null,
        rankTier: user.rankTier ?? null,
        rankDivision: user.rankDivision ?? null,
        mp: user.mp ?? user.lp ?? null,
        streakWeeks: user.streakWeeks ?? 0,
        consecutiveMissedWeeks: user.consecutiveMissedWeeks ?? 0,
        lastWeekIdUpdated: user.lastWeekIdUpdated ?? null,
        rulesVersion: user.rulesVersion ?? null,
        firstWeekId: user.firstWeekId ?? null,
        dailyCalorieGoal: user.dailyCalorieGoal ?? null,
        workoutsPerWeek: user.workoutsPerWeek ?? null,
      },
      null,
      2,
    ),
  );

  console.log('\n-- Goals (users/{uid}/goals) --');
  const goalsSnap = await userRef.collection('goals').get();
  const goals = {};
  for (const d of goalsSnap.docs) goals[d.id] = d.data() || {};
  console.log(JSON.stringify(goals, null, 2));

  console.log('\n-- Weekly summaries (users/{uid}/weekly, latest 3) --');
  const weeklySnap = await userRef.collection('weekly').orderBy(admin.firestore.FieldPath.documentId(), 'desc').limit(3).get();
  const weekly = weeklySnap.docs.map((d) => {
    const data = d.data() || {};
    return { id: d.id, ...data };
  });
  console.log(JSON.stringify(weekly, null, 2));

  console.log('\n-- Group memberships (users/{uid}/groups) --');
  const groupsSnap = await userRef.collection('groups').get();
  const groupIds = [];
  for (const d of groupsSnap.docs) {
    const data = d.data() || {};
    groupIds.push(String(data.groupId ?? d.id));
  }
  console.log(groupIds.length ? groupIds : '(none)');

  if (groupIds.length) {
    console.log('\n-- Recent logs (last 50 per group) --');
    for (const gid of groupIds) {
      const logsSnap = await db
        .collection('groups')
        .doc(gid)
        .collection('logs')
        .where('uid', '==', uid)
        .orderBy('ts', 'desc')
        .limit(50)
        .get();
      console.log(`Group ${gid}: ${logsSnap.size} logs`);
      const logs = logsSnap.docs.map((d) => ({
        id: d.id,
        date: d.data().date,
        type: d.data().type,
        source: d.data().source,
        payload: d.data().payload,
      }));
      console.log(JSON.stringify(logs, null, 2));
    }
  }
}

run()
  .then(() => {
    console.log('\n=== Done ===');
    process.exit(0);
  })
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  });

