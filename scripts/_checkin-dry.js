// Dry run of the check-in scan. Read-only: apply:false writes and sends nothing.
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json')) });
const { findQuietMembers } = require('../functions/check-in');
const at = process.argv[2] ? new Date(process.argv[2]) : new Date();
findQuietMembers(admin.firestore(), at, { apply: false }).then((r) => {
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
});
