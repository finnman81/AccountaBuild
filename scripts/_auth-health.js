const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json')) });
(async () => {
  const s = await admin.firestore().collection('users').get();
  for (const d of s.docs) {
    const h = d.get('appHealth'); if (!h) continue;
    console.log(String(d.get('displayName')).padEnd(14), h.platform, h.nativeBuild, h.authPersistence, h.otaUpdateId, h.lastOpenedAt?.toDate?.().toISOString());
  }
  process.exit(0);
})();
