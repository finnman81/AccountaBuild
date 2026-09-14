// Read-only: who would the evening reminders target right now? Sends nothing.
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json')) });
const db = admin.firestore();
const n = require('../functions/notif-logic');
(async () => {
  const at = process.argv[2] ? new Date(process.argv[2]) : new Date();
  const names = {};
  (await db.collection('publicUsers').get()).docs.forEach((d) => (names[d.id] = d.data().displayName));
  const show = (label, r) => { const items = Array.isArray(r) ? r : (r?.items ?? []); console.log(label, items.map((i) => `${names[i.uid] ?? i.uid.slice(0, 6)}: "${i.title}"`)); };
  show('streakRisk', await n.evaluateStreakRisk(db, at));
  show('signNudge', await n.evaluateSignNudge(db, at));
  show('vacationPrompt', await n.evaluateVacationPrompt(db, at));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
