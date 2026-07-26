// Broadcast: announce a new app version to EVERY user with a push token.
// Dry-run by default; pass --send to actually deliver.
//   node scripts/_nudge-update.js <admin-key.json> [--send]
const admin = require('firebase-admin');
const path = require('path');

const TITLE = '🚀 New update available';
const BODY = 'A new version is ready to download with performance improvements and bug fixes. Grab it when you get a sec 🙏';

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();
const send = process.argv.includes('--send');

(async () => {
  const snap = await db.collection('users').get();
  // Broadcast to every user doc that carries an Expo push token.
  const rows = snap.docs.map((d) => {
    const u = d.data();
    return {
      name: u.displayName || '(no name)',
      uid: d.id,
      token: u.expoPushToken || null,
      platform: u.pushPlatform || '?',
    };
  });
  const withToken = rows.filter((r) => r.token);
  console.log(`users total: ${rows.length}   with token: ${withToken.length}   without: ${rows.length - withToken.length}`);
  for (const r of withToken) {
    console.log(`OK      ${r.name.padEnd(16)} ${r.platform.padEnd(8)} ${r.token.slice(0, 28)}…`);
  }
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
