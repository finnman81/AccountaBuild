// Dry run of the 2pm social nudge: who would get what, right now. Sends nothing.
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json')) });
const { evaluateSocialNudge } = require('../functions/social-nudge');
evaluateSocialNudge(admin.firestore(), new Date(), { apply: false }).then(({ items, today }) => {
  console.log(today, 'would send', items.length);
  items.forEach((i) => console.log(' ', i.uid.slice(0, 6), '|', i.title, '|', i.body));
  process.exit(0);
});
