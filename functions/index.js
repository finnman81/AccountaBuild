/**
 * AccountaBuild Cloud Functions.
 *
 * Push types (all delivered via functions/push-helper.js, which parses Expo
 * tickets and clears dead tokens):
 *  - sendSocialPush:       cheers/nudges from the pushQueue (client enqueues)
 *  - sendChatPush:         new group chat messages (throttled per recipient)
 *  - sendTeamActivityPush: a teammate's first log of the day
 *  - streakRiskReminder:   daily 18:00 ET "log today or fall off pace"
 *  - updateMmrScheduled:   weekly FP compute + rank-change & Monday-recap pushes
 *
 * Prefs: users/{uid}.notifPrefs mirrors the app's local toggles
 * (chatMessages / teamActivity / streakReminder / weeklyRecap); a missing
 * field means enabled. Nudges additionally require allowNudges === true.
 */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { computeUserUpToCurrentWeek } = require('./mmr-compute');
const { evaluateStreakRisk, evaluateDailyChampion } = require('./notif-logic');
const core = require('./mmr-core');
const { sendExpoPushes, isExpoToken, prefEnabled, inQuietHours } = require('./push-helper');

initializeApp();
const db = getFirestore();

const TZ = core.DEFAULT_TZ; // America/New_York
const CHAT_THROTTLE_MS = 10 * 60 * 1000; // one chat push per recipient per group per 10 min

const ROMAN = ['', 'I', 'II', 'III', 'IV'];
function rankLabel(band) {
  return `${band.tier}${band.division ? ` ${ROMAN[band.division]}` : ''}`;
}

async function getGroupMemberUids(groupId) {
  const snap = await db.collection('groups').doc(groupId).collection('members').get();
  return snap.docs.map((d) => d.id);
}

/** Batch-fetch user docs; returns Map<uid, data>. */
async function getUsers(uids) {
  const out = new Map();
  await Promise.all(
    uids.map(async (uid) => {
      const snap = await db.doc(`users/${uid}`).get();
      if (snap.exists) out.set(uid, snap.data() || {});
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------
// Cheers / nudges (pushQueue)
// ---------------------------------------------------------------------------
exports.sendSocialPush = onDocumentCreated('pushQueue/{id}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data() || {};
  const { toUid, fromUid, fromName, type } = data;
  const cleanup = () => snap.ref.delete().catch(() => {});

  if (!toUid || (type !== 'cheer' && type !== 'nudge' && type !== 'reaction')) {
    await cleanup();
    return;
  }

  try {
    const userSnap = await db.doc(`users/${toUid}`).get();
    const user = userSnap.exists ? userSnap.data() : null;
    const token = user && user.expoPushToken;

    // Nudges require the recipient to have opted in; cheers/reactions are always allowed.
    if (type === 'nudge' && !(user && user.allowNudges === true)) {
      await cleanup();
      return;
    }

    const name = (fromName && String(fromName)) || 'A teammate';
    const emoji = (data.emoji && String(data.emoji)) || '💪';
    const logType = (data.logType && String(data.logType)) || 'log';
    const message =
      type === 'cheer'
        ? { title: '💪 You got a cheer', body: `${name} cheered you on!` }
        : type === 'reaction'
          ? { title: `${emoji} ${name} reacted`, body: `${name} reacted ${emoji} to your ${logType === 'calories' ? 'calorie log' : logType === 'weight' ? 'weigh-in' : logType}` }
          : { title: '👋 Nudge', body: `${name} nudged you to log today.` };

    // Record an in-app Activity item regardless of push delivery (so the bell
    // shows it even when the recipient has notifications off / no token).
    await db.collection('users').doc(toUid).collection('activity').add({
      type,
      fromUid: fromUid || null,
      fromName: name,
      title: message.title,
      body: message.body,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    }).catch((e) => console.warn('[sendSocialPush] activity write failed', e));

    if (isExpoToken(token)) {
      await sendExpoPushes(db, [
        {
          uid: toUid,
          token,
          title: message.title,
          body: message.body,
          data: { type, fromUid: fromUid || null, screen: 'Activity' },
        },
      ]);
    }
  } catch (e) {
    console.error('[sendSocialPush] failed', e);
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// Chat message pushes
// ---------------------------------------------------------------------------
exports.sendChatPush = onDocumentCreated('groups/{groupId}/messages/{messageId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const msg = snap.data() || {};
  const groupId = event.params.groupId;
  const senderUid = String(msg.uid || '');
  const text = String(msg.text || '').trim();
  if (!senderUid || !text) return;
  if (inQuietHours(new Date(), TZ)) return;

  try {
    const [memberUids, groupSnap, senderSnap] = await Promise.all([
      getGroupMemberUids(groupId),
      db.doc(`groups/${groupId}`).get(),
      db.doc(`publicUsers/${senderUid}`).get(),
    ]);
    const groupName = (groupSnap.exists && groupSnap.data().name) || 'Group chat';
    // System messages (weekly recap, challenge announcements) carry their own
    // senderName; humans resolve through publicUsers.
    const senderName =
      (msg.senderName && String(msg.senderName)) ||
      (senderSnap.exists && senderSnap.data().displayName) ||
      'A teammate';

    const recipients = memberUids.filter((uid) => uid !== senderUid);
    if (!recipients.length) return;
    const users = await getUsers(recipients);

    const now = Date.now();
    const items = [];
    for (const uid of recipients) {
      const u = users.get(uid);
      if (!u || !isExpoToken(u.expoPushToken)) continue;
      if (!prefEnabled(u, 'chatMessages')) continue;
      const marker = u.chatPushMarkers && u.chatPushMarkers[groupId];
      const markerMs = marker && typeof marker.toMillis === 'function' ? marker.toMillis() : 0;
      if (now - markerMs < CHAT_THROTTLE_MS) continue;
      items.push({
        uid,
        token: u.expoPushToken,
        title: `💬 ${groupName}`,
        body: `${senderName}: ${text.length > 120 ? `${text.slice(0, 117)}…` : text}`,
        data: { type: 'chat', screen: 'GroupChat', groupId },
      });
    }
    if (!items.length) return;

    await sendExpoPushes(db, items);
    await Promise.all(
      items.map((m) =>
        db
          .doc(`users/${m.uid}`)
          .set({ chatPushMarkers: { [groupId]: Timestamp.now() } }, { merge: true })
          .catch(() => {}),
      ),
    );
  } catch (e) {
    console.error('[sendChatPush] failed', e);
  }
});

// ---------------------------------------------------------------------------
// Teammate activity pushes (first log of the day only)
// ---------------------------------------------------------------------------
const LOG_VERBS = {
  workout: 'logged a workout 💪',
  calories: 'logged calories 🍽️',
  weight: 'logged a weigh-in ⚖️',
  photo: 'posted a progress photo 📸',
};

exports.sendTeamActivityPush = onDocumentCreated('groups/{groupId}/logs/{logId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const log = snap.data() || {};
  const groupId = event.params.groupId;
  const authorUid = String(log.uid || '');
  const type = String(log.type || '');
  const date = String(log.date || '');
  const verb = LOG_VERBS[type];
  if (!authorUid || !verb) return;

  const now = new Date();
  // Health syncs backfill older days — only announce logs for today.
  if (date !== core.yyyyMmDdInTz(now, TZ)) return;
  if (inQuietHours(now, TZ)) return;

  try {
    // Only the author's FIRST log of the day triggers a push (anti-spam:
    // someone logging 4 meals shouldn't ping the group 4 times).
    const todaysLogs = await db
      .collection('groups').doc(groupId).collection('logs')
      .where('uid', '==', authorUid)
      .where('date', '==', date)
      .limit(2)
      .get();
    if (todaysLogs.size > 1) return;

    const [memberUids, authorSnap] = await Promise.all([
      getGroupMemberUids(groupId),
      db.doc(`publicUsers/${authorUid}`).get(),
    ]);
    const authorName = (authorSnap.exists && authorSnap.data().displayName) || 'A teammate';

    const recipients = memberUids.filter((uid) => uid !== authorUid);
    if (!recipients.length) return;
    const users = await getUsers(recipients);

    const items = [];
    for (const uid of recipients) {
      const u = users.get(uid);
      if (!u || !isExpoToken(u.expoPushToken)) continue;
      if (!prefEnabled(u, 'teamActivity')) continue;
      items.push({
        uid,
        token: u.expoPushToken,
        title: '🏋️ Team activity',
        body: `${authorName} ${verb}`,
        data: { type: 'teamActivity', screen: 'GroupChat', groupId },
      });
    }
    if (items.length) await sendExpoPushes(db, items);
  } catch (e) {
    console.error('[sendTeamActivityPush] failed', e);
  }
});

// ---------------------------------------------------------------------------
// Smart streak-at-risk reminder (daily 18:00 ET)
// ---------------------------------------------------------------------------
exports.streakRiskReminder = onSchedule(
  { schedule: '0 18 * * *', timeZone: TZ, timeoutSeconds: 540, memory: '256MiB' },
  async () => {
    const { items, evaluated } = await evaluateStreakRisk(db, new Date());
    const result = items.length ? await sendExpoPushes(db, items) : { sent: 0 };
    console.log(`[streakRiskReminder] evaluated ${evaluated} users, sent ${result.sent}`);
  },
);

// ---------------------------------------------------------------------------
// Weekly FP compute + rank-change & Monday-recap pushes
// ---------------------------------------------------------------------------
/**
 * updateMmrScheduled: closes/refreshes every user's weekly FP on a schedule.
 *
 * WHY: FP previously only recomputed on a user's OWN device (Profile-screen
 * catch-up) — anyone who didn't open the app kept a frozen score forever
 * (verified in production). This runs the same idempotent weekly compute
 * (functions/mmr-compute.js, parity-tested against the client math) for ALL
 * users every 6 hours. Client-side computes remain and interleave safely.
 *
 * Piggybacked pushes (only between 09:00–21:00 ET so the 6h schedule never
 * wakes anyone at 3am):
 *  - rank change: compare the user's band before/after the compute
 *  - Monday recap: last week's closed weekly doc, once per user per week
 *
 * TODO(season): season rollover (ensureSeasonRollover) is still client-only —
 * inactive users won't soft-reset at the quarter boundary (next: Oct 1).
 */
exports.updateMmrScheduled = onSchedule(
  { schedule: 'every 6 hours', timeZone: TZ, timeoutSeconds: 540, memory: '256MiB' },
  async () => {
    const now = new Date();
    const hourEt = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(now));
    const pushWindow = hourEt >= 9 && hourEt < 21;
    const isMondayEt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now) === 'Mon';
    const currentWeekId = core.isoWeekIdInTz(now, TZ);
    const weekDates = core.isoWeekDatesInTz(currentWeekId, TZ);
    const prevWeekEnd = new Date(core.zonedNoonUtcFromYmd(weekDates[0], TZ).getTime() - 24 * 60 * 60 * 1000);
    const prevWeekId = core.isoWeekIdInTz(prevWeekEnd, TZ);

    const users = await db.collection('users').get();
    let ok = 0;
    let failed = 0;
    const pushes = [];

    for (const u of users.docs) {
      const before = u.data() || {};
      try {
        await computeUserUpToCurrentWeek(db, { uid: u.id, apply: true });
        ok += 1;
      } catch (e) {
        failed += 1;
        console.error('[updateMmrScheduled] failed for', u.id, e);
        continue;
      }

      if (!pushWindow || !isExpoToken(before.expoPushToken)) continue;

      try {
        const afterSnap = await db.doc(`users/${u.id}`).get();
        const after = afterSnap.exists ? afterSnap.data() || {} : {};

        // Rank change: band moved during THIS compute run.
        if (typeof before.mmr === 'number' && typeof after.mmr === 'number') {
          const bandBefore = core.bandForMMR(before.mmr);
          const bandAfter = core.bandForMMR(after.mmr);
          if (rankLabel(bandBefore) !== rankLabel(bandAfter)) {
            const up = core.bandOrderIndex(bandAfter) > core.bandOrderIndex(bandBefore);
            pushes.push({
              uid: u.id,
              token: before.expoPushToken,
              title: up ? `📈 Promoted to ${rankLabel(bandAfter)}!` : `📉 Dropped to ${rankLabel(bandAfter)}`,
              body: up ? 'Your week of work paid off. Keep the streak alive.' : 'Log consistently this week to climb back.',
              data: { type: 'rankChange', screen: 'Activity' },
            });
          }
        }

        // Monday recap: once per user per week, gated on the weeklyRecap pref.
        if (isMondayEt && prefEnabled(after, 'weeklyRecap') && after.recapPushedWeekId !== prevWeekId) {
          const wkSnap = await db.doc(`users/${u.id}/weekly/${prevWeekId}`).get();
          if (wkSnap.exists) {
            const wk = wkSnap.data() || {};
            const delta = Math.round(Number(wk.deltaMMR) || 0);
            const band = core.bandForMMR(Number(after.mmr) || 0);
            pushes.push({
              uid: u.id,
              token: before.expoPushToken,
              title: `📊 Weekly recap: ${delta >= 0 ? '+' : ''}${delta} FP`,
              body: `You're ${rankLabel(band)}. ${delta >= 0 ? 'New week, keep climbing.' : 'Fresh week, fresh start — log today.'}`,
              data: { type: 'weeklyRecap', screen: 'Activity' },
            });
            await db.doc(`users/${u.id}`).set({ recapPushedWeekId: prevWeekId }, { merge: true }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('[updateMmrScheduled] push eval failed for', u.id, e);
      }
    }

    const result = pushes.length ? await sendExpoPushes(db, pushes) : { sent: 0 };
    console.log(`[updateMmrScheduled] done: ${ok} ok, ${failed} failed of ${users.size}; pushes sent ${result.sent}`);
  },
);

// ---------------------------------------------------------------------------
// Group weekly recap posted into chat (Mondays 10:00 ET)
// ---------------------------------------------------------------------------
/**
 * Gives the GROUP a heartbeat: one system message per group per week with the
 * top FP gainer, completion count, and streak leader. Delivery to phones rides
 * the existing sendChatPush trigger for free (system messages carry their own
 * senderName). Idempotent via groups/{gid}.chatRecapWeekId.
 */
exports.groupWeeklyRecap = onSchedule(
  { schedule: '0 10 * * 1', timeZone: TZ, timeoutSeconds: 540, memory: '256MiB' },
  async () => {
    const now = new Date();
    const currentWeekId = core.isoWeekIdInTz(now, TZ);
    const weekDates = core.isoWeekDatesInTz(currentWeekId, TZ);
    const prevWeekEnd = new Date(core.zonedNoonUtcFromYmd(weekDates[0], TZ).getTime() - 24 * 60 * 60 * 1000);
    const prevWeekId = core.isoWeekIdInTz(prevWeekEnd, TZ);

    const groups = await db.collection('groups').get();
    let posted = 0;

    for (const g of groups.docs) {
      try {
        const gData = g.data() || {};
        if (gData.chatRecapWeekId === prevWeekId) continue;
        const memberUids = await getGroupMemberUids(g.id);
        if (memberUids.length < 2) continue;

        let topGainer = null; // { name, delta }
        let completed = 0;
        let scored = 0;
        let streakLeader = null; // { name, weeks }

        // Fetch every member's docs in parallel (was serial per member).
        const perMember = await Promise.all(
          memberUids.map(async (uid) => {
            const [wkSnap, userSnap, pubSnap] = await Promise.all([
              db.doc(`users/${uid}/weekly/${prevWeekId}`).get(),
              db.doc(`users/${uid}`).get(),
              db.doc(`publicUsers/${uid}`).get(),
            ]);
            return { wkSnap, userSnap, pubSnap };
          }),
        );

        for (const { wkSnap, userSnap, pubSnap } of perMember) {
          const name = (pubSnap.exists && pubSnap.data().displayName) || 'A teammate';
          if (wkSnap.exists) {
            const wk = wkSnap.data() || {};
            scored += 1;
            if (wk.completedWeek === true) completed += 1;
            const delta = Math.round(Number(wk.deltaMMR) || 0);
            if (delta > 0 && (!topGainer || delta > topGainer.delta)) topGainer = { name, delta };
          }
          const streakWeeks = userSnap.exists ? Number(userSnap.data().streakWeeks) || 0 : 0;
          if (streakWeeks > 0 && (!streakLeader || streakWeeks > streakLeader.weeks)) {
            streakLeader = { name, weeks: streakWeeks };
          }
        }

        if (scored === 0) continue; // nothing to recap for this group

        const lines = [`📊 Weekly recap — ${prevWeekId}`];
        if (topGainer) lines.push(`🏆 Top gainer: ${topGainer.name} (+${topGainer.delta} FP)`);
        lines.push(`✅ ${completed}/${memberUids.length} completed their week`);
        if (streakLeader) lines.push(`🔥 Streak leader: ${streakLeader.name} (${streakLeader.weeks} wk${streakLeader.weeks === 1 ? '' : 's'})`);
        lines.push('New week starts now — first log sets the pace!');

        await db.collection('groups').doc(g.id).collection('messages').add({
          uid: 'system',
          system: true,
          senderName: 'AccountaBuild',
          text: lines.join('\n'),
          createdAt: FieldValue.serverTimestamp(),
        });
        await db.collection('groups').doc(g.id).set({ chatRecapWeekId: prevWeekId }, { merge: true });
        posted += 1;
      } catch (e) {
        console.error('[groupWeeklyRecap] failed for group', g.id, e);
      }
    }
    console.log(`[groupWeeklyRecap] posted ${posted} of ${groups.size} groups`);
  },
);

// ---------------------------------------------------------------------------
// Challenge lifecycle: start/end announcements (daily 09:00 ET)
// ---------------------------------------------------------------------------
exports.challengeLifecycle = onSchedule(
  { schedule: '0 9 * * *', timeZone: TZ, timeoutSeconds: 540, memory: '256MiB' },
  async () => {
    const now = new Date();
    const currentWeekId = core.isoWeekIdInTz(now, TZ);
    const groups = await db.collection('groups').get();
    let announced = 0;

    for (const g of groups.docs) {
      try {
        const c = (g.data() || {}).challenge;
        if (!c || typeof c.startWeekId !== 'string' || typeof c.durationWeeks !== 'number') continue;

        // ISO week ids (YYYY-WNN) compare correctly as strings.
        let endWeekId = c.startWeekId;
        for (let i = 1; i < Math.max(1, c.durationWeeks); i++) endWeekId = core.nextIsoWeekId(endWeekId, TZ);
        const started = currentWeekId >= c.startWeekId;
        const over = c.status === 'ended' || currentWeekId > endWeekId;
        const name = (c.name && String(c.name)) || 'Challenge';

        const notify = async (title, body, alsoChat) => {
          const memberUids = await getGroupMemberUids(g.id);
          const users = await getUsers(memberUids);
          const items = [];
          for (const uid of memberUids) {
            const u = users.get(uid);
            if (!u || !isExpoToken(u.expoPushToken)) continue;
            if (!prefEnabled(u, 'teamActivity')) continue;
            items.push({ uid, token: u.expoPushToken, title, body, data: { type: 'challenge', screen: 'Today' } });
          }
          if (items.length) await sendExpoPushes(db, items);
          if (alsoChat) {
            await db.collection('groups').doc(g.id).collection('messages').add({
              uid: 'system',
              system: true,
              senderName: 'AccountaBuild',
              text: `${title}\n${body}`,
              createdAt: FieldValue.serverTimestamp(),
            });
          }
        };

        if (over && !c.endNotifiedAt) {
          await notify(`🏆 ${name} is complete!`, 'Check the final standings — and start the next one.', true);
          await g.ref.update({ 'challenge.endNotifiedAt': Timestamp.now() });
          announced += 1;
        } else if (started && !over && !c.startNotifiedAt) {
          await notify(`🏁 ${name} is live!`, `${c.durationWeeks} weeks on the clock. Every log counts — go.`, true);
          await g.ref.update({ 'challenge.startNotifiedAt': Timestamp.now() });
          announced += 1;
        }
      } catch (e) {
        console.error('[challengeLifecycle] failed for group', g.id, e);
      }
    }
    console.log(`[challengeLifecycle] announced ${announced} of ${groups.size} groups`);
  },
);

// ---------------------------------------------------------------------------
// Yesterday's Champion (daily 08:00 ET)
// ---------------------------------------------------------------------------
/**
 * Morning push per group crowning whoever logged the most yesterday
 * (categories logged 0-3, tiebreak minutes). The champion gets crown copy;
 * teammates get the callout. Days where nobody logged are silently skipped.
 * Gated on notifPrefs.teamActivity; idempotent via groups.dailyChampionDate.
 */
exports.dailyChampion = onSchedule(
  { schedule: '0 8 * * *', timeZone: TZ, timeoutSeconds: 540, memory: '256MiB' },
  async () => {
    const { results, yDay } = await evaluateDailyChampion(db, new Date());
    let sent = 0;

    for (const r of results) {
      try {
        const users = await getUsers(r.memberUids);
        const champs = [r.championUid, r.coChampUid].filter(Boolean);
        const champLabel = r.coChampName ? `${r.championName} & ${r.coChampName}` : r.championName;

        const items = [];
        for (const uid of r.memberUids) {
          const u = users.get(uid);
          if (!u || !isExpoToken(u.expoPushToken)) continue;
          if (!prefEnabled(u, 'teamActivity')) continue;
          const isChamp = champs.includes(uid);
          items.push({
            uid,
            token: u.expoPushToken,
            title: isChamp ? '👑 You were yesterday\'s champion!' : '🌅 Yesterday\'s Champion',
            body: isChamp
              ? `${r.line}. Defend the crown today.`
              : `${champLabel} owned yesterday — ${r.line}. Your move.`,
            data: { type: 'dailyChampion', screen: 'Today' },
          });
        }
        if (items.length) {
          const res = await sendExpoPushes(db, items);
          sent += res.sent;
        }
        await db.collection('groups').doc(r.groupId).set({ dailyChampionDate: r.yDay }, { merge: true });
      } catch (e) {
        console.error('[dailyChampion] failed for group', r.groupId, e);
      }
    }
    console.log(`[dailyChampion] ${yDay}: ${results.length} groups, ${sent} pushes`);
  },
);
