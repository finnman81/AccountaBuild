/**
 * Recruit contest. config/app.activeContestId -> contests/{id}:
 *   { name, startYmd, endYmd, qualifyDays, qualifyWindowDays, resultsYmd,
 *     excludedUids[], prizes{first, drawing}, rulesUrl, status }
 *
 * A REFERRAL is a brand-new member (account created on/after startYmd) who
 * joins during the contest and names their inviter in "Who got you here?".
 * It QUALIFIES when that member logs on `qualifyDays` different days within
 * `qualifyWindowDays` of joining. Throwaway accounts can't qualify, and the
 * contest rewards people who actually stick.
 *
 *   contests/{id}/referrals/{newUid}  server-only (who invited whom)
 *   contests/{id}/standings/{inviter} public: first name + counts
 *
 * Exactly-once per new member: the referral doc id IS their uid (create()).
 */
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const core = require('./mmr-core');

const TZ = core.DEFAULT_TZ;
const DAY_MS = 24 * 60 * 60 * 1000;

function addDaysYmd(ymd, n) {
  const t = Date.parse(`${ymd}T12:00:00Z`) + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

async function activeContest(db) {
  const cfg = await db.doc('config/app').get();
  const id = cfg.exists ? cfg.get('activeContestId') : null;
  if (!id) return null;
  const c = await db.doc(`contests/${id}`).get();
  return c.exists ? { id, ...c.data() } : null;
}

function firstName(n) {
  const s = String(n || '').trim();
  return s ? s.split(/\s+/)[0] : 'Member';
}

/** Called by creditInviter when a member names who invited them. */
async function recordReferral(db, { groupId, memberId, inviter, now = new Date() }) {
  const c = await activeContest(db);
  if (!c || c.status === 'draft') return null;
  const today = core.yyyyMmDdInTz(now, TZ);
  if (today < c.startYmd || today > c.endYmd) return null;

  const userSnap = await db.doc(`users/${memberId}`).get();
  const created = userSnap.exists ? userSnap.get('createdAt') : null;
  const createdYmd = created && typeof created.toDate === 'function' ? core.yyyyMmDdInTz(created.toDate(), TZ) : null;
  // Brand-new accounts only: an existing member joining another group isn't a recruit.
  if (!createdYmd || createdYmd < c.startYmd) return null;

  const excluded = Array.isArray(c.excludedUids) && c.excludedUids.includes(inviter);
  try {
    await db.doc(`contests/${c.id}/referrals/${memberId}`).create({
      inviter,
      groupId,
      joinedYmd: today,
      qualified: false,
      excluded,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    return null; // already counted (a member counts once, for the first inviter named)
  }
  await tallyContest(db, c, now);
  return { contestId: c.id };
}

/** Re-check every unqualified referral and rewrite the public standings. */
async function tallyContest(db, contestIn, now = new Date()) {
  const c = contestIn || (await activeContest(db));
  if (!c) return { referrals: 0 };
  const qualifyDays = Number(c.qualifyDays) || 3;
  const windowDays = Number(c.qualifyWindowDays) || 7;
  const refs = await db.collection(`contests/${c.id}/referrals`).get();

  const standings = new Map();
  for (const r of refs.docs) {
    const d = r.data();
    if (!d.qualified) {
      const until = addDaysYmd(d.joinedYmd, windowDays - 1);
      const dates = new Set();
      const groups = await db.collection(`users/${r.id}/groups`).get();
      for (const g of groups.docs) {
        const gid = String(g.get('groupId') || g.id);
        const logs = await db.collection(`groups/${gid}/logs`)
          .where('uid', '==', r.id).where('date', '>=', d.joinedYmd).where('date', '<=', until).get();
        logs.docs.forEach((l) => dates.add(l.get('date')));
      }
      if (dates.size >= qualifyDays) {
        await r.ref.update({ qualified: true, qualifiedAt: FieldValue.serverTimestamp(), logDays: dates.size });
        d.qualified = true;
        d.qualifiedAtMs = Date.now();
      } else if (dates.size !== d.logDays) {
        await r.ref.update({ logDays: dates.size }).catch(() => {});
      }
    }
    if (d.excluded) continue;
    const s = standings.get(d.inviter) || { qualified: 0, pending: 0, lastQualifiedAtMs: 0 };
    if (d.qualified) {
      s.qualified += 1;
      const ms = d.qualifiedAtMs || (d.qualifiedAt && d.qualifiedAt.toMillis ? d.qualifiedAt.toMillis() : 0);
      s.lastQualifiedAtMs = Math.max(s.lastQualifiedAtMs, ms);
    } else if (now.getTime() <= Date.parse(`${addDaysYmd(d.joinedYmd, windowDays)}T12:00:00Z`)) {
      s.pending += 1; // still inside their window
    }
    standings.set(d.inviter, s);
  }

  for (const [uid, s] of standings) {
    const pub = await db.doc(`publicUsers/${uid}`).get();
    await db.doc(`contests/${c.id}/standings/${uid}`).set({
      uid,
      name: firstName(pub.exists && pub.get('displayName')),
      photoURL: (pub.exists && pub.get('photoURL')) || null,
      qualified: s.qualified,
      pending: s.pending,
      // Tie-break: whoever reached their final count first ranks higher.
      lastQualifiedAt: s.lastQualifiedAtMs ? Timestamp.fromMillis(s.lastQualifiedAtMs) : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  return { referrals: refs.size, inviters: standings.size };
}

module.exports = { recordReferral, tallyContest, activeContest };
