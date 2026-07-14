// Delete health-synced logs dated before the member joined the group.
// Usage: node scripts/_clean-prejoin-health-logs.js <admin-key> <groupId> <uid>
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();
(async () => {
  const [, , , groupId, uid] = process.argv;
  const member = await db.doc(`groups/${groupId}/members/${uid}`).get();
  const joinedAt = member.exists ? member.data().joinedAt?.toDate?.() : null;
  if (!joinedAt) throw new Error('no joinedAt');
  const joinDate = joinedAt.toISOString().slice(0, 10);
  const logs = await db.collection(`groups/${groupId}/logs`).where('uid', '==', uid).get();
  let deleted = 0;
  for (const l of logs.docs) {
    const d = l.data();
    const synced = d.source && d.source !== 'self_reported';
    if (synced && d.date < joinDate) {
      await l.ref.delete();
      deleted += 1;
      console.log(`deleted ${d.date} ${d.type} (${d.source})`);
    }
  }
  console.log(`Done: ${deleted} pre-join synced logs removed (join date ${joinDate}).`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
