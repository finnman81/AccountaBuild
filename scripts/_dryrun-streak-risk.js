// Dry-run the streak-at-risk evaluation against PRODUCTION (no pushes sent).
// Usage: node scripts/_dryrun-streak-risk.js ./accountabuild-firebase-adminsdk-*.json
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();

const { evaluateStreakRisk } = require(path.join(__dirname, '..', 'functions', 'notif-logic'));

(async () => {
  const { items, evaluated } = await evaluateStreakRisk(db, new Date());
  console.log(`Evaluated ${evaluated} users. Would push to ${items.length}:`);
  for (const i of items) console.log(`- ${i.uid.slice(0, 8)}…  "${i.title}" / "${i.body}"`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
