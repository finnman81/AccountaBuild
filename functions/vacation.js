const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const core = require('./mmr-core');

const TZ = 'America/New_York';
const PER_SEASON = 2;
const MAX_AHEAD_WEEKS = 8;

/**
 * VACATION: book or cancel penalty-shielded weeks. Server-owned since
 * 2026-09-14. The client used to write users/{uid}/weekly/{weekId}.vacation
 * and vacationUsed itself, and the rules only checked WHICH keys changed, not
 * which week. So a member could flag a week they had already missed, and the
 * next run (which recomputes the previous week) would erase the penalty. They
 * could also reset their own allowance. Rules now deny both; this is the door.
 *
 * Each week is charged to ITS OWN season (the season of its Monday), so a
 * booking that crosses a quarter line can't borrow from the wrong quarter.
 *
 * The public mirror carries the full list of booked weeks (vacationWeekIds) so
 * past weeks stay shielded for the daily streak after a later booking or
 * cancel. The From/Until range is kept for bundles that predate the list.
 */

function weekSeason(weekId) {
  const monday = core.isoWeekDatesInTz(weekId, TZ)[0];
  return core.seasonIdFromDate(core.zonedNoonUtcFromYmd(monday, TZ), TZ);
}

function weekIdsFrom(startWeekId, count) {
  const out = [];
  let w = startWeekId;
  for (let i = 0; i < count; i += 1) {
    out.push(w);
    w = core.nextIsoWeekId(w, TZ);
  }
  return out;
}

/**
 * Rebuild the public mirror. Current and future weeks come from the weekly
 * flags (the source of truth). PAST weeks already on the mirror stay: a
 * shielded past week is history, and an admin fix may have shielded one
 * without a flag (the 2026-09-04 streak revive for Mologne). The first run
 * also folds in the legacy From/Until range.
 */
async function mirrorVacation(db, uid) {
  const nowWeek = core.isoWeekIdInTz(new Date(), TZ);
  const [snap, pubSnap] = await Promise.all([
    db.collection(`users/${uid}/weekly`).where('vacation', '==', true).get(),
    db.doc(`publicUsers/${uid}`).get(),
  ]);
  const pub = pubSnap.exists ? pubSnap.data() : {};
  const past = new Set((Array.isArray(pub.vacationWeekIds) ? pub.vacationWeekIds : []).filter((w) => typeof w === 'string'));
  if (!Array.isArray(pub.vacationWeekIds) && pub.vacationFromWeekId && pub.vacationUntilWeekId && pub.vacationFromWeekId <= pub.vacationUntilWeekId) {
    let w = pub.vacationFromWeekId;
    for (let i = 0; i < 30 && w <= pub.vacationUntilWeekId; i += 1) { past.add(w); w = core.nextIsoWeekId(w, TZ); }
  }
  const all = new Set(snap.docs.map((d) => d.id));
  for (const w of past) if (w < nowWeek) all.add(w);
  const ids = [...all].sort().slice(-26);
  // Legacy range = the contiguous run ending at the latest booked week.
  let from = ids[ids.length - 1] ?? null;
  const until = from;
  for (let i = ids.length - 2; i >= 0; i -= 1) {
    if (core.nextIsoWeekId(ids[i], TZ) !== from) break;
    from = ids[i];
  }
  await db.doc(`publicUsers/${uid}`).set(
    {
      vacationWeekIds: ids,
      vacationFromWeekId: from,
      vacationUntilWeekId: until,
      vacationWeekId: ids.includes(nowWeek) ? nowWeek : null,
    },
    { merge: true },
  );
  return ids;
}

async function bookVacation(db, uid, startWeekId, weeks) {
  const nowWeek = core.isoWeekIdInTz(new Date(), TZ);
  const n = Math.round(Number(weeks));
  if (!/^\d{4}-W\d{2}$/.test(String(startWeekId))) throw new HttpsError('invalid-argument', 'Bad week.');
  if (!Number.isFinite(n) || n < 1 || n > PER_SEASON) throw new HttpsError('invalid-argument', `Book 1-${PER_SEASON} weeks.`);
  if (startWeekId < nowWeek) throw new HttpsError('failed-precondition', "You can't put a past week on vacation.");
  if (startWeekId > weekIdsFrom(nowWeek, MAX_AHEAD_WEEKS + 1).pop()) {
    throw new HttpsError('failed-precondition', `Book up to ${MAX_AHEAD_WEEKS} weeks ahead.`);
  }

  const userRef = db.doc(`users/${uid}`);
  const ids = weekIdsFrom(startWeekId, n);
  await db.runTransaction(async (tx) => {
    const [userSnap, ...weekSnaps] = await tx.getAll(userRef, ...ids.map((w) => userRef.collection('weekly').doc(w)));
    const used = { ...(userSnap.data()?.vacationUsed || {}) };
    const fresh = ids.filter((_, i) => !(weekSnaps[i].exists && weekSnaps[i].data().vacation === true));
    for (const w of fresh) {
      const s = weekSeason(w);
      used[s] = (Number(used[s]) || 0) + 1;
      if (used[s] > PER_SEASON) {
        throw new HttpsError('failed-precondition', `No vacation weeks left for ${s}.`);
      }
    }
    for (const w of fresh) {
      tx.set(userRef.collection('weekly').doc(w), { vacation: true, vacationSetAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    tx.set(userRef, { vacationUsed: used }, { merge: true });
  });
  return mirrorVacation(db, uid);
}

async function cancelVacation(db, uid, fromWeekId) {
  const nowWeek = core.isoWeekIdInTz(new Date(), TZ);
  // Only the current week and later: a closed week's shield is part of its
  // score and stays put.
  const from = fromWeekId && fromWeekId > nowWeek ? fromWeekId : nowWeek;
  const userRef = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const booked = await tx.get(userRef.collection('weekly').where('vacation', '==', true));
    const userSnap = await tx.get(userRef);
    const used = { ...(userSnap.data()?.vacationUsed || {}) };
    for (const d of booked.docs) {
      if (d.id < from) continue;
      const s = weekSeason(d.id);
      used[s] = Math.max(0, (Number(used[s]) || 0) - 1);
      tx.set(d.ref, { vacation: false, vacationSetAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    tx.set(userRef, { vacationUsed: used }, { merge: true });
  });
  return mirrorVacation(db, uid);
}

/** vacation({ action: 'book', startWeekId, weeks } | { action: 'cancel', fromWeekId? }) */
const vacation = onCall(async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const db = admin.firestore();
  const d = req.data || {};
  if (d.action === 'book') return { bookedWeekIds: await bookVacation(db, uid, String(d.startWeekId), d.weeks) };
  if (d.action === 'cancel') return { bookedWeekIds: await cancelVacation(db, uid, d.fromWeekId ? String(d.fromWeekId) : null) };
  throw new HttpsError('invalid-argument', 'action must be book or cancel');
});

module.exports = { vacation, bookVacation, cancelVacation, mirrorVacation, weekSeason, PER_SEASON };
