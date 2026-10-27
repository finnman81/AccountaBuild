// Dry-run the server reminders against production: who would get what if the
// 5-minute job ran right now (or at --at "2026-10-27T13:00:00Z").
//   node scripts/_reminders-dry.js [--at ISO] [--all]
// --all lists every user with server reminders switched on, with their slots.
const path = require('path');
const admin = require('../functions/node_modules/firebase-admin');
const { evaluateReminderSlots } = require('../functions/reminders');

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, '..', 'accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json'))),
});
const db = admin.firestore();

(async () => {
  const atArg = process.argv.indexOf('--at');
  const now = atArg > -1 ? new Date(process.argv[atArg + 1]) : new Date();
  if (process.argv.includes('--all')) {
    const users = await db.collection('users').get();
    for (const u of users.docs) {
      const p = u.get('notifPrefs') || {};
      if (p.reminderSource !== 'server') continue;
      console.log(`${(u.get('displayName') || u.id).padEnd(18)} ${p.reminderStyle || 'friendly'} ${p.reminderTz || '-'} ${JSON.stringify(p.reminderTimes)} enabled=${p.reminderEnabled !== false}`);
    }
  }
  const { items, evaluated, report } = await evaluateReminderSlots(db, now, { apply: false });
  console.log(`at ${now.toISOString()}: ${evaluated} users with server reminders, ${items.length} would send`);
  for (const r of report) console.log(` ${r.name.padEnd(18)} ${r.slot} ${r.tz} ${r.kind}${r.body ? ` -> ${r.body}` : ''}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
