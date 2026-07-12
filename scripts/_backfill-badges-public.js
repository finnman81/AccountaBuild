// One-time backfill: mirror users/{uid}/badges -> publicUsers/{uid}.badgesPublic
// (the app now keeps this in sync via BadgeCelebrationWatcher on the owner's device).
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(process.argv[2]))), projectId: 'accountabuild' });
const db = admin.firestore();

const ROMAN = ['', 'I', 'II', 'III', 'IV'];
function label(b) {
  if (b.type === 'achievement') return String(b.title || 'Achievement');
  const rank = `${b.tier}${b.division ? ` ${ROMAN[b.division]}` : ''}`;
  return b.type === 'seasonPeak' ? `Season peak: ${rank}` : `Season rank: ${rank}`;
}

(async () => {
  const users = await db.collection('users').get();
  let mirrored = 0;
  for (const u of users.docs) {
    const badges = await db.collection('users').doc(u.id).collection('badges').orderBy('earnedAt', 'desc').limit(12).get();
    if (badges.empty) continue;
    const list = badges.docs.map((d) => {
      const b = d.data();
      return { id: d.id, type: String(b.type || ''), label: label(b), seasonId: b.seasonId ?? null };
    });
    await db.collection('publicUsers').doc(u.id).set({ badgesPublic: list }, { merge: true });
    mirrored += 1;
    console.log(`- ${u.id.slice(0, 8)}…  ${list.length} badge(s)`);
  }
  console.log(`Mirrored badges for ${mirrored} of ${users.size} users.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
