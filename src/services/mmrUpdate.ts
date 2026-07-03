import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  documentId,
} from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { RULES_VERSION, missedWeekPenalty, partialWeekPenalty, streakMultiplier } from '../mmr/constants';
import { D_calDays, D_minutes, D_workouts, D_weightGain, D_weightLoss } from '../mmr/difficulty';
import { bandForMMR, bandOrderIndex, applyRankWithDemotionRules, isStrictlyHigher, mpForMMR } from '../mmr/ranks';
import { calorieDaysHitFromTotals } from '../mmr/adherence';
import { lowerTierProgressBonus, nextShieldWeeks } from '../mmr/progression';
import { combineWeekScore, goalScore } from '../mmr/scoring';
import { DEFAULT_TZ, isoWeekIdInTz, isoWeekRangeInTz, nextIsoWeekId, seasonIdFromDate, zonedNoonUtcFromYmd } from '../mmr/time';

type GoalDoc = any;

function parseDateLocal(yyyyMmDd: string) {
  // Use midday to reduce DST edge cases.
  return new Date(`${yyyyMmDd}T12:00:00`);
}

function clamp(min: number, max: number, x: number) {
  return Math.max(min, Math.min(max, x));
}

async function getMyGlobalGoals(uid: string): Promise<Record<string, GoalDoc>> {
  const snap = await getDocs(collection(db, 'users', uid, 'goals'));
  const out: Record<string, GoalDoc> = {};
  for (const d of snap.docs) out[d.id] = d.data();
  return out;
}

async function getMyGroupIds(uid: string): Promise<string[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'groups'));
  return snap.docs
    .map((d) => String((d.data() as any)?.groupId ?? d.id))
    .filter(Boolean);
}

async function getMyWeights(uid: string): Promise<Array<{ date: string; weight: number; tsMs: number | null }>> {
  const ref = query(collection(db, 'users', uid, 'weights'), orderBy('ts', 'desc'), limit(200));
  const snap = await getDocs(ref);
  const items = snap.docs
    .map((d) => {
      const data = d.data() as any;
      const w = Number(data?.weight);
      const date = String(data?.date ?? '').trim();
      const ms = typeof data?.ts?.toMillis === 'function' ? data.ts.toMillis() : null;
      if (!Number.isFinite(w) || w <= 0 || !date) return null;
      return { date, weight: w, tsMs: ms as number | null };
    })
    .filter(Boolean) as Array<{ date: string; weight: number; tsMs: number | null }>;
  return items;
}

async function countCalorieDaysHit(uid: string, weekDates: string[]): Promise<number> {
  // Use the existing subscription-style batching strategy, but with getDocs.
  // To avoid dependency on composite indexes, we just read by doc id in 10-item chunks.
  const uniq = Array.from(new Set(weekDates.map((d) => d.trim()).filter(Boolean)));
  let hit = 0;
  for (let i = 0; i < uniq.length; i += 10) {
    const batch = uniq.slice(i, i + 10);
    // Firestore "in" query is the simplest; doc ids are the dates.
    const qref = query(collection(db, 'users', uid, 'calorieDays'), where(documentId(), 'in', batch));
    const snap = await getDocs(qref);
    for (const d of snap.docs) {
      if (Boolean((d.data() as any)?.met)) hit += 1;
    }
  }
  return hit;
}

async function getWeekWorkoutTotals(uid: string, groupIds: string[], weekStart: string, weekEnd: string) {
  let workoutsDone = 0;
  let minutesDone = 0;
  let caloriesLogged = 0;
  // Beta-friendly approach: read last N logs per group (no composite indexes), then filter client-side.
  await Promise.all(
    groupIds.map(async (groupId) => {
      const ref = query(collection(db, 'groups', groupId, 'logs'), orderBy('ts', 'desc'), limit(800));
      const snap = await getDocs(ref);
      for (const d of snap.docs) {
        const data = d.data() as any;
        if (String(data?.uid ?? '') !== uid) continue;
        const date = String(data?.date ?? '').trim();
        if (!date || date < weekStart || date > weekEnd) continue;
        const type = String(data?.type ?? '');
        if (type === 'workout') {
          workoutsDone += 1;
          const mins = Number(data?.payload?.durationMinutes);
          if (Number.isFinite(mins) && mins > 0) minutesDone += mins;
        }
        if (type === 'calories') {
          const cals = Number(data?.payload?.calories);
          if (Number.isFinite(cals) && cals > 0) caloriesLogged += cals;
        }
      }
    }),
  );
  return { workoutsDone, minutesDone, caloriesLogged };
}

async function getWeekCalorieTotalsFromLogs(
  uid: string,
  groupIds: string[],
  weekStart: string,
  weekEnd: string,
): Promise<{ totalsByDate: Record<string, number>; totalCalories: number }> {
  const totalsByDate: Record<string, number> = {};
  let totalCalories = 0;
  await Promise.all(
    groupIds.map(async (groupId) => {
      const ref = query(collection(db, 'groups', groupId, 'logs'), orderBy('ts', 'desc'), limit(800));
      const snap = await getDocs(ref);
      for (const d of snap.docs) {
        const data = d.data() as any;
        if (String(data?.uid ?? '') !== uid) continue;
        const date = String(data?.date ?? '').trim();
        if (!date || date < weekStart || date > weekEnd) continue;
        if (String(data?.type ?? '') !== 'calories') continue;
        const cals = Number(data?.payload?.calories);
        if (!Number.isFinite(cals) || cals <= 0) continue;
        totalsByDate[date] = (totalsByDate[date] ?? 0) + cals;
        totalCalories += cals;
      }
    }),
  );
  return { totalsByDate, totalCalories };
}

function pickWeeklyWeights(weights: Array<{ date: string; weight: number; tsMs: number | null }>, start: string, end: string) {
  // We want "latest weigh-in per day" (same logic as Profile chart dedupe).
  // Also treat pending timestamps (tsMs=null) as newest so same-day updates show immediately.
  const byDate: Record<string, { date: string; weight: number; tsMs: number | null }> = {};
  for (const e of weights) {
    const prev = byDate[e.date];
    const prevMs = prev?.tsMs ?? -1;
    const nextMs = e.tsMs ?? Number.MAX_SAFE_INTEGER;
    if (!prev || nextMs >= prevMs) byDate[e.date] = e;
  }
  const all = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

  const inWeek = all.filter((w) => w.date >= start && w.date <= end);
  const endOfWeek = inWeek.length ? inWeek[inWeek.length - 1]! : null;

  const beforeWeek = all.filter((w) => w.date < start);
  const startOfWeek = beforeWeek.length ? beforeWeek[beforeWeek.length - 1]! : (inWeek.length ? inWeek[0]! : null);

  // Previous week end (used for ΔW)
  const prevEndDate = parseDateLocal(start);
  prevEndDate.setDate(prevEndDate.getDate() - 1);
  const prevEnd = `${prevEndDate.getFullYear()}-${String(prevEndDate.getMonth() + 1).padStart(2, '0')}-${String(prevEndDate.getDate()).padStart(2, '0')}`;
  const prevWeekEndCandidates = all.filter((w) => w.date <= prevEnd);
  const prevWeekEnd = prevWeekEndCandidates.length ? prevWeekEndCandidates[prevWeekEndCandidates.length - 1]! : null;

  const weighInsDone = inWeek.length;

  return {
    weighInsDone,
    weightStartOfWeek: startOfWeek?.weight ?? null,
    weightEndOfWeek: endOfWeek?.weight ?? null,
    weightPrevWeekEnd: prevWeekEnd?.weight ?? null,
  };
}

function computeTweeks(startDate: string, endDate: string) {
  const a = parseDateLocal(startDate);
  const b = parseDateLocal(endDate);
  const diffDays = Math.max(0, Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)));
  return Math.max(4, Math.ceil(diffDays / 7));
}

function avg(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function rankObjFromBand(mmr: number, band: { tier: any; division?: any }) {
  const mp = mpForMMR(mmr, band as any);
  return { tier: band.tier, division: band.division ?? null, mp };
}

export async function updateGlobalMmrForCurrentWeek(uid: string) {
  const now = new Date();
  const weekId = isoWeekIdInTz(now, DEFAULT_TZ);
  const seasonId = seasonIdFromDate(now, DEFAULT_TZ);
  await updateGlobalMmrForWeek({ uid, weekId, seasonId });
}

export async function updateGlobalMmrUpToCurrentWeek(uid: string) {
  if (!db) {
    throw new Error('Firebase database not initialized');
  }
  
  const now = new Date();
  const currentWeekId = isoWeekIdInTz(now, DEFAULT_TZ);
  const currentStart = isoWeekRangeInTz(currentWeekId, DEFAULT_TZ).start;
  const prevWeekId = (() => {
    const startUtc = zonedNoonUtcFromYmd(currentStart, DEFAULT_TZ);
    const prev = new Date(startUtc);
    prev.setUTCDate(prev.getUTCDate() - 7);
    return isoWeekIdInTz(prev, DEFAULT_TZ);
  })();

  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    const userData = userSnap.exists() ? (userSnap.data() as any) : {};
    const lastWeekIdUpdated = userSnap.exists() ? (userSnap.data() as any)?.lastWeekIdUpdated : null;
    const last = typeof lastWeekIdUpdated === 'string' ? lastWeekIdUpdated : null;
    const firstWeekId = typeof userData?.firstWeekId === 'string' ? String(userData.firstWeekId) : null;

    // Important: always recompute the current week at least once (idempotent),
    // even if the user is already "up to date". This keeps the public mirror and
    // weekly summary consistent after fixes or manual data edits.
    let wk = !last
      ? currentWeekId
      : last === currentWeekId
        ? prevWeekId
        : nextIsoWeekId(last, DEFAULT_TZ);
    
    // If firstWeekId is set, don't process weeks before it (user wasn't participating yet)
    if (firstWeekId != null && wk < firstWeekId) {
      wk = firstWeekId;
    }
    
    // Safety: cap catch-up to 20 weeks.
    for (let i = 0; i < 20; i += 1) {
      const start = isoWeekRangeInTz(wk, DEFAULT_TZ).start;
      if (start > currentStart) break;
      const seasonId = seasonIdFromDate(zonedNoonUtcFromYmd(start, DEFAULT_TZ), DEFAULT_TZ);
      try {
        await updateGlobalMmrForWeek({ uid, weekId: wk, seasonId });
      } catch (weekError) {
        console.error(`[MMR Update] Error updating week ${wk}:`, weekError);
        // Continue with next week instead of failing completely
        // This allows partial updates if one week fails
      }
      if (wk === currentWeekId) break;
      wk = nextIsoWeekId(wk, DEFAULT_TZ);
    }
  } catch (error) {
    console.error('[MMR Update] Error in updateGlobalMmrUpToCurrentWeek:', error);
    throw error;
  }
}

export async function updateGlobalMmrForWeek(params: { uid: string; weekId: string; seasonId?: string }) {
  if (!db) {
    throw new Error('Firebase database not initialized');
  }
  
  const { uid, weekId } = params;
  const seasonId = params.seasonId ?? seasonIdFromDate(new Date(), DEFAULT_TZ);
  const { start, end, dates } = isoWeekRangeInTz(weekId, DEFAULT_TZ);

  // The in-progress week must not be scored as "missed" or penalized, since it
  // isn't over yet. Past weeks are always eligible for missed/penalty logic.
  const isCurrentWeek = weekId === isoWeekIdInTz(new Date(), DEFAULT_TZ);

  let goals, groupIds, weights, workoutsDone, minutesDone, calorieDaysHit, caloriesLogged;
  let calorieTotalsByDate: Record<string, number> = {};
  let totalCaloriesLogged = 0;
  let dailyCalorieGoal: number | null = null;
  
  try {
    const [goalsResult, groupIdsResult, weightsResult, userSnap] = await Promise.all([
      getMyGlobalGoals(uid),
      getMyGroupIds(uid),
      getMyWeights(uid),
      getDoc(doc(db, 'users', uid)),
    ]);
    goals = goalsResult;
    groupIds = groupIdsResult;
    weights = weightsResult;
    const userData = userSnap.exists() ? (userSnap.data() as any) : {};
    dailyCalorieGoal = typeof userData?.dailyCalorieGoal === 'number' ? Number(userData.dailyCalorieGoal) : null;
  } catch (error) {
    console.error('[MMR Update] Error fetching user data:', error);
    throw new Error(`Failed to fetch user data: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  try {
    const [workoutTotals, calorieDayHits, calorieTotals] = await Promise.all([
      getWeekWorkoutTotals(uid, groupIds, start, end),
      countCalorieDaysHit(uid, dates),
      getWeekCalorieTotalsFromLogs(uid, groupIds, start, end),
    ]);
    workoutsDone = workoutTotals.workoutsDone;
    minutesDone = workoutTotals.minutesDone;
    caloriesLogged = workoutTotals.caloriesLogged;
    calorieDaysHit = calorieDayHits;
    calorieTotalsByDate = calorieTotals.totalsByDate;
    totalCaloriesLogged = calorieTotals.totalCalories;
    const calorieDaysFromLogs = calorieDaysHitFromTotals(calorieTotalsByDate, dailyCalorieGoal);
    if (calorieDaysFromLogs > calorieDaysHit) {
      calorieDaysHit = calorieDaysFromLogs;
    }
  } catch (error) {
    console.error('[MMR Update] Error fetching week data:', error);
    throw new Error(`Failed to fetch week data: ${error instanceof Error ? error.message : String(error)}`);
  }

  const { weighInsDone, weightStartOfWeek, weightEndOfWeek, weightPrevWeekEnd } = pickWeeklyWeights(weights, start, end);

  // Active goals
  const active: Array<{ id: string; type: string; D: number; A: number; O: number; score: number }> = [];

  // Workouts goal
  if ((goals.workouts?.status ?? 'active') === 'active' && Number.isFinite(goals.workouts?.targetWorkoutsPerWeek)) {
    const t = Number(goals.workouts.targetWorkoutsPerWeek);
    const A = clamp(0, 1, workoutsDone / (t || 1));
    const D = D_workouts(t);
    const O = A;
    active.push({ id: 'workouts', type: 'workouts', D, A, O, score: goalScore(D, A, O) });
  }

  // Minutes goal
  if ((goals.minutes?.status ?? 'active') === 'active' && Number.isFinite(goals.minutes?.targetMinutesPerWeek)) {
    const t = Number(goals.minutes.targetMinutesPerWeek);
    const A = clamp(0, 1, minutesDone / (t || 1));
    const D = D_minutes(t);
    const O = A;
    active.push({ id: 'minutes', type: 'minutes', D, A, O, score: goalScore(D, A, O) });
  }

  // Calorie days goal
  if ((goals.calorieDays?.status ?? 'active') === 'active' && Number.isFinite(goals.calorieDays?.targetDaysPerWeek)) {
    const t = Number(goals.calorieDays.targetDaysPerWeek);
    const A = clamp(0, 1, calorieDaysHit / (t || 1));
    const D = D_calDays(t);
    const O = A;
    active.push({ id: 'calorieDays', type: 'calorieDays', D, A, O, score: goalScore(D, A, O) });
  }

  // Weight loss / gain (optional)
  let weightBonusRaw = 0;
  let weightGoalUpdate: { docId: string; patch: Record<string, unknown> } | null = null;

  const weightGoal = (goals.weightLoss?.status === 'active' ? goals.weightLoss : goals.weightGain?.status === 'active' ? goals.weightGain : null) as any | null;
  if (weightGoal && Number.isFinite(weightEndOfWeek) && Number.isFinite(weightPrevWeekEnd)) {
    const isLoss = weightGoal.type === 'weightLoss';
    const W0 = Number(weightGoal.startWeight);
    const Wg = Number(weightGoal.goalWeight);
    const Wt = Number(weightEndOfWeek);
    const Tweeks = computeTweeks(String(weightGoal.startDate), String(weightGoal.targetEndDate));

    if (Number.isFinite(W0) && Number.isFinite(Wg) && Number.isFinite(Wt)) {
      if (isLoss) {
        const { D, D_base, lossTarget } = D_weightLoss({ W0, Wg, Wt, Tweeks });
        const dW = Number(weightPrevWeekEnd) - Wt;
        const O = clamp(0, 1, dW / (lossTarget || 1));

        // Adherence: weigh-in + workouts + calorie days (renormalized)
        const parts: Array<{ w: number; v: number }> = [{ w: 0.2, v: clamp(0, 1, weighInsDone / 1) }];
        const wGoal = active.find((x) => x.id === 'workouts');
        const cGoal = active.find((x) => x.id === 'calorieDays');
        if (wGoal) parts.push({ w: 0.45, v: wGoal.A });
        if (cGoal) parts.push({ w: 0.35, v: cGoal.A });
        const sumW = parts.reduce((a, b) => a + b.w, 0) || 1;
        const A = parts.reduce((a, b) => a + (b.w / sumW) * b.v, 0);

        active.push({ id: 'weightLoss', type: 'weightLoss', D, A, O, score: goalScore(D, A, O) });

        const reached = Wt <= Wg;
        if (reached && !weightGoal.completionBonusAwarded) {
          weightBonusRaw = 300 * D_base;
          weightGoalUpdate = { docId: 'weightLoss', patch: { completionBonusAwarded: true, status: 'completed', completionDate: serverTimestamp() } };
        }
      } else {
        const { D, D_base, gainTarget } = D_weightGain({ W0, Wg, Wt, Tweeks });
        const dW = Wt - Number(weightPrevWeekEnd);
        const O = clamp(0, 1, dW / (gainTarget || 1));

        const parts: Array<{ w: number; v: number }> = [{ w: 0.3, v: clamp(0, 1, weighInsDone / 1) }];
        const wGoal = active.find((x) => x.id === 'workouts');
        const mGoal = active.find((x) => x.id === 'minutes');
        if (wGoal) parts.push({ w: 0.35, v: wGoal.A });
        if (mGoal) parts.push({ w: 0.35, v: mGoal.A });
        const sumW = parts.reduce((a, b) => a + b.w, 0) || 1;
        const A = parts.reduce((a, b) => a + (b.w / sumW) * b.v, 0);

        active.push({ id: 'weightGain', type: 'weightGain', D, A, O, score: goalScore(D, A, O) });

        const reached = Wt >= Wg;
        if (reached && !weightGoal.completionBonusAwarded) {
          weightBonusRaw = 300 * D_base;
          weightGoalUpdate = { docId: 'weightGain', patch: { completionBonusAwarded: true, status: 'completed', completionDate: serverTimestamp() } };
        }
      }
    }
  }

  const A_total = active.length ? avg(active.map((g) => g.A)) : 0;
  const anyActivity =
    workoutsDone > 0 ||
    minutesDone > 0 ||
    calorieDaysHit > 0 ||
    weighInsDone > 0 ||
    (Number.isFinite(caloriesLogged) && (caloriesLogged ?? 0) > 0) ||
    totalCaloriesLogged > 0;
  const completedWeek = A_total >= 0.7;
  // Don't mark current week as "missed" - it's still in progress
  // Only mark past weeks as missed if they had no activity
  const missedWeek = isCurrentWeek ? false : (!anyActivity || A_total < 0.5);
  const partialWeek = !missedWeek && !completedWeek;

  const scores = active.map((g) => g.score);
  const weekScore = combineWeekScore(scores);

  // Transaction update
  try {
    await runTransaction(db, async (tx) => {
    const userRef = doc(db, 'users', uid);
    const weeklyRef = doc(db, 'users', uid, 'weekly', weekId);
    const publicRef = doc(db, 'publicUsers', uid);

    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists() ? (userSnap.data() as any) : {};
    const weeklySnap = await tx.get(weeklyRef);
    const weeklyData = weeklySnap.exists() ? (weeklySnap.data() as any) : null;

    // Weight-goal completion bonus, gated on a read of the goal doc *inside* this
    // transaction. Because the goal doc is both read here and written below when we
    // award, Firestore serializes competing writers, so re-runs and concurrent runs
    // of the same week can no longer double-award the +300 bonus.
    let weightBonus = 0;
    if (weightGoalUpdate) {
      const goalRef = doc(db, 'users', uid, 'goals', weightGoalUpdate.docId);
      const goalSnap = await tx.get(goalRef);
      const alreadyAwarded = goalSnap.exists() && (goalSnap.data() as any)?.completionBonusAwarded === true;
      if (!alreadyAwarded) weightBonus = weightBonusRaw;
    }

    // Idempotency: if this week was already computed once, reuse the same baseline
    // so re-running doesn't stack penalties/deltas.
    // Safety: ensure mmrBefore is never negative (fixes any bad data)
    const rawMmrBefore = weeklyData && typeof weeklyData?.mmrBefore === 'number' ? Number(weeklyData.mmrBefore) : typeof userData?.mmr === 'number' ? Number(userData.mmr) : 1000;
    const mmrBefore = Math.max(0, rawMmrBefore); // Ensure never negative
    const oldBand = bandForMMR(mmrBefore);
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

    // Track first participation week: only count missed weeks from when user started
    // This prevents counting weeks before the user joined as "missed"
    const firstWeekId = typeof userData?.firstWeekId === 'string' ? String(userData.firstWeekId) : null;
    const isFirstWeek = firstWeekId == null;
    const shouldSetFirstWeek = isFirstWeek && anyActivity; // Set first week when user has activity
    
    // If this week is BEFORE firstWeekId, don't count it as missed at all
    const isWeekBeforeFirst = firstWeekId != null && weekId < firstWeekId;
    
    // Only count missed weeks from firstWeekId onward (don't penalize for weeks before user joined)
    const missedBefore =
      weeklyData && typeof weeklyData?.missedBefore === 'number'
        ? Number(weeklyData.missedBefore)
        : isFirstWeek || isWeekBeforeFirst
          ? 0 // First week ever OR week before user joined: don't count as missed
          : missedWeek
            ? Math.max(0, (typeof userData?.consecutiveMissedWeeks === 'number' ? Number(userData.consecutiveMissedWeeks) : 0) - 1)
            : 0;

    const streakAfter = completedWeek ? streakBefore + 1 : 0;
    const S = streakMultiplier(streakAfter);

    // Don't apply penalties for the current week (it's still in progress)
    // Only apply penalties for past weeks that were actually missed
    const penalty = isCurrentWeek ? 0 : (missedWeek ? missedWeekPenalty(mmrBefore) : partialWeek ? partialWeekPenalty(mmrBefore) : 0);
    
    // Small flat encouragement bonus for a completed week in the lower tiers.
    const lowerTierBonus = lowerTierProgressBonus(oldBand.tier, completedWeek);

    const bonus = weightBonus + lowerTierBonus;
    const deltaMMR = weekScore * S - penalty + bonus;
    // Ensure MMR never goes below 0 (safety check)
    const newMMR = Math.max(0, Math.round(mmrBefore + deltaMMR));

    const ranked = applyRankWithDemotionRules({ oldBand, newMMR, tierShieldWeeksRemaining: shieldBefore });
    const band = ranked.band;
    const mp = ranked.mp;
    const rankAfter = { tier: band.tier, division: band.division ?? null, mp };

    const tierPromoted = band.tier !== oldBand.tier && isStrictlyHigher(band, oldBand);

    // Don't count missed weeks for weeks before user joined
    const consecutiveMissedWeeks = isWeekBeforeFirst ? 0 : (missedWeek ? missedBefore + 1 : 0);
    // Shield: granted (2) on tier promotion, ticks down on completed weeks,
    // breaks after 2 consecutive missed weeks (see mmr/progression.ts).
    const shieldAfter = nextShieldWeeks({ shieldBefore, tierPromoted, completedWeek, consecutiveMissedWeeks });

    // Season peak tracking (current season only)
    const peak = (userData?.seasonPeak?.seasonId === seasonId ? userData.seasonPeak : null) as
      | { seasonId: string; tier: any; division?: any; mmr: number }
      | null;
    const peakMMR = typeof peak?.mmr === 'number' ? Number(peak.mmr) : mmrBefore;
    const peakBand = bandForMMR(peakMMR);
    const isPeakImproved = bandOrderIndex(band) > bandOrderIndex(peakBand) || (bandOrderIndex(band) === bandOrderIndex(peakBand) && newMMR > peakMMR);
    const nextPeak = isPeakImproved
      ? { seasonId, tier: band.tier, division: band.division ?? null, mmr: newMMR }
      : peak ?? { seasonId, tier: oldBand.tier, division: oldBand.division ?? null, mmr: mmrBefore };

    // Achievement tracking (v1)
    const maxD = active.length ? Math.max(...active.map((g) => g.D)) : 0;
    const hardModeBefore = typeof userData?.hardModeWeeks === 'number' ? Number(userData.hardModeWeeks) : 0;
    const hardModeAfter = completedWeek && maxD >= 1.6 ? hardModeBefore + 1 : 0;

    const badgesCol = collection(db, 'users', uid, 'badges');
    const tryAward = async (badgeDocId: string, data: Record<string, unknown>) => {
      const ref = doc(badgesCol, badgeDocId);
      const snap = await tx.get(ref);
      if (snap.exists()) return;
      tx.set(ref, data, { merge: true });
    };

    // Perfect Week: A_total >= 0.95
    if (completedWeek && A_total >= 0.95) {
      await tryAward(`${seasonId}-achv-perfectWeek`, {
        type: 'achievement',
        seasonId,
        achievementId: 'perfectWeek',
        title: 'Perfect Week',
        earnedAt: serverTimestamp(),
      });
    }

    // Streak Lord: 8+ completed weeks streak
    if (completedWeek && streakBefore < 8 && streakAfter >= 8) {
      await tryAward(`${seasonId}-achv-streakLord8`, {
        type: 'achievement',
        seasonId,
        achievementId: 'streakLord8',
        title: 'Streak Lord (8 weeks)',
        earnedAt: serverTimestamp(),
      });
    }

    // Hard Mode: max D >= 1.6 for 4 completed weeks
    if (hardModeBefore < 4 && hardModeAfter >= 4) {
      await tryAward(`${seasonId}-achv-hardMode4`, {
        type: 'achievement',
        seasonId,
        achievementId: 'hardMode4',
        title: 'Hard Mode (4 weeks)',
        earnedAt: serverTimestamp(),
      });
    }

    // Write weekly summary (overwrite each run; v1 beta).
    tx.set(
      weeklyRef,
      {
        weekId,
        seasonId,
        rulesVersion: RULES_VERSION,
        updatedAt: serverTimestamp(),
        dataSource: 'self_reported',

        // Raw totals
        workoutsDone,
        minutesDone: Math.round(minutesDone),
        calorieDaysHit,
        weighInsDone,
        weightStartOfWeek,
        weightEndOfWeek,
        weightPrevWeekEnd,

        // Goal breakdown
        goals: active.map((g) => ({ id: g.id, type: g.type, D: g.D, A: g.A, O: g.O, score: g.score })),

        // Summary
        A_total,
        weekScore,
        streakMultiplier: S,
        penalty,
        bonus,
        weightBonus,
        lowerTierBonus,
        deltaMMR,
        mmrBefore: Math.max(0, mmrBefore), // Safety: ensure never negative in weekly record
        mmrAfter: newMMR,
        completedWeek,
        missedWeek,

        // Baselines for idempotent recompute
        streakBefore,
        streakAfter,
        shieldBefore,
        shieldAfter,
        missedBefore,

        // Rank deltas
        rankBefore,
        rankAfter,
        mpBefore: rankBefore.mp,
        mpAfter: rankAfter.mp,
        deltaMP: rankAfter.mp - rankBefore.mp,
        promotion: bandOrderIndex(band) > bandOrderIndex(oldBand) ? { from: rankBefore, to: rankAfter } : null,
        demotion: bandOrderIndex(band) < bandOrderIndex(oldBand) ? { from: rankBefore, to: rankAfter } : null,
      },
      { merge: true },
    );

    const userUpdate: Record<string, unknown> = {
      mmr: Math.max(0, newMMR), // Safety: ensure MMR never goes negative
      rankTier: band.tier,
      rankDivision: band.division ?? null,
      mp,
      // Snapshot the rank entering this week (= last week's close) so the
      // leaderboard can show week-over-week movement arrows.
      prevMmr: mmrBefore,
      prevRankTier: oldBand.tier,
      prevRankDivision: oldBand.division ?? null,
      streakWeeks: streakAfter,
      tierShieldWeeksRemaining: shieldAfter,
      consecutiveMissedWeeks,
      currentSeasonId: seasonId,
      lastWeekIdUpdated: weekId,
      rulesVersion: RULES_VERSION,
      seasonPeak: nextPeak,
      hardModeWeeks: hardModeAfter,
      updatedAt: serverTimestamp(),
    };
    // Set firstWeekId when user first participates (has activity)
    if (shouldSetFirstWeek) {
      userUpdate.firstWeekId = weekId;
    }
    tx.set(userRef, userUpdate, { merge: true });

    tx.set(
      publicRef,
      {
        mmrPublic: Math.max(0, newMMR), // Safety: ensure MMR never goes negative
        rankTierPublic: band.tier,
        rankDivisionPublic: band.division ?? null,
        mpPublic: mp,
        // Week-over-week baseline for leaderboard movement arrows.
        prevMmrPublic: mmrBefore,
        seasonIdPublic: seasonId,
        updatedAtPublic: serverTimestamp(),
      },
      { merge: true },
    );

    // Only write the goal's completion patch when we actually awarded the bonus
    // this run, so a re-run (which reads alreadyAwarded=true) is a no-op.
    if (weightGoalUpdate && weightBonus > 0) {
      tx.set(doc(db, 'users', uid, 'goals', weightGoalUpdate.docId), weightGoalUpdate.patch, { merge: true });
    }
    });
  } catch (error) {
    console.error('[MMR Update] Transaction error:', error);
    throw new Error(`Transaction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

