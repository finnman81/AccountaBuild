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
        const need = workoutTarget - totals.workoutsDone;
        if (need > 0 && need >= daysLeft) atRisk.push('workout');
      }
      const calTarget = Number(goals.calorieDays && goals.calorieDays.targetDaysPerWeek);
      if ((goals.calorieDays?.status ?? 'active') === 'active' && Number.isFinite(calTarget)) {
        const hit = Object.keys(totals.calorieTotalsByDate).length;
        const need = calTarget - hit;
        if (need > 0 && need >= daysLeft) atRisk.push('calories');
      }
      if (!atRisk.length) continue;

      const streakWeeks = Number(data.streakWeeks) || 0;
      const what = atRisk.join(' + ');
      items.push({
        uid: u.id,
        token: data.expoPushToken,
        title: streakWeeks > 0 ? `🔥 ${streakWeeks}-week streak at risk` : '⏰ Your week is on the line',
        body: `Log ${what} today — skipping today puts your weekly goal out of reach.`,
        data: { type: 'streakRisk', screen: 'Activity' },
      });
    } catch (e) {
      console.warn('[streakRisk] user failed', u.id, e);
    }
  }

  return { items, evaluated: usersSnap.size };
}

module.exports = { evaluateStreakRisk };

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
        const y = ySnap.exists ? Number(ySnap.data().mmr) : NaN;
        const b = bSnap.exists ? Number(bSnap.data().mmr) : NaN;
        if (Number.isFinite(y) && Number.isFinite(b)) fpDeltas.set(uid, Math.round(y - b));
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
      if (data.vacationPromptWeekId === weekId) continue; // already asked this week
      const used = Number(data.vacationUsed && data.vacationUsed[seasonId]) || 0;
      if (used >= VACATION_WEEKS_PER_SEASON) continue;

      const wk = await db.doc(`users/${u.id}/weekly/${weekId}`).get();
      if (wk.exists && wk.data().vacation === true) continue; // already on vacation

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
        body: "Quiet few days — pause this week's scoring so it can't cost you FP or your streak. Anything you log still counts.",
        data: { type: 'vacationPrompt', screen: 'Today' },
      });
    } catch (e) {
      console.warn('[vacationPrompt] eval failed for', u.id, e);
    }
  }
  return { items, weekId };
}

module.exports.evaluateVacationPrompt = evaluateVacationPrompt;
