// Winter Arc: 8-week challenge for BPM, Mon Sep 28 -> Sun Nov 22 (W40-W47),
// plus the kickoff pop-up, live at 9 AM ET on the 28th (same minute the
// challengeLifecycle "is live" push and chat message go out).
// Archives Summer Shred first: a group holds one challenge, so setting the
// new one replaces the old object. Dry run by default.
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json')) });
const db = admin.firestore();
const { Timestamp, FieldValue } = admin.firestore;
const core = require('../functions/mmr-core');
const APPLY = process.argv.includes('--apply');
const GID = 'WMKt9Qpke5Q6Xhimbyxq';
const JAKE = 'dJXX3v6nHDgxoId89S06dBwkgxG3';
const ACTIVE_FROM = '2026-09-28T13:00:00.000Z'; // 9:00 AM EDT

const challenge = {
  name: 'Winter Arc',
  startWeekId: '2026-W40',
  durationWeeks: 8,
  status: 'active',
  createdBy: JAKE,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
};
const ann = {
  id: 'winter-arc-kickoff',
  emoji: '❄️',
  title: 'Winter Arc starts today',
  activeFrom: ACTIVE_FROM,
  lines: [
    "For eight weeks, running through November 22, the Sunday before Thanksgiving, we're making one last real push to close out 2026. Most people coast into the holidays and tell themselves they'll start fresh in January, but we're not waiting on January.",
    "This one is about you, your body, your health, and the habits you keep when nobody's making you. Every week you're scored against your own goals rather than anyone else's numbers, so all it takes is hitting what you said you'd hit and showing up even when it's cold and dark at 6 AM. We finish the year strong, and we finish it together.",
    'Nobody left behind.',
  ],
  // Future createdAt on purpose: the queue trims to the newest 12 by
  // createdAt, and two weeks of tier/goal pop-ups could otherwise push this
  // out before it ever goes live.
  createdAt: Timestamp.fromDate(new Date(ACTIVE_FROM)),
};

(async () => {
  const gRef = db.doc(`groups/${GID}`);
  const old = (await gRef.get()).data()?.challenge;
  const s = core.isoWeekDatesInTz(challenge.startWeekId, core.DEFAULT_TZ)[0];
  let w = challenge.startWeekId;
  for (let i = 1; i < challenge.durationWeeks; i++) w = core.nextIsoWeekId(w, core.DEFAULT_TZ);
  const e = core.isoWeekDatesInTz(w, core.DEFAULT_TZ)[6];
  console.log('replacing:', old?.name, old?.startWeekId, `${old?.durationWeeks}w`);
  console.log('new:', challenge.name, challenge.startWeekId, '->', w, `(${s} -> ${e})`);
  console.log('pop-up:', ann.title, '| live', new Date(ACTIVE_FROM).toLocaleString('en-US', { timeZone: 'America/New_York' }), 'ET');
  if (!APPLY) return console.log('[dry run] pass --apply');
  if (old) {
    await gRef.collection('challengeHistory').doc(`${old.startWeekId}-summer-shred`).set({ ...old, archivedAt: FieldValue.serverTimestamp() });
  }
  await gRef.update({ challenge, updatedAt: FieldValue.serverTimestamp() });
  await gRef.collection('announcements').doc(ann.id).set(ann);
  console.log('done');
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
