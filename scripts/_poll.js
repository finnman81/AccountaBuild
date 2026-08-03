/**
 * Publish an in-app poll, or read its results.
 *
 *   node scripts/_poll.js <admin-key.json> results <pollId>
 *   node scripts/_poll.js <admin-key.json> ask <pollId> "Question?" "Opt A" "Opt B" ... [--send] [--now]
 *
 * Polls ride the announcement pop-up (config/app.announcements), so publishing
 * is a pure Firestore write — no app build, no release.
 *
 * DEFAULT DELAY: the first poll after shipping poll-rendering code must wait
 * for the OTA to reach devices, or the first wave sees a question with no
 * buttons. Publishes with activeFrom = now + 2h unless --now is passed.
 */
const admin = require('firebase-admin');
const path = require('path');

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();

const [, , , cmd, pollId, ...rest] = process.argv;
const send = rest.includes('--send');
const now = rest.includes('--now');
const args = rest.filter((a) => !a.startsWith('--'));

const MAX_QUEUE = 12;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

async function results() {
  const snap = await db.collection('pollResponses').where('pollId', '==', pollId).get();
  if (snap.empty) return console.log(`no responses yet for "${pollId}"`);
  const byOption = {};
  const rows = [];
  snap.forEach((d) => {
    const r = d.data();
    byOption[r.optionId] = (byOption[r.optionId] || 0) + 1;
    rows.push({ name: r.displayName || r.uid.slice(0, 6), opt: r.optionId, at: r.answeredAt?.toDate?.() });
  });
  const total = snap.size;
  console.log(`"${pollId}" — ${total} response${total === 1 ? '' : 's'}\n`);
  Object.entries(byOption)
    .sort((a, b) => b[1] - a[1])
    .forEach(([opt, n]) => {
      const pct = Math.round((n / total) * 100);
      console.log(`  ${opt.padEnd(20)} ${String(n).padStart(2)}  ${'█'.repeat(Math.round(pct / 5)).padEnd(20)} ${pct}%`);
    });
  console.log('\nwho said what:');
  rows.sort((a, b) => (a.at || 0) - (b.at || 0)).forEach((r) => console.log(`  ${String(r.name).padEnd(14)} ${r.opt}`));
}

async function ask() {
  const [question, ...options] = args;
  if (!question || options.length < 2) {
    console.error('need a question and at least 2 options');
    process.exit(1);
  }
  const poll = {
    id: pollId,
    question,
    options: options.map((label) => ({ id: slug(label), label })),
  };
  const ann = {
    id: `poll-${pollId}`,
    emoji: '📋',
    title: 'Quick question',
    lines: ['One tap — it helps decide what gets built next.'],
    poll,
    ...(now ? {} : { activeFrom: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() }),
  };

  console.log(`📋 ${ann.title}`);
  ann.lines.forEach((l) => console.log('  ' + l));
  console.log(`  ${question}`);
  poll.options.forEach((o) => console.log(`   [ ${o.label} ]  (id: ${o.id})`));
  console.log(`\n  unlocks: ${ann.activeFrom || 'immediately'}`);
  if (!send) return console.log('\n[dry run] pass --send');

  const ref = db.doc('config/app');
  await db.runTransaction(async (tx) => {
    const cfg = (await tx.get(ref)).data() || {};
    const queue = (Array.isArray(cfg.announcements) ? cfg.announcements : []).filter((a) => a && a.id !== ann.id);
    tx.set(ref, {
      announcements: [...queue, ann].slice(-MAX_QUEUE),
      announcement: ann, // legacy single field — old bundles read ONLY this
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  console.log(`\npublished. read answers with:\n  node scripts/_poll.js <key> results ${pollId}`);
}

(async () => {
  if (cmd === 'results') await results();
  else if (cmd === 'ask') await ask();
  else console.error('usage: _poll.js <key> (ask|results) <pollId> ...');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
