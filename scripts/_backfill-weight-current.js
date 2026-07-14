// Backfill: profile weightCurrent (+ publicUsers mirror) from each user's
// LATEST logged group weigh-in, and insert missing users/{uid}/weights history
// entries (LogComposer wasn't writing them until the fix).
// Usage: node scripts/_backfill-weight-current.js <admin-key> [--dry-run]
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();
const DRY = process.argv.includes('--dry-run');

const tsMs = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);

(async () => {
  const users = await db.collection('users').get();
  for (const u of users.docs) {
    const uid = u.id;
    const name = u.data().displayName || uid.slice(0, 8);
    const groupsSnap = await db.collection('users').doc(uid).collection('groups').get();
    const groupIds = groupsSnap.docs.map((d) => d.data().groupId ?? d.id);
    if (!groupIds.length) continue;

    // Gather all their weight logs across groups.
    const weightLogs = [];
    for (const gid of groupIds) {
      const logs = await db.collection(`groups/${gid}/logs`).where('uid', '==', uid).get();
      for (const l of logs.docs) {
        const d = l.data();
        if (d.type !== 'weight') continue;
        const w = Number(d.payload && d.payload.weight);
        if (!Number.isFinite(w) || w <= 0) continue;
        weightLogs.push({ gid, logId: l.id, date: String(d.date || ''), weight: w, ms: tsMs(d.ts), source: d.source || 'self_reported' });
      }
    }
    if (!weightLogs.length) continue;

    // Insert missing history entries (dedupe by groupLogId).
    const hist = await db.collection('users').doc(uid).collection('weights').get();
    const knownLogIds = new Set(hist.docs.map((h) => h.data().groupLogId).filter(Boolean));
    let inserted = 0;
    for (const wl of weightLogs) {
      if (knownLogIds.has(wl.logId)) continue;
      if (!DRY) {
        await db.collection('users').doc(uid).collection('weights').add({
          uid, groupId: wl.gid, groupLogId: wl.logId, date: wl.date, weight: wl.weight,
          ts: admin.firestore.Timestamp.fromMillis(wl.ms || Date.now()), source: wl.source,
        });
      }
      inserted += 1;
    }

    // Latest logged weight vs profile.
    weightLogs.sort((a, b) => a.date.localeCompare(b.date) || a.ms - b.ms);
    const latest = weightLogs[weightLogs.length - 1];
    const current = Number(u.data().weightCurrent);
    // Only trust RECENT logs to overwrite the profile — a January log must not
    // clobber a weight the user typed into Edit Profile since then.
    const recentEnough = latest.date >= '2026-06-15';
    const drifted = recentEnough && (!Number.isFinite(current) || Math.abs(current - latest.weight) >= 0.05);
    if (drifted && !DRY) {
      await db.doc(`users/${uid}`).set({ weightCurrent: latest.weight }, { merge: true });
      await db.doc(`publicUsers/${uid}`).set({ weightCurrent: latest.weight }, { merge: true });
    }
    if (drifted || inserted) {
      console.log(`${name}: weightCurrent ${Number.isFinite(current) ? current : '—'} -> ${latest.weight} (${latest.date})${drifted ? '' : ' [no change]'}, history +${inserted}${DRY ? ' [DRY]' : ''}`);
    }
  }
  console.log('done');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
