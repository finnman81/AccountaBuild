// Dedupe near-identical health-synced workouts (same user+date+type starting
// within 15 min = one session; keep the longest sample). Deleted ids get
// tombstoned so devices can't re-import them.
// Usage: node scripts/_dedupe-synced-workouts.js <admin-key> [--dry-run]
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();
const DRY = process.argv.includes('--dry-run');
const tsMs = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);

(async () => {
  const groups = await db.collection('groups').get();
  let removed = 0;
  for (const g of groups.docs) {
    const logs = await db.collection(`groups/${g.id}/logs`).get();
    const synced = logs.docs
      .map((d) => ({ ref: d.ref, id: d.id, ...d.data() }))
      .filter((l) => l.type === 'workout' && l.source && l.source !== 'self_reported');

    // Bucket by uid+date+type.
    const buckets = new Map();
    for (const l of synced) {
      const key = `${l.uid}|${l.date}|${l.payload && l.payload.workoutType}`;
      const arr = buckets.get(key) || [];
      arr.push(l);
      buckets.set(key, arr);
    }

    for (const [key, arr] of buckets) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => (Number(b.payload?.durationMinutes) || 0) - (Number(a.payload?.durationMinutes) || 0));
      const kept = [];
      for (const l of arr) {
        const dup = kept.find((k) => Math.abs(tsMs(k.ts) - tsMs(l.ts)) <= 15 * 60 * 1000);
        if (!dup) { kept.push(l); continue; }
        console.log(`${DRY ? '[DRY] ' : ''}dedupe ${key}: drop ${l.payload?.durationMinutes}m (keep ${dup.payload?.durationMinutes}m) id=${l.id.slice(0, 20)}`);
        if (!DRY) {
          await db.doc(`users/${l.uid}/healthTombstones/${l.id}`).set({
            groupId: g.id, type: 'workout', date: l.date,
            deletedAt: admin.firestore.FieldValue.serverTimestamp(), reason: 'near-duplicate-dedupe',
          });
          await l.ref.delete();
        }
        removed += 1;
      }
    }
  }
  console.log(`${DRY ? '[DRY] would remove' : 'removed'} ${removed} duplicate synced workouts`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
