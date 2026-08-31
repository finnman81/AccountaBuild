/**
 * Server-side weekly MMR compute — admin-SDK port of the client's
 * src/services/mmrUpdate.ts (updateGlobalMmrForWeek / updateGlobalMmrUpToCurrentWeek).
 *
 * WHY: MMR previously only recomputed on each user's OWN device (Profile-screen
 * catch-up), so anyone who didn't open the app kept a frozen score forever
 * (verified in production: users logging daily stuck at 1800 while one active
 * profile-opener climbed). This module lets a scheduled Cloud Function — or the
 * scripts/mmr-recompute.js admin CLI — close weeks for EVERY user.
 *
 * Faithfulness: the math lives in ./mmr-core (parity-tested against the client
 * modules). Data plumbing mirrors the client, including the audit fixes:
 *  - F1 goalsSnapshot: each week is scored against the goals it started with.
 *  - F9 goalMode-aware calorie direction (bulk counts >= budget).
 * The transaction is idempotent the same way the client's is (weekly-doc
 * baselines: mmrBefore/streakBefore/shieldBefore/missedBefore), so client and
 * server runs can interleave safely.
 *
 * Admin-SDK note: transactions require ALL reads before ANY writes, so the
 * badge/goal reads that the client interleaves are hoisted to the top.
 */
const { FieldValue } = require('firebase-admin/firestore');
const core = require('./mmr-core');
const { celebrateGoalCompletion, celebrateTierPromotion, notifyCheckpoint } = require('./celebrations');
const { awardBadges } = require('./badges');

function parseDateLocal(yyyyMmDd) {
  return new Date(`${yyyyMmDd}T12:00:00`);
}

function computeTweeks(startDate, endDate) {
  const a = parseDateLocal(startDate);
  const b = parseDateLocal(endDate);
  const diffDays = Math.max(0, Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)));
  return Math.max(4, Math.ceil(diffDays / 7));
}

function avg(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function rankObjFromBand(mmr, band) {
  const mp = core.mpForMMR(mmr, band);
  return { tier: band.tier, division: band.division ?? null, mp };
}

function tsMs(ts) {
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
  return null;
}

async function getGoals(db, uid) {
  const snap = await db.collection('users').doc(uid).collection('goals').get();
  const out = {};
  snap.docs.forEach((d) => {
    out[d.id] = d.data();
  });
  return out;
}

async function getGroupIds(db, uid) {
  const snap = await db.collection('users').doc(uid).collection('groups').get();
  return snap.docs.map((d) => String(d.data()?.groupId ?? d.id)).filter(Boolean);
}

async function getWeights(db, uid) {
  const snap = await db.collection('users').doc(uid).collection('weights').orderBy('ts', 'desc').limit(200).get();
  return snap.docs
    .map((d) => {
      const data = d.data();
      const w = Number(data?.weight);
      const date = String(data?.date ?? '').trim();
      if (!Number.isFinite(w) || w <= 0 || !date) return null;
      return { date, weight: w, tsMs: tsMs(data?.ts) };
    })
    .filter(Boolean);
}

async function countCalorieDaysHit(db, uid, weekDates) {
  const refs = weekDates.map((d) => db.collection('users').doc(uid).collection('calorieDays').doc(d));
  const snaps = await db.getAll(...refs);
  return snaps.filter((s) => s.exists && s.data()?.met === true).length;
}

async function getWeekTotals(db, uid, groupIds, weekStart, weekEnd) {
  let workoutsDone = 0;
  let minutesDone = 0;
  // Distinct dates with at least one workout — what the goal counts from
  // WORKOUT_DAYS_FROM_WEEK on (see mmr-core).
  const workoutDates = new Set();
  const calorieTotalsByDate = {};
  await Promise.all(
    groupIds.map(async (groupId) => {
      // Direct uid+date query (composite index exists) — the old newest-1500
      // scan dropped early-week logs in chatty groups (silent FP undercount).
      const snap = await db
        .collection('groups')
        .doc(groupId)
        .collection('logs')
        .where('uid', '==', uid)
        .where('date', '>=', weekStart)
        .where('date', '<=', weekEnd)
        .get();
      snap.docs.forEach((d) => {
        const data = d.data();
        const date = String(data?.date ?? '').trim();
        if (!date) return;
        const type = String(data?.type ?? '');
        if (type === 'workout') {
          workoutsDone += 1;
          workoutDates.add(date);
          const mins = Number(data?.payload?.durationMinutes);
          if (Number.isFinite(mins) && mins > 0) minutesDone += mins;
        }
        if (type === 'calories') {
          const cals = Number(data?.payload?.calories);
          if (Number.isFinite(cals) && cals > 0) calorieTotalsByDate[date] = (calorieTotalsByDate[date] ?? 0) + cals;
        }
      });
    }),
  );
  return { workoutsDone, workoutDaysDone: workoutDates.size, minutesDone, calorieTotalsByDate };
}

function pickWeeklyWeights(weights, start, end) {
  const byDate = {};
  for (const e of weights) {
    const prev = byDate[e.date];
    const prevMs = prev?.tsMs ?? -1;
    const nextMs = e.tsMs ?? Number.MAX_SAFE_INTEGER;
    if (!prev || nextMs >= prevMs) byDate[e.date] = e;
  }
  const all = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  const inWeek = all.filter((w) => w.date >= start && w.date <= end);
  const endOfWeek = inWeek.length ? inWeek[inWeek.length - 1] : null;
  const beforeWeek = all.filter((w) => w.date < start);
  const startOfWeek = beforeWeek.length ? beforeWeek[beforeWeek.length - 1] : inWeek.length ? inWeek[0] : null;
  const prevEndDate = parseDateLocal(start);
  prevEndDate.setDate(prevEndDate.getDate() - 1);
  const prevEnd = `${prevEndDate.getFullYear()}-${String(prevEndDate.getMonth() + 1).padStart(2, '0')}-${String(prevEndDate.getDate()).padStart(2, '0')}`;
  const prevWeekEndCandidates = all.filter((w) => w.date <= prevEnd);
  const prevWeekEnd = prevWeekEndCandidates.length ? prevWeekEndCandidates[prevWeekEndCandidates.length - 1] : null;

  // v2 (weekly-average outcome): mean weigh-in per week — daily fluctuation
  // mostly cancels, so two single mornings no longer decide the week.
  const prevStartDate = parseDateLocal(start);
  prevStartDate.setDate(prevStartDate.getDate() - 7);
  const prevStart = `${prevStartDate.getFullYear()}-${String(prevStartDate.getMonth() + 1).padStart(2, '0')}-${String(prevStartDate.getDate()).padStart(2, '0')}`;
  const prevWeekEntries = all.filter((w) => w.date >= prevStart && w.date <= prevEnd);
  const avgThisWeek = inWeek.length ? inWeek.reduce((a, b) => a + b.weight, 0) / inWeek.length : null;
  const avgPrevWeek = prevWeekEntries.length ? prevWeekEntries.reduce((a, b) => a + b.weight, 0) / prevWeekEntries.length : null;

  // v3: best weigh-in of the week in each direction — phase difficulty uses
  // these so a late swing can't re-grade FP already banked (see mmr-core).
  const minThisWeek = inWeek.length ? Math.min(...inWeek.map((w) => w.weight)) : null;
  const maxThisWeek = inWeek.length ? Math.max(...inWeek.map((w) => w.weight)) : null;

  return {
    weighInsDone: inWeek.length,
    weightStartOfWeek: startOfWeek?.weight ?? null,
    weightEndOfWeek: endOfWeek?.weight ?? null,
    weightPrevWeekEnd: prevWeekEnd?.weight ?? null,
    avgThisWeek,
    avgPrevWeek,
    minThisWeek,
    maxThisWeek,
  };
}


/**
 * Best progress EVER reached, measured on weekly AVERAGES (never a single
 * weigh-in — one water-weight morning must not unlock a checkpoint rung).
 * Monotonic by construction: checkpoints ratchet and are never revoked, the
 * same principle v3 established for phase difficulty.
 *
 * Weeks whose average swings more than 12 lb from the previous week are
 * skipped as implausible — that is the fat-fingered-entry guard (prod has seen
 * a 212 lb user log the dial default of 180).
 */
function bestWeeklyAvgProgress(weights, W0, Wg, isGain) {
  const byDate = {};
  for (const e of weights) {
    const prev = byDate[e.date];
    const prevMs = prev?.tsMs ?? -1;
    const nextMs = e.tsMs ?? Number.MAX_SAFE_INTEGER;
    if (!prev || nextMs >= prevMs) byDate[e.date] = e;
  }
  const byWeek = {};
  Object.values(byDate).forEach((e) => {
    const wk = core.isoWeekIdInTz(new Date(`${e.date}T12:00:00`), core.DEFAULT_TZ);
    (byWeek[wk] = byWeek[wk] || []).push(e.weight);
  });
  const weeks = Object.keys(byWeek).sort().map((wk) => ({
    wk,
    avg: byWeek[wk].reduce((a, b) => a + b, 0) / byWeek[wk].length,
  }));
  const clean = [];
  for (const w of weeks) {
    const prev = clean[clean.length - 1];
    if (prev && Math.abs(w.avg - prev.avg) > 12) continue;
    clean.push(w);
  }
  const L = Math.abs(W0 - Wg) || 1;
  let best = 0;
  for (const w of clean) {
    const p = isGain ? (w.avg - W0) / L : (W0 - w.avg) / L;
    if (p > best) best = p;
  }
  return core.clamp(0, 1, best);
}

/**
 * Checkpoint award for THIS run: the pot-share of every rung newly unlocked.
 * The cross-week ledger lives on the goal doc (checkpointsAwarded); the
 * per-week amount is anchored on the weekly doc by the caller, so recomputes
 * re-apply rather than revoke.
 */
function checkpointDelta({ pBest, pot, alreadyAwarded }) {
  const already = Array.isArray(alreadyAwarded) ? alreadyAwarded.map(Number) : [];
  const reached = core.checkpointsReached(pBest);
  const fresh = reached.filter((t) => !already.some((a) => Math.abs(a - t) < 1e-6));
  const fp = fresh.reduce((sum, t) => sum + core.checkpointAward(pot, t), 0);
  return { fresh, reached, fp, hitFinal: fresh.some((t) => t >= 1) };
}

/**
 * Compute (and optionally apply) one user's MMR for one ISO week.
 * apply=false runs the exact computation but skips every write (dry run).
 * Returns a summary for reporting.
 */
async function computeUserWeek(db, { uid, weekId, seasonId: seasonIdIn, apply = true, now = new Date() }) {
  const seasonId = seasonIdIn ?? core.seasonIdFromDate(now, core.DEFAULT_TZ);
  const { start, end, dates } = core.isoWeekRangeInTz(weekId, core.DEFAULT_TZ);
  const isCurrentWeek = weekId === core.isoWeekIdInTz(now, core.DEFAULT_TZ);

  // ---- Gather inputs (outside the transaction, mirroring the client) ----
  const userSnapPre = await db.collection('users').doc(uid).get();
  const userPre = userSnapPre.exists ? userSnapPre.data() : {};
  const dailyCalorieGoal = typeof userPre?.dailyCalorieGoal === 'number' ? Number(userPre.dailyCalorieGoal) : null;
  const goalMode = ['cut', 'bulk', 'maintenance'].includes(userPre?.goalMode) ? userPre.goalMode : null;

  let goals = await getGoals(db, uid);
  // F1: score against the snapshot the week started with, when present.
  const weeklyPre = await db.collection('users').doc(uid).collection('weekly').doc(weekId).get();
  const snapGoals = weeklyPre.exists ? weeklyPre.data()?.goalsSnapshot : null;
  if (snapGoals && typeof snapGoals === 'object' && Object.keys(snapGoals).length > 0) {
    // Snapshot wins for ids it knows; goals ADDED mid-week join immediately
    // (mirror of the client rule — see mmrUpdate.ts).
    const merged = { ...snapGoals };
    for (const [id, g] of Object.entries(goals)) {
      if (!(id in merged)) merged[id] = g;
    }
    goals = merged;
  }

  const groupIds = await getGroupIds(db, uid);
  const weights = await getWeights(db, uid);
  const { workoutsDone, workoutDaysDone, minutesDone, calorieTotalsByDate } = await getWeekTotals(db, uid, groupIds, start, end);
  // From W37 the workouts goal is scored on DAYS TRAINED. Closed weeks keep
  // sessions, so nothing already banked can move.
  const workoutsCounted = core.workoutDaysActiveForWeek(weekId) ? workoutDaysDone : workoutsDone;
  let calorieDaysHit = await countCalorieDaysHit(db, uid, dates);
  const calorieDaysFromLogs = core.calorieDaysHitFromTotals(calorieTotalsByDate, dailyCalorieGoal, goalMode, core.calorieBandActiveForWeek(weekId));
  if (calorieDaysFromLogs > calorieDaysHit) calorieDaysHit = calorieDaysFromLogs;
  const totalCaloriesLogged = Object.values(calorieTotalsByDate).reduce((a, b) => a + b, 0);

  const { weighInsDone, weightStartOfWeek, weightEndOfWeek, weightPrevWeekEnd, avgThisWeek, avgPrevWeek, minThisWeek, maxThisWeek } =
    pickWeeklyWeights(weights, start, end);

  // Weight v2 (2026-W31) / v3 (2026-W32) gates — see src/mmr/difficulty.ts.
  const weightV2 = core.weightV2ActiveForWeek(weekId);
  const weightV3 = core.weightV3ActiveForWeek(weekId);
  const cpOn = core.checkpointsActiveForWeek(weekId);
  const wTodayEt = core.yyyyMmDdInTz(now, core.DEFAULT_TZ);
  const wElapsedFrac = isCurrentWeek ? Math.max(1, dates.filter((d) => d <= wTodayEt).length) / 7 : 1;
  const userHeightIn = Number.isFinite(Number(userPre?.height)) && Number(userPre?.height) > 0 ? Number(userPre.height) : null;

  // ---- Score goals (identical to the client) ----
  const active = [];
  if ((goals.workouts?.status ?? 'active') === 'active' && Number.isFinite(goals.workouts?.targetWorkoutsPerWeek)) {
    const t = Number(goals.workouts.targetWorkoutsPerWeek);
    const A = core.clamp(0, 1, workoutsCounted / (t || 1));
    const D = core.D_workouts(t);
    active.push({ id: 'workouts', type: 'workouts', D, A, O: A, score: core.goalScore(D, A, A) });
  }
  if ((goals.minutes?.status ?? 'active') === 'active' && Number.isFinite(goals.minutes?.targetMinutesPerWeek)) {
    const t = Number(goals.minutes.targetMinutesPerWeek);
    const A = core.clamp(0, 1, minutesDone / (t || 1));
    const D = core.D_minutes(t);
    active.push({ id: 'minutes', type: 'minutes', D, A, O: A, score: core.goalScore(D, A, A) });
  }
  if ((goals.calorieDays?.status ?? 'active') === 'active' && Number.isFinite(goals.calorieDays?.targetDaysPerWeek)) {
    const t = Number(goals.calorieDays.targetDaysPerWeek);
    const A = core.clamp(0, 1, calorieDaysHit / (t || 1));
    const D = core.D_calDays(t);
    active.push({ id: 'calorieDays', type: 'calorieDays', D, A, O: A, score: core.goalScore(D, A, A) });
  }

  let weightBonusRaw = 0;
  let weightGoalUpdate = null;
  let checkpointsHit = []; // rungs unlocked THIS run (drives the notification)
  // TRUE only when the goal actually FINISHED this run. bonusAwardedNow means
  // "some pot FP was paid", which since checkpoints includes partial rungs —
  // gating the group "hit their goal weight" celebration on it would announce
  // a false finish on someone's first 10% milestone.
  let goalCompletedNow = false;
  const weightGoal = goals.weightLoss?.status === 'active' ? goals.weightLoss : goals.weightGain?.status === 'active' ? goals.weightGain : null;
  if (weightGoal && Number.isFinite(weightEndOfWeek) && Number.isFinite(weightPrevWeekEnd)) {
    const isLoss = weightGoal.type === 'weightLoss';
    const W0 = Number(weightGoal.startWeight);
    const Wg = Number(weightGoal.goalWeight);
    const Wt = Number(weightEndOfWeek);
    const Tweeks = computeTweeks(String(weightGoal.startDate), String(weightGoal.targetEndDate));
    if (Number.isFinite(W0) && Number.isFinite(Wg) && Number.isFinite(Wt)) {
      if (isLoss) {
        const { D, D_base, lossTarget } = core.D_weightLoss({
          W0, Wg, Wt, Tweeks, hIn: userHeightIn, bmiBase: weightV2,
          WtPhase: weightV3 ? minThisWeek : null,
        });
        const dW = weightV2 && avgPrevWeek != null && avgThisWeek != null ? avgPrevWeek - avgThisWeek : Number(weightPrevWeekEnd) - Wt;
        const O = core.clamp(0, 1, dW / (lossTarget || 1)) * (weightV2 ? wElapsedFrac : 1);
        const parts = [{ w: 0.2, v: core.clamp(0, 1, weighInsDone / 1) }];
        const wGoal = active.find((x) => x.id === 'workouts');
        const cGoal = active.find((x) => x.id === 'calorieDays');
        if (wGoal) parts.push({ w: 0.45, v: wGoal.A });
        if (cGoal) parts.push({ w: 0.35, v: cGoal.A });
        const sumW = parts.reduce((a, b) => a + b.w, 0) || 1;
        const A = parts.reduce((a, b) => a + (b.w / sumW) * b.v, 0);
        active.push({ id: 'weightLoss', type: 'weightLoss', D, A, O, score: core.goalScore(D, A, O) });
        const pot = core.weightCompletionBonus({ lbs: W0 - Wg, D_base, v3: weightV3, uncapped: cpOn });
        if (cpOn) {
          // Paid across the journey: every rung newly unlocked this run.
          const cp = checkpointDelta({
            pBest: bestWeeklyAvgProgress(weights, W0, Wg, false),
            pot,
            alreadyAwarded: weightGoal.checkpointsAwarded,
          });
          if (cp.fp > 0) {
            weightBonusRaw = cp.fp;
            checkpointsHit = cp.fresh;
            goalCompletedNow = cp.hitFinal;
            weightGoalUpdate = {
              docId: 'weightLoss',
              patch: {
                checkpointsAwarded: cp.reached,
                ...(cp.hitFinal ? { completionBonusAwarded: true, status: 'completed', completionDate: FieldValue.serverTimestamp() } : {}),
              },
            };
          }
        } else {
          // Pre-W32: single lump at 100%, plausible weigh-in required.
          const plausibleLoss = Math.abs(Wt - Number(weightPrevWeekEnd)) <= 10;
          const reached = Wt <= Wg && plausibleLoss;
          if (reached && !weightGoal.completionBonusAwarded) {
            weightBonusRaw = pot;
            goalCompletedNow = true;
            weightGoalUpdate = { docId: 'weightLoss', patch: { completionBonusAwarded: true, status: 'completed', completionDate: FieldValue.serverTimestamp() } };
          }
        }
      } else {
        const { D, D_base, gainTarget } = core.D_weightGain({ W0, Wg, Wt, Tweeks, WtPhase: weightV3 ? maxThisWeek : null });
        const dW = weightV2 && avgPrevWeek != null && avgThisWeek != null ? avgThisWeek - avgPrevWeek : Wt - Number(weightPrevWeekEnd);
        const O = core.clamp(0, 1, dW / (gainTarget || 1)) * (weightV2 ? wElapsedFrac : 1);
        const parts = [{ w: 0.3, v: core.clamp(0, 1, weighInsDone / 1) }];
        const wGoal = active.find((x) => x.id === 'workouts');
        const mGoal = active.find((x) => x.id === 'minutes');
        if (wGoal) parts.push({ w: 0.35, v: wGoal.A });
        if (mGoal) parts.push({ w: 0.35, v: mGoal.A });
        const sumW = parts.reduce((a, b) => a + b.w, 0) || 1;
        const A = parts.reduce((a, b) => a + (b.w / sumW) * b.v, 0);
        active.push({ id: 'weightGain', type: 'weightGain', D, A, O, score: core.goalScore(D, A, O) });
        const pot = core.weightCompletionBonus({ lbs: Wg - W0, D_base, v3: weightV3, uncapped: cpOn });
        if (cpOn) {
          const cp = checkpointDelta({
            pBest: bestWeeklyAvgProgress(weights, W0, Wg, true),
            pot,
            alreadyAwarded: weightGoal.checkpointsAwarded,
          });
          if (cp.fp > 0) {
            weightBonusRaw = cp.fp;
            checkpointsHit = cp.fresh;
            goalCompletedNow = cp.hitFinal;
            weightGoalUpdate = {
              docId: 'weightGain',
              patch: {
                checkpointsAwarded: cp.reached,
                ...(cp.hitFinal ? { completionBonusAwarded: true, status: 'completed', completionDate: FieldValue.serverTimestamp() } : {}),
              },
            };
          }
        } else {
          const plausibleGain = Math.abs(Wt - Number(weightPrevWeekEnd)) <= 10;
          const reached = Wt >= Wg && plausibleGain;
          if (reached && !weightGoal.completionBonusAwarded) {
            weightBonusRaw = pot;
            goalCompletedNow = true;
            weightGoalUpdate = { docId: 'weightGain', patch: { completionBonusAwarded: true, status: 'completed', completionDate: FieldValue.serverTimestamp() } };
          }
        }
      }
    }
  }

  const A_total = active.length ? avg(active.map((g) => g.A)) : 0;
  const anyActivity = workoutsDone > 0 || minutesDone > 0 || calorieDaysHit > 0 || weighInsDone > 0 || totalCaloriesLogged > 0;
  const completedWeek = A_total >= 0.7;
  const missedWeek = isCurrentWeek ? false : !anyActivity || A_total < 0.5;
  const partialWeek = !missedWeek && !completedWeek;

  const scores = active.map((g) => g.score);
  const coreCategories = core.coreCategoryCount(active.map((g) => g.id));
  const breadth = core.breadthFactor(coreCategories);
  const weekScore = core.combineWeekScore(scores) * breadth;

  // ---- Transaction (all reads first — admin SDK requirement) ----
  const userRef = db.collection('users').doc(uid);
  const weeklyRef = userRef.collection('weekly').doc(weekId);
  const publicRef = db.collection('publicUsers').doc(uid);
  const goalRef = weightGoalUpdate ? userRef.collection('goals').doc(weightGoalUpdate.docId) : null;
  const badgeIds = [`${seasonId}-achv-perfectWeek`, `${seasonId}-achv-streakLord8`, `${seasonId}-achv-hardMode4`];
  const badgeRefs = badgeIds.map((id) => userRef.collection('badges').doc(id));

  const summary = await db.runTransaction(async (tx) => {
    const reads = await tx.getAll(userRef, weeklyRef, ...(goalRef ? [goalRef] : []), ...badgeRefs);
    const userSnap = reads[0];
    const weeklySnap = reads[1];
    const goalSnap = goalRef ? reads[2] : null;
    const badgeSnaps = reads.slice(goalRef ? 3 : 2);

    const userData = userSnap.exists ? userSnap.data() : {};
    const weeklyData = weeklySnap.exists ? weeklySnap.data() : null;

    // Goal-completion bonus, ANCHORED to the week that granted it — exactly
    // like mmrBefore/streakBefore above.
    //
    // The old guard ("skip if the goal is already flagged awarded") was meant
    // to stop double-awarding across concurrent runs. But a recompute rebuilds
    // the week's delta from scratch and re-applies it to the anchored
    // mmrBefore, so the guard didn't prevent a second payment — it REVOKED the
    // first one. Prod: Watto earned +100 on 2026-07-25 and the next 6h run
    // silently took it back. Re-reading the week's own stored bonus makes the
    // award idempotent instead of self-erasing.
    const priorWeightBonus = weeklyData && typeof weeklyData.weightBonus === 'number' ? Number(weeklyData.weightBonus) : 0;
    let weightBonus = priorWeightBonus > 0 ? priorWeightBonus : 0;
    if (weightBonus === 0 && weightGoalUpdate && goalSnap) {
      const alreadyAwarded = goalSnap.exists && goalSnap.data()?.completionBonusAwarded === true;
      if (!alreadyAwarded) weightBonus = weightBonusRaw;
    }

    const rawMmrBefore =
      weeklyData && typeof weeklyData?.mmrBefore === 'number'
        ? Number(weeklyData.mmrBefore)
        : typeof userData?.mmr === 'number'
          ? Number(userData.mmr)
          : core.STARTING_MMR;
    const mmrBefore = Math.max(0, rawMmrBefore);
    const oldBand = core.bandForMMR(mmrBefore);
    const rankBefore = rankObjFromBand(mmrBefore, oldBand);

    const streakBefore =
      weeklyData && typeof weeklyData?.streakBefore === 'number'
        ? Number(weeklyData.streakBefore)
        : completedWeek
          ? Math.max(0, (typeof userData?.streakWeeks === 'number' ? Number(userData.streakWeeks) : 0) - 1)
          : 0;

    const shieldBefore =
      weeklyData && typeof weeklyData?.shieldBefore === 'number'
        ? Number(weeklyData.shieldBefore)
        : typeof userData?.tierShieldWeeksRemaining === 'number'
          ? Number(userData.tierShieldWeeksRemaining)
          : 0;

    // Streak freezes — mirror of the client scorer (see mmrUpdate.ts).
    const freezeBefore =
      weeklyData && typeof weeklyData?.freezeBefore === 'number'
        ? Number(weeklyData.freezeBefore)
        : typeof userData?.streakFreezes === 'number'
          ? Number(userData.streakFreezes)
          : 0;

    const firstWeekId = typeof userData?.firstWeekId === 'string' ? String(userData.firstWeekId) : null;
    const isFirstWeek = firstWeekId == null;
    const shouldSetFirstWeek = isFirstWeek && anyActivity;
    const isWeekBeforeFirst = firstWeekId != null && weekId < firstWeekId;

    const missedBefore =
      weeklyData && typeof weeklyData?.missedBefore === 'number'
        ? Number(weeklyData.missedBefore)
        : isFirstWeek || isWeekBeforeFirst
          ? 0
          : missedWeek
            ? Math.max(0, (typeof userData?.consecutiveMissedWeeks === 'number' ? Number(userData.consecutiveMissedWeeks) : 0) - 1)
            : 0;

    // Vacation week (user-declared, capped per season): the week can't hurt —
    // no penalty, streak HELD (not incremented, not reset), no freeze spent.
    // Anything logged still scores normally, so vacation is a penalty shield,
    // never a week eraser. Mirrored in src/services/mmrUpdate.ts.
    //
    // HIBERNATION is the same shield over a DATE RANGE (deployment, injury,
    // long trip) rather than one week, granted via the setHibernation callable
    // instead of the seasonal vacation allowance. Identical scoring effect, so
    // one flag drives both branches below.
    const hib = userData?.hibernation;
    const hibernating =
      !!hib &&
      typeof hib.fromWeekId === 'string' &&
      typeof hib.untilWeekId === 'string' &&
      weekId >= hib.fromWeekId &&
      weekId <= hib.untilWeekId;
    // Grace week: the first week AFTER waking can't penalize either. Nobody
    // returns from a month away and hits five workouts in week one.
    const inGraceWeek = !!hib && typeof hib.graceWeekId === 'string' && weekId === hib.graceWeekId;
    const onVacation = weeklyData?.vacation === true || hibernating || inGraceWeek;

    // Freeze mechanics only at week CLOSE — mid-week state never consumes/earns.
    const freezeUsed = !isCurrentWeek && !completedWeek && !onVacation && streakBefore > 0 && freezeBefore > 0;
    const streakAfter = completedWeek ? streakBefore + 1 : freezeUsed || onVacation ? streakBefore : 0;
    const freezeEarned = !isCurrentWeek && completedWeek && streakAfter >= 4 && streakAfter % 4 === 0 && freezeBefore < 2;
    const freezeAfter = Math.max(0, Math.min(2, freezeBefore + (freezeEarned ? 1 : 0) - (freezeUsed ? 1 : 0)));
    const S = core.streakMultiplier(streakAfter);

    const penalty = isCurrentWeek || onVacation ? 0 : missedWeek ? core.missedWeekPenalty(mmrBefore) : partialWeek ? core.partialWeekPenalty(mmrBefore) : 0;
    const lowerTierBonus = core.lowerTierProgressBonus(oldBand.tier, completedWeek);
    const bonus = weightBonus + lowerTierBonus;
    const deltaMMR = weekScore * S - penalty + bonus;
    const newMMR = Math.max(0, Math.round(mmrBefore + deltaMMR));

    const ranked = core.applyRankWithDemotionRules({ oldBand, newMMR, tierShieldWeeksRemaining: shieldBefore });
    const band = ranked.band;
    const mp = ranked.mp;
    const rankAfter = { tier: band.tier, division: band.division ?? null, mp };
    const tierPromoted = band.tier !== oldBand.tier && core.isStrictlyHigher(band, oldBand);

    const consecutiveMissedWeeks = isWeekBeforeFirst || onVacation ? 0 : missedWeek ? missedBefore + 1 : 0;
    const shieldAfter = core.nextShieldWeeks({ shieldBefore, tierPromoted, completedWeek, consecutiveMissedWeeks });

    const peak = userData?.seasonPeak?.seasonId === seasonId ? userData.seasonPeak : null;
    const peakMMR = typeof peak?.mmr === 'number' ? Number(peak.mmr) : mmrBefore;
    const peakBand = core.bandForMMR(peakMMR);
    const isPeakImproved =
      core.bandOrderIndex(band) > core.bandOrderIndex(peakBand) ||
      (core.bandOrderIndex(band) === core.bandOrderIndex(peakBand) && newMMR > peakMMR);
    const nextPeak = isPeakImproved
      ? { seasonId, tier: band.tier, division: band.division ?? null, mmr: newMMR }
      : peak ?? { seasonId, tier: oldBand.tier, division: oldBand.division ?? null, mmr: mmrBefore };

    const maxD = active.length ? Math.max(...active.map((g) => g.D)) : 0;
    const hardModeBefore = typeof userData?.hardModeWeeks === 'number' ? Number(userData.hardModeWeeks) : 0;
    const hardModeAfter = completedWeek && maxD >= 1.6 ? hardModeBefore + 1 : 0;

    // Was this exact promotion already recorded on a previous run? Same test the
    // activity-item writer uses below — hoisted so the result can expose an
    // exactly-once "promoted THIS run" signal for the group celebration.
    const promotionAlreadyRecorded =
      weeklyData?.promotion?.to?.tier === band.tier &&
      (weeklyData?.promotion?.to?.division ?? null) === (band.division ?? null);

    const result = {
      uid,
      weekId,
      mmrBefore,
      mmrAfter: newMMR,
      deltaMMR: Math.round(deltaMMR * 10) / 10,
      weekScore: Math.round(weekScore * 10) / 10,
      penalty: Math.round(penalty * 10) / 10,
      bonus,
      A_total: Math.round(A_total * 100) / 100,
      completedWeek,
      missedWeek,
      rankBefore: `${rankBefore.tier}${rankBefore.division ?? ''}`,
      rankAfter: `${rankAfter.tier}${rankAfter.division ?? ''}`,
      activeGoals: active.map((g) => g.id),
      applied: apply,
      // True only on the run that FIRST awards the completion bonus (anchored
      // re-runs re-apply priorWeightBonus and stay false) — the exactly-once
      // signal the auto-celebration keys on.
      bonusAwardedNow: apply && weightGoalUpdate != null && weightBonus > 0 && priorWeightBonus === 0,
      goalCompletedNow: apply && goalCompletedNow && priorWeightBonus === 0,
      bonusGoalId: weightGoalUpdate ? weightGoalUpdate.docId : null,
      // Rungs unlocked on THIS run (anchored re-runs re-apply priorWeightBonus
      // and report none) — drives the personal milestone push.
      checkpointsHitNow: apply && priorWeightBonus === 0 ? checkpointsHit : [],
      checkpointFp: apply && priorWeightBonus === 0 ? weightBonusRaw : 0,
      // TIER jumps only (Silver -> Gold), never division ticks: divisions move
      // most weeks for an active user, and a pop-up that common trains everyone
      // to dismiss celebrations unread. Division changes stay a private
      // Activity-feed item. Exactly-once via the same already-recorded test the
      // activity writer uses.
      tierPromotedNow: apply && tierPromoted && !promotionAlreadyRecorded,
      newTier: band.tier,
      newDivision: band.division ?? null,
      prevTier: oldBand.tier,
      // Post-week state, exposed so the anchor repair below (and admin
      // tooling) can re-base the NEXT week's baselines without a re-read.
      streakAfter,
      freezeAfter,
      shieldAfter,
      missedAfter: consecutiveMissedWeeks,
      missedBefore,
    };

    if (!apply) return result;

    // ---- Writes (mirroring the client exactly) ----
    if (completedWeek && A_total >= 0.95 && !badgeSnaps[0].exists) {
      tx.set(badgeRefs[0], { type: 'achievement', seasonId, achievementId: 'perfectWeek', title: 'Perfect Week', earnedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    if (completedWeek && streakBefore < 8 && streakAfter >= 8 && !badgeSnaps[1].exists) {
      tx.set(badgeRefs[1], { type: 'achievement', seasonId, achievementId: 'streakLord8', title: 'Streak Lord (8 weeks)', earnedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    if (hardModeBefore < 4 && hardModeAfter >= 4 && !badgeSnaps[2].exists) {
      tx.set(badgeRefs[2], { type: 'achievement', seasonId, achievementId: 'hardMode4', title: 'Hard Mode (4 weeks)', earnedAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    if (freezeUsed && weeklyData?.freezeUsed !== true) {
      tx.set(userRef.collection('activity').doc(`${weekId}-freeze`), {
        type: 'freeze', title: '🧊 Streak freeze used', body: `Your ${streakAfter}-week streak survives — complete this week to keep it alive.`, read: false, createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    if (freezeEarned && weeklyData?.freezeEarned !== true) {
      tx.set(userRef.collection('activity').doc(`${weekId}-freezeEarned`), {
        type: 'freeze', title: '🧊 Streak freeze earned', body: `${streakAfter} straight completed weeks — a freeze is banked (${freezeAfter}/2) for when life happens.`, read: false, createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    // Rank-change activity items (same deterministic ids as the client, so
    // client + server runs can't double-write). Only written when the change
    // is NEW this run (prior weekly doc didn't record the same destination) —
    // recomputes used to rewrite createdAt so the item read "just now" forever.
    const ROMAN = ['', 'I', 'II', 'III', 'IV'];
    const rankLabel = `${band.tier}${band.division ? ` ${ROMAN[band.division]}` : ''}`;
    const sameTo = (prev) => prev && prev.to && prev.to.tier === band.tier && (prev.to.division ?? null) === (band.division ?? null);
    if (core.bandOrderIndex(band) > core.bandOrderIndex(oldBand) && !sameTo(weeklyData?.promotion)) {
      tx.set(userRef.collection('activity').doc(`${weekId}-promotion`), {
        type: 'promotion', title: '⬆ Promoted!', body: `You climbed to ${rankLabel}.`, read: false, createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else if (core.bandOrderIndex(band) < core.bandOrderIndex(oldBand) && !sameTo(weeklyData?.demotion)) {
      tx.set(userRef.collection('activity').doc(`${weekId}-demotion`), {
        type: 'demotion', title: '⬇ Rank slipped', body: `You dropped to ${rankLabel}. Log this week to climb back.`, read: false, createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    tx.set(
      weeklyRef,
      {
        weekId,
        seasonId,
        rulesVersion: core.RULES_VERSION,
        updatedAt: FieldValue.serverTimestamp(),
        dataSource: 'self_reported',
        ...(Object.keys(goals).length === 0 || (weeklyData?.goalsSnapshot && Object.keys(weeklyData?.goalsSnapshot).length >= Object.keys(goals).length) ? {} : { goalsSnapshot: goals }),
        workoutsDone,
        workoutDaysDone,
        minutesDone: Math.round(minutesDone),
        calorieDaysHit,
        weighInsDone,
        weightStartOfWeek,
        weightEndOfWeek,
        weightPrevWeekEnd,
        goals: active.map((g) => ({ id: g.id, type: g.type, D: g.D, A: g.A, O: g.O, score: g.score })),
        A_total,
        weekScore,
        breadthFactor: breadth,
        coreCategories,
        streakMultiplier: S,
        penalty,
        bonus,
        weightBonus,
        lowerTierBonus,
        deltaMMR,
        mmrBefore: Math.max(0, mmrBefore),
        mmrAfter: newMMR,
        completedWeek,
        missedWeek,
        goalBreakdown: active.map((g) => ({
          id: g.id,
          A: Math.round(g.A * 100) / 100,
          D: Math.round(g.D * 100) / 100,
          score: Math.round(g.score * 10) / 10,
          done:
            g.id === 'workouts' ? workoutsCounted
            : g.id === 'minutes' ? minutesDone
            : g.id === 'calorieDays' ? Math.round(calorieDaysHit * 10) / 10
            : weighInsDone,
          target:
            g.id === 'workouts' ? Number(goals.workouts && goals.workouts.targetWorkoutsPerWeek) || 0
            : g.id === 'minutes' ? Number(goals.minutes && goals.minutes.targetMinutesPerWeek) || 0
            : g.id === 'calorieDays' ? Number(goals.calorieDays && goals.calorieDays.targetDaysPerWeek) || 0
            : 1,
        })),
        lowCalorieDays: core.countLowCalorieDays(calorieTotalsByDate),
        lowCalorieFlag: core.countLowCalorieDays(calorieTotalsByDate) > core.LOW_CAL_FLAG_DAYS,
        streakBefore,
        streakAfter,
        freezeBefore,
        freezeAfter,
        freezeUsed,
        freezeEarned,
        shieldBefore,
        shieldAfter,
        missedBefore,
        rankBefore,
        rankAfter,
        mpBefore: rankBefore.mp,
        mpAfter: rankAfter.mp,
        deltaMP: rankAfter.mp - rankBefore.mp,
        promotion: core.bandOrderIndex(band) > core.bandOrderIndex(oldBand) ? { from: rankBefore, to: rankAfter } : null,
        demotion: core.bandOrderIndex(band) < core.bandOrderIndex(oldBand) ? { from: rankBefore, to: rankAfter } : null,
      },
      { merge: true },
    );

    const userUpdate = {
      mmr: Math.max(0, newMMR),
      rankTier: band.tier,
      rankDivision: band.division ?? null,
      mp,
      prevMmr: mmrBefore,
      prevRankTier: oldBand.tier,
      prevRankDivision: oldBand.division ?? null,
      streakWeeks: streakAfter,
      streakFreezes: freezeAfter,
      tierShieldWeeksRemaining: shieldAfter,
      consecutiveMissedWeeks,
      currentSeasonId: seasonId,
      lastWeekIdUpdated: weekId,
      rulesVersion: core.RULES_VERSION,
      seasonPeak: nextPeak,
      hardModeWeeks: hardModeAfter,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (shouldSetFirstWeek) userUpdate.firstWeekId = weekId;
    tx.set(userRef, userUpdate, { merge: true });

    tx.set(
      publicRef,
      {
        mmrPublic: Math.max(0, newMMR),
        rankTierPublic: band.tier,
        rankDivisionPublic: band.division ?? null,
        mpPublic: mp,
        prevMmrPublic: mmrBefore,
        seasonIdPublic: seasonId,
        updatedAtPublic: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // Public weekly mirror: teammates can render each other's FP history
    // (users/{uid}/weekly is owner-private; this is the shareable subset).
    tx.set(
      publicRef.collection('weeklyPublic').doc(weekId),
      {
        weekId,
        seasonId,
        mmrAfter: newMMR,
        deltaMMR,
        tier: band.tier,
        division: band.division ?? null,
        completedWeek,
        workoutsDone,
        workoutDaysDone,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (weightGoalUpdate && weightBonus > 0 && goalRef) {
      tx.set(goalRef, weightGoalUpdate.patch, { merge: true });
    }

    return result;
  });

  // Auto-celebration: exactly-once on the run that first awarded a goal's
  // completion bonus. Queues the group pop-up + pushes teammates; never
  // allowed to fail scoring (module catches internally).
  if (summary && Array.isArray(summary.checkpointsHitNow) && summary.checkpointsHitNow.length) {
    // Personal only. The GROUP pop-up stays exclusive to 100% (below) — five
    // group celebrations per goal per member would train everyone to dismiss
    // them, cheapening the finish.
    const partial = summary.checkpointsHitNow.filter((t) => t < 1);
    if (partial.length) {
      await notifyCheckpoint(db, {
        uid,
        goalId: summary.bonusGoalId,
        goal: goals[summary.bonusGoalId] ?? null,
        pct: Math.max(...partial),
        fp: summary.checkpointFp,
      });
    }
  }
  // New-badge sweep + live badgesPublic mirror. Conditions are monotonic
  // within a week, create() dedupes, and the tier/goal flags are the same
  // exactly-once signals the celebrations use.
  if (apply && summary && !summary.error) {
    await awardBadges(db, uid, {
      seasonId,
      summary,
      minutesDone,
      completedWeek,
      missedBefore: summary.missedBefore,
    });
  }

  if (summary && summary.goalCompletedNow && summary.bonusGoalId) {
    await celebrateGoalCompletion(db, { uid, goalId: summary.bonusGoalId, goal: goals[summary.bonusGoalId] ?? null, now });
  }
  if (summary && summary.tierPromotedNow) {
    await celebrateTierPromotion(db, {
      uid, weekId, now,
      prevTier: summary.prevTier,
      newTier: summary.newTier,
      newDivision: summary.newDivision,
    });
  }

  // Self-healing anchor chain: next week's doc may have been created BEFORE
  // this week closed (Monday-morning race between client catch-up and this
  // compute), freezing stale baselines — seen in prod as Regmong's missed-week
  // penalty never carrying forward (+30 phantom FP) and Watto's streak
  // anchoring at 0. After closing week N, re-base week N+1's anchors onto N's
  // actual outputs. Mirrored in src/services/mmrUpdate.ts.
  if (apply && !isCurrentWeek && summary && typeof summary.mmrAfter === 'number') {
    try {
      const nextId = core.nextIsoWeekId(weekId, core.DEFAULT_TZ);
      const nextRef = db.collection('users').doc(uid).collection('weekly').doc(nextId);
      const nextSnap = await nextRef.get();
      if (nextSnap.exists) {
        const d = nextSnap.data() || {};
        const want = {
          mmrBefore: summary.mmrAfter,
          streakBefore: summary.streakAfter,
          freezeBefore: summary.freezeAfter,
          shieldBefore: summary.shieldAfter,
          missedBefore: summary.missedAfter,
        };
        if (Object.entries(want).some(([k, v]) => d[k] !== v)) {
          await nextRef.set(want, { merge: true });
          console.log(`[mmr-compute] repaired stale anchors on ${uid}/weekly/${nextId}`);
        }
      }
    } catch (e) {
      console.warn('[mmr-compute] anchor repair failed for', uid, weekId, e);
    }
  }

  return summary;
}

/**
 * Catch a user up to the current ISO week (same walk as the client's
 * updateGlobalMmrUpToCurrentWeek, capped at 20 weeks). Returns per-week summaries.
 */
async function computeUserUpToCurrentWeek(db, { uid, apply = true, now = new Date() }) {
  const currentWeekId = core.isoWeekIdInTz(now, core.DEFAULT_TZ);
  const currentStart = core.isoWeekRangeInTz(currentWeekId, core.DEFAULT_TZ).start;
  const prevWeekId = (() => {
    const startUtc = core.zonedNoonUtcFromYmd(currentStart, core.DEFAULT_TZ);
    const prev = new Date(startUtc);
    prev.setUTCDate(prev.getUTCDate() - 7);
    return core.isoWeekIdInTz(prev, core.DEFAULT_TZ);
  })();

  const userSnap = await db.collection('users').doc(uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const last = typeof userData?.lastWeekIdUpdated === 'string' ? userData.lastWeekIdUpdated : null;
  const firstWeekId = typeof userData?.firstWeekId === 'string' ? String(userData.firstWeekId) : null;

  let wk = !last ? currentWeekId : last === currentWeekId ? prevWeekId : core.nextIsoWeekId(last, core.DEFAULT_TZ);
  if (firstWeekId != null && wk < firstWeekId) wk = firstWeekId;

  const results = [];
  for (let i = 0; i < 20; i += 1) {
    const start = core.isoWeekRangeInTz(wk, core.DEFAULT_TZ).start;
    if (start > currentStart) break;
    const seasonId = core.seasonIdFromDate(core.zonedNoonUtcFromYmd(start, core.DEFAULT_TZ), core.DEFAULT_TZ);
    try {
      results.push(await computeUserWeek(db, { uid, weekId: wk, seasonId, apply, now }));
    } catch (e) {
      results.push({ uid, weekId: wk, error: String(e?.message ?? e) });
    }
    if (wk === currentWeekId) break;
    wk = core.nextIsoWeekId(wk, core.DEFAULT_TZ);
  }
  return results;
}

module.exports = { computeUserWeek, computeUserUpToCurrentWeek, getGoals, getGroupIds, getWeekTotals, getWeights, bestWeeklyAvgProgress, checkpointDelta };
