const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const core = require('./mmr-core');

const TZ = 'America/New_York';
const MIN_WEEKS = 2;
const MAX_WEEKS = 12;

/**
 * HIBERNATION — a multi-week penalty shield for a real absence (deployment,
 * injury, long trip). Scoring effect is identical to a vacation week (see
 * mmr-compute.js): no missed/partial penalty, streak held, no freeze spent,
 * missed-week counter reset, anything logged still scores.
 *
 * Server-owned on purpose. The range drives scoring, so a client that could
 * write it could exempt itself forever; rules deny the field and this callable
 * is the only door. Bounds (2-12 weeks) make it an absence valve rather than a
 * standing exemption, and the range only ever covers the CURRENT week forward
 * — closed weeks stay closed, the same rule vacation follows.
 */

function weekIdPlus(weekId, n) {
  // Walk by real dates so ISO year boundaries can't be fumbled (2026 has 53
  // weeks; naive "W + n" arithmetic produces a W54 that doesn't exist).
  //
  // NOON UTC, not midnight: a UTC-midnight Monday is Sunday 8pm in New York,
  // which reads back as the PREVIOUS ISO week. Caught in test — the first
  // version returned W32 for "this week" and froze W52+1 at W52.
  const [y, w] = weekId.split('-W');
  const jan4 = new Date(Date.UTC(Number(y), 0, 4, 12));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (Number(w) - 1) * 7);
  monday.setUTCDate(monday.getUTCDate() + n * 7);
  return core.isoWeekIdInTz(monday, TZ);
}

/** Shared by the callable and the admin script. */
async function applyHibernation(db, { uid, weeks, reason, setBy }) {
  const n = Math.round(Number(weeks));
  if (!Number.isFinite(n) || n < MIN_WEEKS || n > MAX_WEEKS) {
    throw new Error(`weeks must be ${MIN_WEEKS}-${MAX_WEEKS}`);
  }
  const fromWeekId = core.isoWeekIdInTz(new Date(), TZ);
  const untilWeekId = weekIdPlus(fromWeekId, n - 1);
  const hibernation = {
    fromWeekId,
    untilWeekId,
    // The week after the range is a no-penalty landing week.
    graceWeekId: weekIdPlus(untilWeekId, 1),
    reason: reason ? String(reason).slice(0, 80) : null,
    setBy: setBy || uid,
    setAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.doc(`users/${uid}`).set({ hibernation }, { merge: true });
  // Public mirror drives the 😴 badge, the pod avatar, and every denominator
  // that should skip a sleeping member.
  await db.doc(`publicUsers/${uid}`).set(
    { hibernatingUntilWeekId: untilWeekId, hibernatingFromWeekId: fromWeekId },
    { merge: true },
  );
  return hibernation;
}

async function clearHibernation(db, uid, { keepGrace = true } = {}) {
  const snap = await db.doc(`users/${uid}`).get();
  const hib = snap.exists ? snap.data().hibernation : null;
  const grace = keepGrace && hib ? { graceWeekId: core.isoWeekIdInTz(new Date(), TZ) } : null;
  await db.doc(`users/${uid}`).set(
    { hibernation: grace ? { ...hib, ...grace, fromWeekId: 'x', untilWeekId: 'x' } : admin.firestore.FieldValue.delete() },
    { merge: true },
  );
  await db.doc(`publicUsers/${uid}`).set(
    { hibernatingUntilWeekId: null, hibernatingFromWeekId: null },
    { merge: true },
  );
}

/**
 * setHibernation({ weeks, reason, targetUid? })
 * Self-serve, or a group ADMIN acting for a member who shipped out before
 * setting it themselves (Nick, army training — the case this was built for).
 */
const setHibernation = onCall(async (req) => {
  const db = admin.firestore();
  const caller = req.auth && req.auth.uid;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in first.');

  const targetUid = req.data && req.data.targetUid ? String(req.data.targetUid) : caller;
  if (targetUid !== caller) {
    // Admin path: caller must be an admin of a group the target belongs to.
    const mine = await db.collection(`users/${caller}/groups`).get();
    let ok = false;
    for (const g of mine.docs) {
      const [me, them] = await Promise.all([
        db.doc(`groups/${g.id}/members/${caller}`).get(),
        db.doc(`groups/${g.id}/members/${targetUid}`).get(),
      ]);
      if (me.exists && them.exists && me.data().role === 'admin') { ok = true; break; }
    }
    if (!ok) throw new HttpsError('permission-denied', 'Only a group admin can do that for someone else.');
  }

  if (req.data && req.data.clear === true) {
    await clearHibernation(db, targetUid);
    return { cleared: true };
  }

  try {
    const hibernation = await applyHibernation(db, {
      uid: targetUid,
      weeks: req.data && req.data.weeks,
      reason: req.data && req.data.reason,
      setBy: caller,
    });
    return { fromWeekId: hibernation.fromWeekId, untilWeekId: hibernation.untilWeekId };
  } catch (e) {
    throw new HttpsError('invalid-argument', String(e.message || e));
  }
});

/**
 * Auto-wake: called from the 6h scheduled run. Anyone whose range has passed
 * gets cleared (keeping the grace week) and their group told they're back.
 */
async function wakeExpiredHibernations(db, publishCelebration) {
  const weekId = core.isoWeekIdInTz(new Date(), TZ);
  const users = await db.collection('users').where('hibernation.untilWeekId', '<', weekId).get();
  const woke = [];
  for (const u of users.docs) {
    try {
      const data = u.data();
      if (!data.hibernation || data.hibernation.untilWeekId === 'x') continue;
      await clearHibernation(db, u.id);
      woke.push(u.id);
      if (publishCelebration) {
        const pub = await db.doc(`publicUsers/${u.id}`).get();
        const name = (pub.exists && pub.data().displayName) || 'A teammate';
        await publishCelebration(db, {
          uid: u.id,
          ann: {
            id: `wake-${u.id}-${weekId}`,
            emoji: '☀️',
            title: `${name} is back`,
            lines: ['Out of hibernation and back on the board. This week is a free landing — then it counts.'],
          },
          pushTitle: `☀️ ${name} is back`,
          pushBody: 'Welcome them back in the chat.',
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('[hibernation] wake failed for', u.id, e);
    }
  }
  if (woke.length) console.log('[hibernation] woke', woke.length);
  return woke;
}

module.exports = { setHibernation, applyHibernation, clearHibernation, wakeExpiredHibernations, MIN_WEEKS, MAX_WEEKS };
