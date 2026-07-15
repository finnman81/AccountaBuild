/**
 * Find (and with --apply, delete + tombstone) synced workouts that are twins
 * of a manual workout: manual save-ts inside the synced workout's
 * [start, end + 30min] window, same workoutType, same date. Manual wins —
 * mirrors the enforceHealthLogHygiene server rule.
 *
 * Usage: node scripts/_scrub-manual-synced-twins.js <admin-key.json> [--apply]
 */
const path = require('path');
const admin = require(path.join(process.cwd(), 'functions', 'node_modules', 'firebase-admin'));
const key = require(path.resolve(process.argv[2]));
admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');
const BUFFER_MS = 30 * 60 * 1000;

const tsMs = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);

(async () => {
  const groups = await db.collection('groups').get();
  let found = 0;
  for (const g of groups.docs) {
    const logs = await g.ref.collection('logs').where('type', '==', 'workout').get();
    // bucket by uid+date
    const buckets = new Map();
    for (const d of logs.docs) {
      const x = d.data();
      const k = `${x.uid}|${x.date}`;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push({ id: d.id, ref: d.ref, ...x });
    }
    for (const [k, arr] of buckets) {
      const manuals = arr.filter((l) => !l.source || l.source === 'self_reported');
      const synced = arr.filter((l) => l.source && l.source !== 'self_reported');
      for (const s of synced) {
        const start = tsMs(s.ts);
        const end = start + (Number(s.payload?.durationMinutes) || 0) * 60 * 1000;
        const twin = manuals.find(
          (m) => m.payload?.workoutType === s.payload?.workoutType && start > 0 && tsMs(m.ts) >= start && tsMs(m.ts) <= end + BUFFER_MS,
        );
        if (!twin) continue;
        found += 1;
        console.log(`TWIN ${k}: synced ${s.id} (${s.payload?.durationMinutes}m) dup of manual ${twin.id} (${twin.payload?.durationMinutes}m)`);
        if (APPLY) {
          await db.doc(`users/${s.uid}/healthTombstones/${s.id}`).set({
            groupId: g.id, type: 'workout', date: s.date ?? null,
            deletedAt: admin.firestore.FieldValue.serverTimestamp(), reason: 'manual-twin-scrub',
          }, { merge: true });
          await s.ref.delete();
          console.log(`  -> deleted + tombstoned ${s.id}`);
        }
      }
    }
  }
  console.log(`${APPLY ? 'DELETED' : 'DRY-RUN, would delete'}: ${found} synced twins`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
