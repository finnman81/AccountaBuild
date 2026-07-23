// One-off: nudge the stragglers who haven't installed the latest TestFlight
// build. Dry-run by default; pass --send to actually deliver.
//   node scripts/_nudge-update.js <admin-key.json> [--send]
const admin = require('firebase-admin');
const path = require('path');

const TARGETS = ['Nick Umana', 'Matt Mologne'];
const TITLE = '📲 New version ready';
const BODY = 'Quick one — grab the latest build in TestFlight when you get a sec 🙏';

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();
const send = process.argv.includes('--send');

(async () => {
  const snap = await db.collection('users').get();
  const rows = [];
  for (const name of TARGETS) {
    const d = snap.docs.find((x) => (x.data().displayName || '') === name);
    if (!d) { console.log(`MISSING  ${name}`); continue; }
    const u = d.data();
    rows.push({ name, uid: d.id, token: u.expoPushToken || null, platform: u.pushPlatform || '?' });
  }
  for (const r of rows) {
    console.log(`${r.token ? 'OK      ' : 'NO TOKEN'} ${r.name.padEnd(14)} ${r.platform.padEnd(8)} ${r.token ? r.token.slice(0, 28) + '…' : ''}`);
  }
  const withToken = rows.filter((r) => r.token);
  console.log(`\n${TITLE}\n${BODY}`);
  if (!send) { console.log(`\n[dry run] would send to ${withToken.length}`); process.exit(0); }

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(withToken.map((r) => ({
      to: r.token, sound: 'default', title: TITLE, body: BODY,
      data: { type: 'update', screen: 'Today' },
    }))),
  });
  const json = await res.json();
  console.log('\nHTTP', res.status);
  (json.data || []).forEach((t, i) => console.log(`  ${withToken[i].name.padEnd(14)} ${t.status}${t.message ? ' — ' + t.message : ''}`));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
