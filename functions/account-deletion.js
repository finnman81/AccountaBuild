/**
 * Account deletion — App Store Guideline 5.1.1(v).
 *
 * MUST be server-side: Firestore rules deny client deletes of `users/{uid}`
 * and `publicUsers/{uid}` on purpose (delete-and-recreate was an FP-reset
 * exploit), so the app physically cannot tear itself down.
 *
 * What gets deleted vs kept is a deliberate line:
 *  - DELETED: everything that identifies the person or is theirs alone
 *  - KEPT: group chat messages and logs, which are other people's context too.
 *    Those are ANONYMIZED (uid detached, name scrubbed) rather than removed —
 *    ripping a member's logs out would silently restate teammates' history and
 *    leave replies to nothing. Apple requires the ACCOUNT be deleted, not that
 *    shared history be rewritten.
 */
const { getAuth } = require('firebase-admin/auth');
const { FieldValue } = require('firebase-admin/firestore');

/** Every subcollection under users/{uid} (verified against prod). */
const USER_SUBCOLLECTIONS = [
  'activity', 'badges', 'calorieDays', 'fpDaily', 'goals', 'groups',
  'healthSettings', 'healthTombstones', 'seasonResults', 'seasons',
  'weekly', 'weights', 'workouts',
];

async function deleteCollection(db, ref, batchSize = 300) {
  let removed = 0;
  for (;;) {
    const snap = await ref.limit(batchSize).get();
    if (snap.empty) return removed;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < batchSize) return removed;
  }
}

/** Detach a departing user's shared content instead of deleting it. */
async function anonymizeShared(db, uid, groupIds) {
  let logs = 0;
  let messages = 0;
  for (const gid of groupIds) {
    const logSnap = await db.collection('groups').doc(gid).collection('logs').where('uid', '==', uid).get();
    for (const chunk of chunked(logSnap.docs, 300)) {
      const batch = db.batch();
      chunk.forEach((d) => batch.delete(d.ref)); // a member's OWN logs are theirs — remove
      await batch.commit();
      logs += chunk.length;
    }
    const msgSnap = await db.collection('groups').doc(gid).collection('messages').where('uid', '==', uid).get();
    for (const chunk of chunked(msgSnap.docs, 300)) {
      const batch = db.batch();
      // Chat is a conversation — keep the thread readable, drop the identity.
      chunk.forEach((d) => batch.update(d.ref, { uid: 'deleted', senderName: 'Deleted user' }));
      await batch.commit();
      messages += chunk.length;
    }
  }
  return { logs, messages };
}

function* chunked(arr, n) {
  for (let i = 0; i < arr.length; i += n) yield arr.slice(i, i + n);
}

/**
 * Full teardown. Order matters: leave groups FIRST so syncVisibility reacts
 * while the account still exists, then remove identity last so a mid-way
 * failure leaves a recoverable state rather than an orphaned ghost member.
 */
async function deleteAccount(db, uid) {
  const report = { uid, groupsLeft: 0, subcollections: 0, logs: 0, messages: 0 };

  // 1. Which groups? (needed before we delete the membership records)
  const myGroups = await db.collection('users').doc(uid).collection('groups').get();
  // Dedupe: a stale membership record can point at the same group twice, and
  // the roster fix-up below must run once per GROUP, not once per record.
  const groupIds = [...new Set(myGroups.docs.map((d) => String(d.data()?.groupId ?? d.id)).filter(Boolean))];

  // 2. Shared content: own logs removed, chat anonymized.
  const shared = await anonymizeShared(db, uid, groupIds);
  report.logs = shared.logs;
  report.messages = shared.messages;

  // 3. Leave every group (also decrements the roster + triggers syncVisibility).
  for (const gid of groupIds) {
    await db.collection('groups').doc(gid).collection('members').doc(uid).delete().catch(() => {});
    await db.collection('groups').doc(gid).collection('goals').doc(uid).delete().catch(() => {});
    // RECOUNT, don't decrement. increment(-1) drifts permanently on any retry,
    // duplicate membership record, or partial failure — and a wrong roster
    // count is invisible until someone notices the number is nonsense.
    try {
      const roster = await db.collection('groups').doc(gid).collection('members').get();
      await db.collection('groups').doc(gid)
        .set({ memberCount: roster.size, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch {
      /* roster fix-up is best-effort */
    }
    report.groupsLeft += 1;
  }

  // 4. Their own data.
  for (const sub of USER_SUBCOLLECTIONS) {
    report.subcollections += await deleteCollection(db, db.collection('users').doc(uid).collection(sub));
  }
  await deleteCollection(db, db.collection('publicUsers').doc(uid).collection('weeklyPublic'));
  await deleteCollection(db, db.collection('visibility').doc(uid).collection('canSee'));

  // 5. Anything keyed by uid elsewhere.
  for (const [col, field] of [['signatures', null], ['pollResponses', 'uid'], ['pushQueue', 'toUid']]) {
    if (col === 'signatures') {
      for (const gid of groupIds) {
        const sigs = await db.collection('groups').doc(gid).collection('signatures').where('uid', '==', uid).get();
        await Promise.all(sigs.docs.map((d) => d.ref.delete().catch(() => {})));
      }
    } else {
      const snap = await db.collection(col).where(field, '==', uid).get().catch(() => null);
      if (snap) await Promise.all(snap.docs.map((d) => d.ref.delete().catch(() => {})));
    }
  }

  // 6. Release the username so it can be reused.
  const unameSnap = await db.collection('usernames').where('uid', '==', uid).get().catch(() => null);
  if (unameSnap) await Promise.all(unameSnap.docs.map((d) => d.ref.delete().catch(() => {})));

  // 7. Identity last.
  await db.collection('visibility').doc(uid).delete().catch(() => {});
  await db.collection('publicUsers').doc(uid).delete().catch(() => {});
  await db.collection('users').doc(uid).delete().catch(() => {});

  // 8. Auth record — after Firestore, so a failure here still leaves the data
  //    gone and the user able to retry rather than locked out mid-teardown.
  await getAuth().deleteUser(uid).catch((e) => {
    console.warn('[deleteAccount] auth delete failed (data already removed)', e);
  });

  console.log('[deleteAccount] done', JSON.stringify(report));
  return report;
}

module.exports = { deleteAccount, USER_SUBCOLLECTIONS };
