// Live push test: read Finnman81's Expo token (admin), POST directly to the
// Expo push API, print the delivery ticket. Proves Expo -> APNs -> device.
const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('users').get();
  const jake = snap.docs.find((d) => (d.data().displayName || '') === 'Finnman81');
  if (!jake) throw new Error('Finnman81 not found');
  const token = jake.data().expoPushToken;
  console.log('token:', token ? token.slice(0, 30) + '…' : 'NONE', 'platform:', jake.data().pushPlatform);
  if (!token) process.exit(2);

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: token,
      sound: 'default',
      title: '🔔 Push test',
      body: 'If you can read this on your phone, iOS push delivery works end-to-end.',
      data: { type: 'test', screen: 'Activity' },
    }),
  });
  const json = await res.json();
  console.log('HTTP', res.status);
  console.log('ticket:', JSON.stringify(json, null, 2));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
