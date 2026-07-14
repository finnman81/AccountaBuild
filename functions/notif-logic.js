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
 * Score: distinct categories logged (calories/workout/weight, 0-3),
 * tiebreak by workout minutes, then total logs. Groups where nobody logged
 * are skipped (no spam for dead days). Returns evaluation only — the caller
 * sends pushes and stamps the idempotency marker.
 */
async function evaluateDailyChampion(db, now) {
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yDay = core.yyyyMmDdInTz(yesterdayDate, TZ);

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

      const ranked = [...byUid.entries()]
        .map(([uid, r]) => ({ uid, cats: r.cats.size, minutes: Math.round(r.minutes), total: r.total }))
        .sort((a, b) => b.cats - a.cats || b.minutes - a.minutes || b.total - a.total);

      const top = ranked[0];
      const coChamp = ranked[1] && ranked[1].cats === top.cats && ranked[1].minutes === top.minutes && ranked[1].total === top.total ? ranked[1] : null;

      const nameOf = async (uid) => {
        const pub = await db.doc(`publicUsers/${uid}`).get();
        return (pub.exists && pub.data().displayName) || 'A teammate';
      };
      const championName = await nameOf(top.uid);
      const coChampName = coChamp ? await nameOf(coChamp.uid) : null;

      const line = `${top.cats}/3 logged${top.minutes > 0 ? ` · ${top.minutes} min trained` : ''}`;
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
