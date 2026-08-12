/**
 * Build the App Review demo account + a fully ISOLATED demo group.
 *
 *   node scripts/_seed-demo-group.js <admin-key.json> [--apply]
 *
 * Safety (lesson from the 2026-08-04 "Delete Me" incident — a test message
 * pushed to the real group): every demo member exists ONLY in the demo group,
 * none has an expoPushToken, so every push trigger that fires during seeding
 * resolves to zero recipients. BPM is never touched.
 *
 * Seeds 3 weeks of realistic history, then runs the REAL scorer over it so
 * ranks/FP/badges are genuine — reviewers see the actual product.
 */
const path = require('path');
const admin = require(path.join(process.cwd(), 'functions', 'node_modules', 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;
const core = require(path.join(process.cwd(), 'functions', 'mmr-core'));
const { computeUserWeek } = require(path.join(process.cwd(), 'functions', 'mmr-compute'));

const APPLY = process.argv.includes('--apply');
const GROUP_ID = 'demo-review-crew';
const JOIN_CODE = 'DEMO26';
const DEMO_EMAIL = 'demo.reviewer@munitor.ai';
const DEMO_PASSWORD = 'Crew-Demo-2026!';

const MEMBERS = [
  { key: 'reviewer', name: 'Demo Reviewer', email: DEMO_EMAIL, startW: 192, goalW: 182, wk: 4, cal: 5, budget: 2100, style: 'steady' },
  { key: 'alexr', name: 'Alex Rivera', email: 'demo.alexr@munitor.ai', startW: 176, goalW: 168, wk: 5, cal: 6, budget: 1900, style: 'strong' },
  { key: 'samc', name: 'Sam Carter', email: 'demo.samc@munitor.ai', startW: 215, goalW: 200, wk: 4, cal: 5, budget: 2300, style: 'comeback' },
  { key: 'jlee', name: 'Jordan Lee', email: 'demo.jlee@munitor.ai', startW: 158, goalW: 152, wk: 3, cal: 4, budget: 1800, style: 'casual' },
];

const WORKOUTS = ['weightLifting', 'running', 'hiit', 'bike', 'yoga', 'tennis'];
// Deterministic pseudo-random so re-runs produce identical data.
let seed = 42;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

function datesBack(nDays) {
  const out = [];
  for (let i = nDays; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(core.yyyyMmDdInTz(d, core.DEFAULT_TZ));
  }
  return out;
}

(async () => {
  console.log(`${APPLY ? 'SEEDING' : '[dry run]'} demo group "${GROUP_ID}" with ${MEMBERS.length} members\n`);

  // ---- auth users ----
  const uids = {};
  for (const m of MEMBERS) {
    let u = await admin.auth().getUserByEmail(m.email).catch(() => null);
    if (!u && APPLY) u = await admin.auth().createUser({ email: m.email, password: DEMO_PASSWORD, displayName: m.name });
    uids[m.key] = u ? u.uid : `dry-${m.key}`;
    console.log(`  ${m.name.padEnd(14)} ${u ? (APPLY ? 'ready' : 'exists') : 'would create'}  ${m.email}`);
  }
  if (!APPLY) { console.log('\npass --apply to build'); process.exit(0); }

  // ---- group + membership (NO real users, ever) ----
  await db.doc(`groups/${GROUP_ID}`).set({
    name: 'Morning Grind', createdBy: uids.reviewer, memberCount: MEMBERS.length,
    streakRule: 'any', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.doc(`joinCodes/${JOIN_CODE}`).set({ groupId: GROUP_ID, createdBy: uids.reviewer });

  for (const m of MEMBERS) {
    const uid = uids[m.key];
    await db.doc(`groups/${GROUP_ID}/members/${uid}`).set({ uid, role: m.key === 'reviewer' ? 'admin' : 'member' });
    await db.doc(`users/${uid}/groups/${GROUP_ID}`).set({ groupId: GROUP_ID, name: 'Morning Grind' });
    await db.doc(`users/${uid}`).set({
      email: m.email, displayName: m.name, height: 68 + Math.round(rnd() * 6),
      mmr: core.STARTING_MMR, rankTier: 'Silver', rankDivision: 4, mp: 0,
      prevMmr: core.STARTING_MMR, prevRankTier: 'Silver', prevRankDivision: 4,
      dailyCalorieGoal: m.budget, goalMode: 'cut',
      // No expoPushToken — this is the isolation guarantee for every trigger.
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await db.doc(`publicUsers/${uid}`).set({
      uid, displayName: m.name, photoURL: null, mmrPublic: core.STARTING_MMR,
      rankTierPublic: 'Silver', rankDivisionPublic: 4, mpPublic: 0,
      workoutsPerWeek: m.wk, logCaloriesDaysPerWeek: m.cal, logWeightDaysPerWeek: 5,
      dailyCalorieGoal: m.budget, allowNudges: true,
    }, { merge: true });
    await db.doc(`users/${uid}/goals/workouts`).set({ type: 'workouts', status: 'active', targetWorkoutsPerWeek: m.wk });
    await db.doc(`users/${uid}/goals/calorieDays`).set({ type: 'calorieDays', status: 'active', targetDaysPerWeek: m.cal });
    const end = new Date(); end.setDate(end.getDate() + 70);
    await db.doc(`users/${uid}/goals/weightLoss`).set({
      type: 'weightLoss', status: 'active', startWeight: m.startW, goalWeight: m.goalW,
      startDate: datesBack(21)[0], targetEndDate: core.yyyyMmDdInTz(end, core.DEFAULT_TZ),
    });
  }
  console.log('\ngroup + members + goals written');

  // ---- 3 weeks of logs, weights, chat ----
  const days = datesBack(21);
  const CHAT = [
    ['alexr', 'morning grind lets gooo 💪'], ['samc', 'legs are DESTROYED from yesterday'],
    ['reviewer', 'new week, signing in'], ['jlee', 'down another pound this week 🎉'],
    ['alexr', 'who is hitting the gym at 6?'], ['reviewer', 'me. do not let me sleep in'],
    ['samc', 'that hiit session was no joke'], ['jlee', 'consistency over intensity, boys'],
  ];
  let chatIdx = 0;
  for (const [di, date] of days.entries()) {
    const dt = new Date(`${date}T12:00:00`);
    for (const m of MEMBERS) {
      const uid = uids[m.key];
      const active = m.style === 'strong' ? rnd() < 0.8 : m.style === 'steady' ? rnd() < 0.7
        : m.style === 'comeback' ? (di < 7 ? rnd() < 0.25 : rnd() < 0.75) : rnd() < 0.5;
      if (active) {
        const mins = 30 + Math.round(rnd() * 45);
        await db.collection(`groups/${GROUP_ID}/logs`).add({
          uid, type: 'workout', date, ts: Timestamp.fromDate(new Date(dt.getTime() + rnd() * 8 * 3600e3)),
          source: 'self_reported', payload: { workoutType: pick(WORKOUTS), durationMinutes: mins, note: null },
        });
      }
      if (rnd() < 0.75) {
        const cals = Math.round(m.budget * (0.85 + rnd() * 0.3));
        await db.collection(`groups/${GROUP_ID}/logs`).add({
          uid, type: 'calories', date, ts: Timestamp.fromDate(new Date(dt.getTime() + 9 * 3600e3)),
          source: 'self_reported', payload: { calories: cals, meal: 'all', note: null },
        });
      }
      if (rnd() < 0.6) {
        const progress = di / days.length;
        const w = Math.round((m.startW - (m.startW - m.goalW) * progress * 0.55 + (rnd() - 0.5) * 1.6) * 10) / 10;
        await db.collection(`groups/${GROUP_ID}/logs`).add({
          uid, type: 'weight', date, ts: Timestamp.fromDate(new Date(dt.getTime() + 7 * 3600e3)),
          source: 'self_reported', payload: { weight: w, note: null },
        });
        await db.collection(`users/${uid}/weights`).add({ weight: w, date, ts: Timestamp.fromDate(new Date(dt.getTime() + 7 * 3600e3)) });
      }
    }
    if (di % 3 === 1 && chatIdx < CHAT.length) {
      const [who, text] = CHAT[chatIdx++];
      await db.collection(`groups/${GROUP_ID}/messages`).add({
        uid: uids[who], text, createdAt: Timestamp.fromDate(new Date(dt.getTime() + 10 * 3600e3)),
      });
    }
  }
  console.log('21 days of logs + weights + chat seeded');

  // ---- signatures for the current week ----
  const wkNow = core.isoWeekIdInTz(new Date(), core.DEFAULT_TZ);
  for (const m of MEMBERS.slice(0, 3)) {
    await db.doc(`groups/${GROUP_ID}/signatures/${wkNow}_${uids[m.key]}`).set({
      uid: uids[m.key], weekId: wkNow, signedOn: core.yyyyMmDdInTz(new Date(), core.DEFAULT_TZ), signedAt: FieldValue.serverTimestamp(),
    });
  }

  // ---- run the REAL scorer over the seeded weeks (oldest first) ----
  const weeks = [...new Set(days.map((d) => core.isoWeekIdInTz(new Date(`${d}T12:00:00`), core.DEFAULT_TZ)))];
  console.log('scoring weeks:', weeks.join(', '));
  for (const m of MEMBERS) {
    for (const wk of weeks) {
      await computeUserWeek(db, { uid: uids[m.key], weekId: wk, apply: true });
    }
  }
  console.log('scored — FP/ranks/badges are genuine');

  // ---- verify isolation ----
  const tokens = [];
  for (const m of MEMBERS) {
    const u = (await db.doc(`users/${uids[m.key]}`).get()).data();
    if (u.expoPushToken) tokens.push(m.name);
  }
  const bpmMembers = await db.collection('groups/WMKt9Qpke5Q6Xhimbyxq/members').get();
  const leaked = bpmMembers.docs.some((d) => Object.values(uids).includes(d.id));
  console.log(`\nisolation: demo tokens=${tokens.length} (want 0) | demo uid in BPM=${leaked} (want false)`);

  console.log('\n=== FOR APP STORE CONNECT REVIEW NOTES ===');
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log(`  group:    Morning Grind (join code ${JOIN_CODE})`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
