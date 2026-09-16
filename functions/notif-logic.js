/**
 * Pure notification-evaluation logic, kept out of index.js so admin scripts
 * can dry-run it against production with their own credentialed Firestore
 * (index.js calls initializeApp() at module load, which breaks script reuse).
 */
const { getGoals, getGroupIds, getWeekTotals } = require('./mmr-compute');
const core = require('./mmr-core');
const { isExpoToken, prefEnabled } = require('./push-helper');

const TZ = core.DEFAULT_TZ;

/**
 * Asleep this week? Hibernating users are shielded from penalties, so every
 * "you're about to lose your streak" nag is both wrong and unkind — they're
 * deployed, injured, or away. Mirrors the check in mmr-compute.js.
 */
function isHibernating(userData, weekId) {
  const h = userData && userData.hibernation;
  // Records persist after waking (awake: true, real past range), and legacy
  // ones may carry 'x' for the range. Only a live range counts as asleep.
  return (
    !!h &&
    !h.awake &&
    typeof h.fromWeekId === 'string' &&
    typeof h.untilWeekId === 'string' &&
    h.fromWeekId !== 'x' &&
    h.untilWeekId !== 'x' &&
    weekId >= h.fromWeekId &&
    weekId <= h.untilWeekId
  );
}

async function readWeekly(db, uid, weekId) {
  try {
    const w = await db.doc(`users/${uid}/weekly/${weekId}`).get();
    return w.exists ? w.data() || {} : null;
  } catch {
    return null;
  }
}

/**
 * Shielded this week = anything the scorer treats as vacation: a booked
 * vacation week, the anchored hibernationShield flag, a live hibernation
 * range, or the post-wake grace week (see inGraceWeek in mmr-compute.js).
 * Both flags live on users/{uid}/weekly/{weekId}, so it is one extra read;
 * pass `weekly` (null = no doc) when the caller already has it. Reminders
 * checked hibernation only: a member on a booked vacation was still told
 * their streak was at risk (prod 2026-09-04).
 */
async function isShielded(db, uid, userData, weekId, weekly) {
  if (isHibernating(userData, weekId)) return true;
  const h = userData && userData.hibernation;
  if (h && typeof h.graceWeekId === 'string' && weekId === h.graceWeekId) return true;
  const w = weekly === undefined ? await readWeekly(db, uid, weekId) : weekly;
  return !!w && (w.vacation === true || w.hibernationShield === true);
}

/**
 * Who should get a streak-at-risk push right now?
 * "At risk" = has not logged today AND a weekly target now needs EVERY
 * remaining day (including today) — skipping today makes the week unreachable.
 * Returns { items, evaluated } without sending anything.
 */
async function evaluateStreakRisk(db, now) {
  const today = core.yyyyMmDdInTz(now, TZ);
  const weekId = core.isoWeekIdInTz(now, TZ);
  const weekDates = core.isoWeekDatesInTz(weekId, TZ);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[weekDates.length - 1];
  const daysLeft = weekDates.filter((d) => d >= today).length; // including today

  const usersSnap = await db.collection('users').get();
  const items = [];

  for (const u of usersSnap.docs) {
    const data = u.data() || {};
    if (!isExpoToken(data.expoPushToken)) continue;
    if (!prefEnabled(data, 'streakReminder')) continue;
    const weekly = await readWeekly(db, u.id, weekId);
    if (await isShielded(db, u.id, data, weekId, weekly)) continue; // vacation or hibernation — the week can't hurt them

    try {
      const [goals, groupIds] = await Promise.all([getGoals(db, u.id), getGroupIds(db, u.id)]);
      if (!groupIds.length) continue;
      const totals = await getWeekTotals(db, u.id, groupIds, weekStart, weekEnd);
      const todayTotals = await getWeekTotals(db, u.id, groupIds, today, today);
      const loggedToday = todayTotals.workoutsDone > 0 || Object.keys(todayTotals.calorieTotalsByDate).length > 0;
      if (loggedToday) continue;

      const atRisk = [];
      const workoutTarget = Number(goals.workouts && goals.workouts.targetWorkoutsPerWeek);
      if ((goals.workouts?.status ?? 'active') === 'active' && Number.isFinite(workoutTarget)) {
        // From W37 the goal counts distinct days trained, not sessions (same
        // switch as the scorer), so two sessions today don't cut `need` by 2.
        const done = core.workoutDaysActiveForWeek(weekId) ? totals.workoutDaysDone : totals.workoutsDone;
        const need = workoutTarget - done;
        if (need > 0 && need >= daysLeft) atRisk.push('workout');
      }
      const calTarget = Number(goals.calorieDays && goals.calorieDays.targetDaysPerWeek);
      if ((goals.calorieDays?.status ?? 'active') === 'active' && Number.isFinite(calTarget)) {
        const hit = Object.keys(totals.calorieTotalsByDate).length;
        const need = calTarget - hit;
        if (need > 0 && need >= daysLeft) atRisk.push('calories');
      }
      if (!atRisk.length) continue;

      // users.streakWeeks reads 0 for any unfinished current week, so use the
      // week's anchored streakBefore (the streak this week is protecting).
      const streakWeeks =
        weekly && typeof weekly.streakBefore === 'number' ? Number(weekly.streakBefore) : Number(data.streakWeeks) || 0;
      const what = atRisk.join(' + ');
      items.push({
        uid: u.id,
        token: data.expoPushToken,
        title: streakWeeks > 0 ? `🔥 ${streakWeeks}-week streak at risk` : '⏰ Your week is on the line',
        body: `Log ${what} today. Skip it and your weekly goal is out of reach.`,
        data: { type: 'streakRisk', screen: 'Activity' },
      });
    } catch (e) {
      console.warn('[streakRisk] user failed', u.id, e);
    }
  }

  return { items, evaluated: usersSnap.size };
}

module.exports = { evaluateStreakRisk, isShielded, isHibernating };

/**
 * "You've never signed a week" nudge — Monday evening only.
 *
 * The 2026-08-19 poll found ZERO people disliked hold-to-sign, but 3 of 8
 * members had never signed once and the only one who explained said "I don't
 * know what that is". So this targets discovery, not compliance: it fires only
 * for people with NO signature in the group EVER. Regulars who simply skip a
 * week are never nagged, and it can only fire while the Mon-Tue signing window
 * is actually open.
 */
async function evaluateSignNudge(db, now) {
  const weekId = core.isoWeekIdInTz(now, TZ);
  const dow = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now);
  if (dow !== 'Mon') return { items: [], weekId };

  const items = [];
  // One nudge per person per run: a member of 3 groups used to get 3 pushes.
  // The first group that qualifies names the push.
  const nudged = new Set();
  const groups = await db.collection('groups').get();
  for (const g of groups.docs) {
    try {
      const sigs = await db.collection('groups').doc(g.id).collection('signatures').get();
      const everSigned = new Set(sigs.docs.map((d) => String(d.data().uid || '')).filter(Boolean));
      const members = await db.collection('groups').doc(g.id).collection('members').get();
      if (members.size < 2) continue; // a solo group has nobody to commit to

      for (const m of members.docs) {
        if (nudged.has(m.id)) continue; // already queued from another group
        if (everSigned.has(m.id)) continue; // has signed before — leave them alone
        const uSnap = await db.doc(`users/${m.id}`).get();
        const u = uSnap.exists ? uSnap.data() : null;
        if (!u || !isExpoToken(u.expoPushToken)) continue;
        if (!prefEnabled(u, 'streakReminder')) continue;
        if (await isShielded(db, m.id, u, weekId)) continue;
        if (u.signNudgeWeekId === weekId) continue; // once per week, ever-idempotent

        nudged.add(m.id);
        items.push({
          uid: m.id,
          token: u.expoPushToken,
          title: '✍️ Sign your week',
          body: `Open ${g.data().name || 'your group'} and hold the button. It tells everyone you're in.`,
          data: { type: 'signNudge', screen: 'Today' },
        });
      }
    } catch (e) {
      console.warn('[signNudge] eval failed for group', g.id, e);
    }
  }
  return { items, weekId };
}

module.exports.evaluateSignNudge = evaluateSignNudge;

/**
 * "Yesterday's Champion" — per group, who logged the most yesterday?
 * Primary ranking: ACTUAL FP earned yesterday (day-over-day delta from the
 * users/{uid}/fpDaily ledger written by updateMmrScheduled), when every
 * candidate has both snapshots. Fallback (ledger not warm yet): distinct
 * categories logged (calories/workout/weight, 0-3), tiebreak by workout
 * minutes, then total logs. Groups where nobody logged are skipped (no spam
 * for dead days). Returns evaluation only — the caller sends pushes and
 * stamps the idempotency marker.
 */
async function evaluateDailyChampion(db, now) {
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yDay = core.yyyyMmDdInTz(yesterdayDate, TZ);
  const dayBeforeDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const bDay = core.yyyyMmDdInTz(dayBeforeDate, TZ);

  const groups = await db.collection('groups').get();
  const results = [];

  for (const g of groups.docs) {
    try {
      const gData = g.data() || {};
      if (gData.dailyChampionDate === yDay) continue; // already announced

      const membersSnap = await db.collection('groups').doc(g.id).collection('members').get();
      const memberUids = membersSnap.docs.map((d) => d.id);
      if (memberUids.length < 2) continue;

      const logsSnap = await db.collection('groups').doc(g.id).collection('logs').where('date', '==', yDay).get();
      if (logsSnap.empty) continue;

      const byUid = new Map();
      for (const l of logsSnap.docs) {
        const d = l.data() || {};
        const uid = String(d.uid || '');
        if (!uid) continue;
        const row = byUid.get(uid) || { cats: new Set(), minutes: 0, total: 0 };
        if (d.type === 'calories' || d.type === 'workout' || d.type === 'weight') row.cats.add(d.type);
        if (d.type === 'workout') row.minutes += Number(d.payload && d.payload.durationMinutes) || 0;
        row.total += 1;
        byUid.set(uid, row);
      }
      if (byUid.size === 0) continue;

      // FP deltas from the daily ledger. Only trusted when EVERY candidate has
      // both snapshots — mixing FP-ranked and category-ranked members would be
      // an apples/oranges contest.
      const fpDeltas = new Map();
      let allHaveFp = true;
      for (const uid of byUid.keys()) {
        const [ySnap, bSnap] = await Promise.all([
          db.doc(`users/${uid}/fpDaily/${yDay}`).get(),
          db.doc(`users/${uid}/fpDaily/${bDay}`).get(),
        ]);
        const yData = ySnap.exists ? ySnap.data() : null;
        const bData = bSnap.exists ? bSnap.data() : null;
        const y = yData ? Number(yData.mmr) : NaN;
        const b = bData ? Number(bData.mmr) : NaN;
        // Same-week only. Across the Sunday->Monday close the diff is last
        // week's final settlement, not yesterday's effort — on 2026-08-11 that
        // would have crowned a +118 that was entirely W32 settling up.
        const sameWeek = !!(yData && bData) && yData.weekId && yData.weekId === bData.weekId;
        if (sameWeek && Number.isFinite(y) && Number.isFinite(b)) fpDeltas.set(uid, Math.round(y - b));
        else allHaveFp = false;
      }
      // FP mode also needs a strictly positive winner — a day where everyone's
      // delta is 0/negative (e.g. Monday penalties) falls back to categories.
      const useFp = allHaveFp && [...fpDeltas.values()].some((v) => v > 0);

      const ranked = [...byUid.entries()]
        .map(([uid, r]) => ({ uid, fp: fpDeltas.get(uid) ?? 0, cats: r.cats.size, minutes: Math.round(r.minutes), total: r.total }))
        .sort((a, b) => (useFp ? b.fp - a.fp || b.cats - a.cats : b.cats - a.cats) || b.minutes - a.minutes || b.total - a.total);

      const top = ranked[0];
      const sameScore = (x, y) => (useFp ? x.fp === y.fp : x.cats === y.cats && x.minutes === y.minutes && x.total === y.total);
      const coChamp = ranked[1] && sameScore(ranked[1], top) ? ranked[1] : null;

      const nameOf = async (uid) => {
        const pub = await db.doc(`publicUsers/${uid}`).get();
        return (pub.exists && pub.data().displayName) || 'A teammate';
      };
      const championName = await nameOf(top.uid);
      const coChampName = coChamp ? await nameOf(coChamp.uid) : null;

      const line = useFp
        ? `+${top.fp} FP earned${top.minutes > 0 ? ` · ${top.minutes} min trained` : ''}`
        : `${top.cats}/3 logged${top.minutes > 0 ? ` · ${top.minutes} min trained` : ''}`;
      results.push({
        groupId: g.id,
        yDay,
        championUid: top.uid,
        championName,
        coChampUid: coChamp ? coChamp.uid : null,
        coChampName,
        line,
        memberUids,
      });
    } catch (e) {
      console.warn('[dailyChampion] group eval failed', g.id, e);
    }
  }
  return { results, yDay };
}

module.exports.evaluateDailyChampion = evaluateDailyChampion;

/**
 * Vacation-mode prompt: users who've been silent 3+ consecutive days (ending
 * today), aren't on vacation, have allowance left, and haven't been prompted
 * this week. Returns push items; the caller sends and STAMPS the
 * vacationPromptWeekId marker. Runs alongside streak risk at 18:00 ET — a
 * user should get one or the other, never both (vacation wins: if the week's
 * gone quiet, "pause it" beats "log now").
 */
const VACATION_WEEKS_PER_SEASON = 2;
const VACATION_QUIET_DAYS = 3;

async function evaluateVacationPrompt(db, now) {
  const today = core.yyyyMmDdInTz(now, TZ);
  const weekId = core.isoWeekIdInTz(now, TZ);
  const seasonId = core.seasonIdFromDate(now, TZ);
  const quietStart = core.yyyyMmDdInTz(new Date(now.getTime() - (VACATION_QUIET_DAYS - 1) * 24 * 60 * 60 * 1000), TZ);

  const usersSnap = await db.collection('users').get();
  const items = [];
  for (const u of usersSnap.docs) {
    const data = u.data() || {};
    try {
      if (!data.expoPushToken || !String(data.expoPushToken).startsWith('Expo')) continue;
      if (isHibernating(data, weekId)) continue; // already covered, don't offer vacation
      if (data.vacationPromptWeekId === weekId) continue; // already asked this week
      const used = Number(data.vacationUsed && data.vacationUsed[seasonId]) || 0;
      if (used >= VACATION_WEEKS_PER_SEASON) continue;

      // Already shielded (vacation, grace week, anchored hibernation): offering
      // vacation would only burn allowance on a week that can't hurt them.
      if (await isShielded(db, u.id, data, weekId)) continue;

      // Silent = zero logs in ANY group over the last N days (incl. today).
      const groupsSnap = await db.collection('users').doc(u.id).collection('groups').get();
      const groupIds = groupsSnap.docs.map((d) => String(d.data()?.groupId ?? d.id)).filter(Boolean);
      if (!groupIds.length) continue;
      let logged = false;
      for (const gid of groupIds) {
        const snap = await db
          .collection('groups').doc(gid).collection('logs')
          .where('uid', '==', u.id).where('date', '>=', quietStart).where('date', '<=', today)
          .limit(1).get();
        if (!snap.empty) { logged = true; break; }
      }
      if (logged) continue;

      items.push({
        uid: u.id,
        token: data.expoPushToken,
        title: '🏖️ On vacation?',
        body: "Quiet few days. Pause this week's scoring so it can't cost you FP or your streak. Anything you log still counts.",
        data: { type: 'vacationPrompt', screen: 'Today' },
      });
    } catch (e) {
      console.warn('[vacationPrompt] eval failed for', u.id, e);
    }
  }
  return { items, weekId };
}

module.exports.evaluateVacationPrompt = evaluateVacationPrompt;

/**
 * Goal-deadline nudge: an active weight goal whose target date is behind us
 * and isn't completed. The date only ever set the goal's PACE; nothing fired
 * when it passed, and the goal kept scoring at the original lbs-per-week.
 * One push, then once a week until the goal is re-planned (deadlineNudgedAt
 * on the goal doc). Lands on the Goals editor.
 */
async function evaluateGoalDeadline(db, now) {
  const today = core.yyyyMmDdInTz(now, TZ);
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const items = [];
  const stamps = [];
  const users = await db.collection('users').get();
  for (const u of users.docs) {
    const data = u.data() || {};
    if (!isExpoToken(data.expoPushToken)) continue;
    if (!prefEnabled(data, 'streakReminder')) continue;
    for (const id of ['weightLoss', 'weightGain']) {
      try {
        const gSnap = await db.doc(`users/${u.id}/goals/${id}`).get();
        const g = gSnap.exists ? gSnap.data() : null;
        if (!g || g.status !== 'active') continue;
        const end = String(g.targetEndDate || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end >= today) continue;
        const last = g.deadlineNudgedAt && g.deadlineNudgedAt.toMillis ? g.deadlineNudgedAt.toMillis() : 0;
        if (now.getTime() - last < WEEK_MS) continue;
        const from = Number(g.startWeight);
        const to = Number(g.goalWeight);
        const target = Number.isFinite(from) && Number.isFinite(to) ? `${from} → ${to} lb was due ${end.slice(5).replace('-', '/')}. ` : '';
        items.push({
          uid: u.id,
          token: data.expoPushToken,
          title: '📅 Your goal date passed',
          body: `${target}Set a new date or a new target.`,
          data: { type: 'goalDeadline', screen: 'MMRGoals' },
        });
        stamps.push(gSnap.ref);
        break; // one weight goal is active at a time; one push either way
      } catch (e) {
        console.warn('[goalDeadline] eval failed for', u.id, id, e);
      }
    }
  }
  return { items, stamps };
}

module.exports.evaluateGoalDeadline = evaluateGoalDeadline;
