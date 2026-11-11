/**
 * Take a What's New announcement down: removes it from config/app.announcements
 * and clears the legacy config/app.announcement slot if it holds the same id.
 *
 *   node scripts/_remove-announcement.js <admin-key.json> <announcement-id>
 */
const path = require('path');
const admin = require(path.join(process.cwd(), 'functions', 'node_modules', 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();
const { FieldValue } = admin.firestore;
const id = process.argv[3];
if (!id) { console.error('usage: <admin-key.json> <announcement-id>'); process.exit(1); }

(async () => {
  const ref = db.doc('config/app');
  const result = await db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() || {};
    const queue = Array.isArray(d.announcements) ? d.announcements : [];
    const kept = queue.filter((a) => !a || a.id !== id);
    const patch = { announcements: kept, updatedAt: FieldValue.serverTimestamp() };
    const legacy = d.announcement && d.announcement.id === id;
    if (legacy) patch.announcement = FieldValue.delete();
    tx.set(ref, patch, { merge: true });
    return { removed: queue.length - kept.length, legacy };
  });
  console.log(`announcement ${id}: removed ${result.removed} from the queue, legacy slot ${result.legacy ? 'cleared' : 'untouched'}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
