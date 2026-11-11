/**
 * A throwaway account for emulator tests, in its own group, so tests can log,
 * change settings and send chat without touching any real member.
 *
 *   node scripts/_seed-test-account.js <admin-key.json>            create (or reuse) it
 *   node scripts/_seed-test-account.js <admin-key.json> --delete   remove the account, group and data
 *
 * Group "Emulator Test" (id emu-test-group): the tester plus one fake mate
 * with no push token, so the team views have someone in them. No real member
 * is ever added. The login goes to .emu-test-account.json (git-ignored) and is
 * never printed. scripts/emu-signin-test.sh reads it.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require(path.join(process.cwd(), 'functions', 'node_modules', 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();
const { FieldValue } = admin.firestore;
const core = require(path.join(process.cwd(), 'functions', 'mmr-core'));

const GROUP_ID = 'emu-test-group';
const GROUP_NAME = 'Emulator Test';
const JOIN_CODE = 'EMUT26';
const CRED_FILE = path.join(process.cwd(), '.emu-test-account.json');
const PEOPLE = [
  { key: 'tester', name: 'Emu Tester', email: 'emu.tester@munitor.ai', role: 'admin' },
  { key: 'mate', name: 'Test Mate', email: 'emu.mate@munitor.ai', role: 'member' },
];

async function wipeCollection(ref) {
  const snap = await ref.get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
  return snap.size;
}

async function remove() {
  let n = 0;
  for (const c of ['logs', 'messages', 'signatures', 'announcements', 'members']) n += await wipeCollection(db.collection(`groups/${GROUP_ID}/${c}`));
  await db.doc(`groups/${GROUP_ID}`).delete();
  await db.doc(`joinCodes/${JOIN_CODE}`).delete();
  for (const p of PEOPLE) {
    const u = await admin.auth().getUserByEmail(p.email).catch(() => null);
    if (!u) continue;
    for (const c of ['groups', 'goals', 'weights', 'activity', 'mmrWeekly', 'fpDaily', 'badges']) n += await wipeCollection(db.collection(`users/${u.uid}/${c}`));
    await db.doc(`users/${u.uid}`).delete();
    await db.doc(`publicUsers/${u.uid}`).delete();
    await admin.auth().deleteUser(u.uid);
    console.log('deleted', p.name);
  }
  if (fs.existsSync(CRED_FILE)) fs.unlinkSync(CRED_FILE);
  console.log(`removed group ${GROUP_ID} and ${n} docs`);
}

async function create() {
  const saved = fs.existsSync(CRED_FILE) ? JSON.parse(fs.readFileSync(CRED_FILE, 'utf8')) : null;
  const password = (saved && saved.password) || crypto.randomBytes(12).toString('base64url');
  const uids = {};
  for (const p of PEOPLE) {
    let u = await admin.auth().getUserByEmail(p.email).catch(() => null);
    if (u) await admin.auth().updateUser(u.uid, { password, displayName: p.name });
    else u = await admin.auth().createUser({ email: p.email, password, displayName: p.name });
    uids[p.key] = u.uid;
  }
  fs.writeFileSync(CRED_FILE, JSON.stringify({ email: PEOPLE[0].email, password, uid: uids.tester, groupId: GROUP_ID }, null, 2));

  await db.doc(`groups/${GROUP_ID}`).set({
    name: GROUP_NAME, createdBy: uids.tester, memberCount: PEOPLE.length, joinCode: JOIN_CODE,
    streakRule: 'any', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.doc(`joinCodes/${JOIN_CODE}`).set({ joinCode: JOIN_CODE, groupId: GROUP_ID, name: GROUP_NAME, description: null, createdBy: uids.tester });

  for (const p of PEOPLE) {
    const uid = uids[p.key];
    await db.doc(`groups/${GROUP_ID}/members/${uid}`).set({ uid, role: p.role });
    await db.doc(`users/${uid}/groups/${GROUP_ID}`).set({ groupId: GROUP_ID, name: GROUP_NAME, joinCode: JOIN_CODE, role: p.role });
    await db.doc(`users/${uid}`).set({
      email: p.email, displayName: p.name, height: 70,
      mmr: core.STARTING_MMR, rankTier: 'Silver', rankDivision: 4, mp: 0,
      prevMmr: core.STARTING_MMR, prevRankTier: 'Silver', prevRankDivision: 4,
      dailyCalorieGoal: 2000, goalMode: 'cut', units: 'imperial',
      onboarding: { completed: true, version: 2, completedAt: FieldValue.serverTimestamp() },
      currentSeasonId: core.seasonIdFromDate(new Date(), core.DEFAULT_TZ),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await db.doc(`publicUsers/${uid}`).set({
      uid, displayName: p.name, photoURL: null, mmrPublic: core.STARTING_MMR,
      rankTierPublic: 'Silver', rankDivisionPublic: 4, mpPublic: 0,
      workoutsPerWeek: 3, logCaloriesDaysPerWeek: 4, logWeightDaysPerWeek: 3, dailyCalorieGoal: 2000, allowNudges: true,
    }, { merge: true });
    await db.doc(`users/${uid}/goals/workouts`).set({ type: 'workouts', status: 'active', targetWorkoutsPerWeek: 3 });
    await db.doc(`users/${uid}/goals/calorieDays`).set({ type: 'calorieDays', status: 'active', targetDaysPerWeek: 4 });
  }
  // The mate must never receive a push.
  await db.doc(`users/${uids.mate}`).update({ expoPushToken: FieldValue.delete() }).catch(() => {});
  console.log(`ready: group ${GROUP_ID} ("${GROUP_NAME}") with ${PEOPLE.map((p) => p.name).join(' + ')}; login saved to .emu-test-account.json`);
}

(process.argv.includes('--delete') ? remove() : create())
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
