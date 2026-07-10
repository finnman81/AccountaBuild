/**
 * Server-side MMR recompute — admin CLI over functions/mmr-compute.js (the same
 * module the scheduled Cloud Function runs). Lets us test the server compute
 * FOR REAL against production without deploying anything.
 *
 * Usage:
 *   node scripts/mmr-recompute.js <keyPath> --all [--dry-run]
 *   node scripts/mmr-recompute.js <keyPath> --name Watto [--dry-run]
 *   node scripts/mmr-recompute.js <keyPath> --uid <uid> [--dry-run]
 *
 * --dry-run computes and prints every week's result without writing anything.
 */
const path = require('path');
// IMPORTANT: use the functions/ copy of firebase-admin — mmr-compute.js resolves
// FieldValue from there, and sentinels from a different firebase-admin instance
// fail serialization ("ServerTimestampTransform ... custom prototypes").
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const { computeUserUpToCurrentWeek } = require('../functions/mmr-compute');

const args = process.argv.slice(2);
const keyPath = args[0];
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const nameIdx = args.indexOf('--name');
const uidIdx = args.indexOf('--uid');
const name = nameIdx >= 0 ? args[nameIdx + 1] : null;
const uidArg = uidIdx >= 0 ? args[uidIdx + 1] : null;

if (!keyPath || (!all && !name && !uidArg)) {
  console.error('Usage: node scripts/mmr-recompute.js <keyPath> (--all | --name X | --uid X) [--dry-run]');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))), projectId: 'accountabuild' });
const db = admin.firestore();

function fmt(r) {
  if (r.error) return `    ${r.weekId}: ERROR ${r.error}`;
  return (
    `    ${r.weekId}: ${r.mmrBefore} -> ${r.mmrAfter} (Δ${r.deltaMMR >= 0 ? '+' : ''}${r.deltaMMR})` +
    ` score=${r.weekScore} pen=${r.penalty} bonus=${r.bonus} A=${r.A_total}` +
    ` ${r.completedWeek ? 'COMPLETED' : r.missedWeek ? 'MISSED' : 'partial'}` +
    ` ${r.rankBefore}->${r.rankAfter} goals=[${r.activeGoals.join(',')}]`
  );
}

(async () => {
  const usersSnap = await db.collection('users').get();
  let targets = usersSnap.docs;
  if (!all) {
    targets = targets.filter((d) => {
      if (uidArg) return d.id === uidArg;
      const dn = String(d.data().displayName ?? '').toLowerCase();
      return dn === String(name).toLowerCase();
    });
    if (targets.length !== 1) {
      console.error(`Matched ${targets.length} users — need exactly 1. Use --uid.`);
      targets.forEach((d) => console.error(`  ${d.id} "${d.data().displayName}"`));
      process.exit(2);
    }
  }

  console.log(`MMR recompute ${dryRun ? '(DRY RUN — no writes)' : '(APPLYING)'} for ${targets.length} user(s)\n`);
  for (const d of targets) {
    const label = `${String(d.data().displayName ?? '(no name)').padEnd(12)} ${d.id.slice(0, 8)}…`;
    try {
      const results = await computeUserUpToCurrentWeek(db, { uid: d.id, apply: !dryRun });
      if (results.length === 0) {
        console.log(`- ${label}: up to date, nothing to compute`);
      } else {
        console.log(`- ${label}:`);
        results.forEach((r) => console.log(fmt(r)));
      }
    } catch (e) {
      console.log(`- ${label}: FAILED ${e?.message ?? e}`);
    }
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
