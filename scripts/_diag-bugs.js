// Read-only production diagnostics for the July 8 bug batch:
// push tokens, MMR staleness, activity items, pushQueue leftovers, log recency.
const admin = require('firebase-admin');
const path = require('path');
const keyPath = process.argv[2];
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))), projectId: 'accountabuild' });
const db = admin.firestore();

(async () => {
  const users = await db.collection('users').get();
  console.log('=== USERS (' + users.size + ') ===');
  for (const d of users.docs) {
    const u = d.data();
    const tok = u.expoPushToken ? String(u.expoPushToken).slice(0, 25) + '…' : 'NONE';
    console.log(
      `- ${String(u.displayName ?? '(no name)').padEnd(12)} uid=${d.id.slice(0, 8)}…` +
      ` mmr=${u.mmr ?? '—'} lastWk=${u.lastWeekIdUpdated ?? '—'} firstWk=${u.firstWeekId ?? '—'}` +
      ` token=${tok} platform=${u.pushPlatform ?? '—'} allowNudges=${u.allowNudges ?? '—'}`
    );
  }

  const pq = await db.collection('pushQueue').get();
  console.log('\n=== pushQueue leftovers: ' + pq.size + ' ===');
  pq.docs.slice(0, 5).forEach((d) => {
    const x = d.data();
    console.log(`  ${d.id}: type=${x.type} to=${String(x.toUid).slice(0, 8)} from=${x.fromName} createdAt=${x.createdAt?.toDate?.()?.toISOString?.() ?? '?'}`);
  });

  console.log('\n=== activity items per user ===');
  for (const d of users.docs) {
    const act = await db.collection('users').doc(d.id).collection('activity').orderBy('createdAt', 'desc').limit(3).get();
    if (act.empty) continue;
    console.log(`- ${d.data().displayName}: ${act.size} recent`);
    act.docs.forEach((a) => {
      const x = a.data();
      console.log(`    ${x.type} "${x.title}" from=${x.fromName ?? '—'} read=${x.read} at=${x.createdAt?.toDate?.()?.toISOString?.() ?? '?'}`);
    });
  }

  // Last log per member in the main group (streak reality check).
  const groups = await db.collection('groups').get();
  for (const g of groups.docs) {
    const logs = await db.collection('groups').doc(g.id).collection('logs').orderBy('ts', 'desc').limit(400).get();
    const lastByUid = {};
    const lastDateByUid = {};
    logs.docs.forEach((l) => {
      const x = l.data();
      if (!lastByUid[x.uid]) lastByUid[x.uid] = x.ts?.toDate?.()?.toISOString?.() ?? '?';
      const dt = String(x.date ?? '');
      if (!lastDateByUid[x.uid] || dt > lastDateByUid[x.uid]) lastDateByUid[x.uid] = dt;
    });
    console.log(`\n=== group "${g.data().name}" (${g.id.slice(0, 8)}…) — last log per member (of last 400) ===`);
    for (const d of users.docs) {
      if (lastByUid[d.id] || lastDateByUid[d.id]) {
        console.log(`- ${d.data().displayName}: lastLogDate=${lastDateByUid[d.id] ?? '—'} lastWriteTs=${lastByUid[d.id] ?? '—'}`);
      }
    }
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
