/**
 * Audit (and with --apply, repair) broken weekly anchor chains: for every
 * consecutive pair of weekly docs, week N+1's stored baselines
 * (mmrBefore/streakBefore/freezeBefore/shieldBefore/missedBefore) must equal
 * week N's outputs. Stale anchors happen when the N+1 doc was created before
 * week N closed (Monday-morning race) — now also self-healed by both scorers.
 *
 * After repairing, re-run scripts/mmr-recompute.js for the affected users.
 *
 * Usage: node scripts/_repair-week-anchors.js <admin-key.json> [--apply]
 */
const path = require('path');
const admin = require(path.join(process.cwd(), 'functions', 'node_modules', 'firebase-admin'));
const key = require(path.resolve(process.argv[2]));
admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');

(async () => {
  const users = await db.collection('users').get();
  const affected = [];
  for (const u of users.docs) {
    const name = u.data().displayName || u.id.slice(0, 8);
    const firstWeekId = typeof u.data().firstWeekId === 'string' ? u.data().firstWeekId : null;
    const weeks = await db.collection(`users/${u.id}/weekly`).orderBy('weekId').get();
    const docs = weeks.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
    for (let i = 0; i + 1 < docs.length; i += 1) {
      const prev = docs[i];
      const next = docs[i + 1];
      // Pre-join weeks are relics the scorer never replays (firstWeekId
      // clamp); the first scored week anchors at a fresh 1800, NOT at a
      // pre-join week's output. Don't chain through them.
      if (firstWeekId && prev.id < firstWeekId) continue;
      const missedAfter = prev.missedWeek ? (Number(prev.missedBefore) || 0) + 1 : 0;
      const want = {
        mmrBefore: prev.mmrAfter,
        streakBefore: prev.streakAfter,
        freezeBefore: prev.freezeAfter ?? 0,
        shieldBefore: prev.shieldAfter ?? 0,
        missedBefore: missedAfter,
      };
      const stale = Object.entries(want).filter(([k, v]) => next[k] !== v);
      if (!stale.length) continue;
      console.log(`BROKEN ${name} ${prev.id}->${next.id}: ${stale.map(([k, v]) => `${k} ${next[k]}=>${v}`).join(', ')}`);
      affected.push({ uid: u.id, name });
      if (APPLY) {
        await next.ref.set(want, { merge: true });
        console.log('  -> anchors re-based');
      }
    }
  }
  const uniq = [...new Map(affected.map((a) => [a.uid, a])).values()];
  console.log(`\n${APPLY ? 'REPAIRED' : 'DRY-RUN'}: ${uniq.length} affected user(s): ${uniq.map((a) => a.name).join(', ') || '(none)'}`);
  if (APPLY && uniq.length) console.log('Now recompute each: node scripts/mmr-recompute.js <key> --uid <uid>');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
