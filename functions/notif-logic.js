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
