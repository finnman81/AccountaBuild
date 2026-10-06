const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json')) });
(async () => {
  const s = await admin.firestore().collection('users').get();
  for (const d of s.docs) {
    const u = await admin.auth().getUser(d.id).catch(() => null); if (!u) continue;
    console.log(String(d.get('displayName')).padEnd(14), d.get('appHealth')?.platform, 'signIn', u.metadata.lastSignInTime, '| refresh', u.metadata.lastRefreshTime, '| providers', u.providerData.map(p=>p.providerId).join(','));
  }
  process.exit(0);
})();
