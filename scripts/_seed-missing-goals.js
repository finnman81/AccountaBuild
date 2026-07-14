// Seed missing scoring-goal docs from profile targets (onboarding wrote the
// profile fields but never created users/{uid}/goals docs, so workouts and
// calories earned ZERO FP for anyone who never opened the Goals screen).
// Also refreshes the CURRENT week's goalsSnapshot so this week starts counting.
// Usage: node scripts/_seed-missing-goals.js <admin-key> [--dry-run]
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();
const core = require(path.join(__dirname, '..', 'functions', 'mmr-core'));
const DRY = process.argv.includes('--dry-run');

(async () => {
  const currentWeekId = core.isoWeekIdInTz(new Date(), core.DEFAULT_TZ);
  const users = await db.collection('users').get();
  for (const u of users.docs) {
    const d = u.data();
    const name = d.displayName || u.id.slice(0, 8);
    const goalsSnap = await db.collection(`users/${u.id}/goals`).get();
    const goals = {};
    goalsSnap.docs.forEach((g) => (goals[g.id] = g.data()));

    const seeded = {};
    const wTarget = Math.round(Number(d.workoutsPerWeek));
    if (wTarget > 0 && !(goals.workouts && Number.isFinite(goals.workouts.targetWorkoutsPerWeek))) {
      seeded.workouts = { type: 'workouts', status: 'active', targetWorkoutsPerWeek: Math.min(7, wTarget) };
    }
    const cTargetRaw = Math.round(Number(d.logCaloriesDaysPerWeek));
    const cTarget = cTargetRaw > 0 ? cTargetRaw : Number(d.dailyCalorieGoal) > 0 ? 5 : 0; // app default is 5
    if (cTarget > 0 && !(goals.calorieDays && Number.isFinite(goals.calorieDays.targetDaysPerWeek))) {
      seeded.calorieDays = { type: 'calorieDays', status: 'active', targetDaysPerWeek: Math.min(7, cTarget) };
    }
    if (!Object.keys(seeded).length) continue;

    console.log(`${DRY ? '[DRY] ' : ''}${name}: seeding ${Object.entries(seeded).map(([k, v]) => `${k}=${v.targetWorkoutsPerWeek ?? v.targetDaysPerWeek}`).join(', ')}`);
    if (DRY) continue;

    for (const [id, doc_] of Object.entries(seeded)) {
      await db.doc(`users/${u.id}/goals/${id}`).set({ ...doc_, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    // Refresh the current week's snapshot so THIS week scores the new goals.
    const wkRef = db.doc(`users/${u.id}/weekly/${currentWeekId}`);
    const wk = await wkRef.get();
    if (wk.exists && wk.data().goalsSnapshot) {
      await wkRef.set({ goalsSnapshot: { ...wk.data().goalsSnapshot, ...seeded } }, { merge: true });
      console.log(`  ${name}: ${currentWeekId} snapshot refreshed`);
    }
  }
  console.log('done');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
