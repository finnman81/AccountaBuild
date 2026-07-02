import { collection, doc, documentId, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { missedWeekPenalty, partialWeekPenalty, streakMultiplier } from '../mmr/constants';
import { D_calDays, D_minutes, D_workouts, D_weightGain, D_weightLoss } from '../mmr/difficulty';
import { applyRankWithDemotionRules, bandForMMR } from '../mmr/ranks';
import { lowerTierProgressBonus } from '../mmr/progression';
import { combineWeekScore, goalScore } from '../mmr/scoring';
import { DEFAULT_TZ, isoWeekIdInTz, isoWeekRangeInTz } from '../mmr/time';
import type { Tier } from '../mmr/types';

type GoalDoc = any;

export type MmrProjection = {
  weekId: string;
  seasonId: string;
  mmrBefore: number;
  mmrProjected: number;
  deltaMMRProjected: number;
  mpBefore: number;
  mpProjected: number;
  deltaMPProjected: number;
  projectedTier: Tier;
  projectedDivision: 1 | 2 | 3 | 4 | null;
  A_total: number;
  completedIfEndedNow: boolean;
  missedIfEndedNow: boolean;
  weekScore: number;
  streakMultiplier: number;
  penalty: number;
};

function parseDateLocal(yyyyMmDd: string) {
  return new Date(`${yyyyMmDd}T12:00:00`);
}

function clamp(min: number, max: number, x: number) {
  return Math.max(min, Math.min(max, x));
}

function avg(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function computeTweeks(startDate: string, endDate: string) {
  const a = parseDateLocal(startDate);
  const b = parseDateLocal(endDate);
  const diffDays = Math.max(0, Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)));
  return Math.max(4, Math.ceil(diffDays / 7));
}

function pickWeeklyWeights(weights: Array<{ date: string; weight: number; tsMs: number | null }>, start: string, end: string) {
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
  const startOfWeek = beforeWeek.length ? beforeWeek[beforeWeek.length - 1]! : inWeek.length ? inWeek[0]! : null;

  const prevEndDate = parseDateLocal(start);
  prevEndDate.setDate(prevEndDate.getDate() - 1);
  const prevEnd = `${prevEndDate.getFullYear()}-${String(prevEndDate.getMonth() + 1).padStart(2, '0')}-${String(prevEndDate.getDate()).padStart(2, '0')}`;
  const prevWeekEndCandidates = all.filter((w) => w.date <= prevEnd);
  const prevWeekEnd = prevWeekEndCandidates.length ? prevWeekEndCandidates[prevWeekEndCandidates.length - 1]! : null;

  return {
    weighInsDone: inWeek.length,
    weightStartOfWeek: startOfWeek?.weight ?? null,
    weightEndOfWeek: endOfWeek?.weight ?? null,
    weightPrevWeekEnd: prevWeekEnd?.weight ?? null,
  };
}

function computeProjection(params: {
  weekId: string;
  seasonId: string;
  mmrBefore: number;
  mpBefore: number;
  streakWeeks: number;
  tierShieldWeeksRemaining: number;
  goals: Record<string, GoalDoc>;
  workouts: Array<{ date: string; durationMinutes: number }>;
  weights: Array<{ date: string; weight: number; tsMs: number | null }>;
  calorieDaysMet: Set<string>;
}): MmrProjection {
  const { start, end } = isoWeekRangeInTz(params.weekId, DEFAULT_TZ);

  let workoutsDone = 0;
  let minutesDone = 0;
  for (const w of params.workouts) {
    if (!w.date || w.date < start || w.date > end) continue;
    workoutsDone += 1;
    minutesDone += w.durationMinutes;
  }

  const calorieDaysHit = Array.from(params.calorieDaysMet.values()).filter((d) => d >= start && d <= end).length;
  const { weighInsDone, weightEndOfWeek, weightPrevWeekEnd } = pickWeeklyWeights(params.weights, start, end);

  const active: Array<{ id: string; type: string; D: number; A: number; O: number; score: number }> = [];

  if ((params.goals.workouts?.status ?? 'active') === 'active' && Number.isFinite(params.goals.workouts?.targetWorkoutsPerWeek)) {
    const t = Number(params.goals.workouts.targetWorkoutsPerWeek);
    const A = clamp(0, 1, workoutsDone / (t || 1));
    const D = D_workouts(t);
    const O = A;
    active.push({ id: 'workouts', type: 'workouts', D, A, O, score: goalScore(D, A, O) });
  }

  if ((params.goals.minutes?.status ?? 'active') === 'active' && Number.isFinite(params.goals.minutes?.targetMinutesPerWeek)) {
    const t = Number(params.goals.minutes.targetMinutesPerWeek);
    const A = clamp(0, 1, minutesDone / (t || 1));
    const D = D_minutes(t);
    const O = A;
    active.push({ id: 'minutes', type: 'minutes', D, A, O, score: goalScore(D, A, O) });
  }

  if ((params.goals.calorieDays?.status ?? 'active') === 'active' && Number.isFinite(params.goals.calorieDays?.targetDaysPerWeek)) {
    const t = Number(params.goals.calorieDays.targetDaysPerWeek);
    const A = clamp(0, 1, calorieDaysHit / (t || 1));
    const D = D_calDays(t);
    const O = A;
    active.push({ id: 'calorieDays', type: 'calorieDays', D, A, O, score: goalScore(D, A, O) });
  }

  // Weight loss / gain (projected; no completion bonus shown here).
  const weightGoal =
    (params.goals.weightLoss?.status === 'active' ? params.goals.weightLoss : params.goals.weightGain?.status === 'active' ? params.goals.weightGain : null) as any | null;
  if (weightGoal && Number.isFinite(weightEndOfWeek) && Number.isFinite(weightPrevWeekEnd)) {
    const isLoss = weightGoal.type === 'weightLoss';
    const W0 = Number(weightGoal.startWeight);
    const Wg = Number(weightGoal.goalWeight);
    const Wt = Number(weightEndOfWeek);
    const Tweeks = computeTweeks(String(weightGoal.startDate), String(weightGoal.targetEndDate));

    if (Number.isFinite(W0) && Number.isFinite(Wg) && Number.isFinite(Wt)) {
      if (isLoss) {
        const { D, lossTarget } = D_weightLoss({ W0, Wg, Wt, Tweeks });
        const dW = Number(weightPrevWeekEnd) - Wt;
        const O = clamp(0, 1, dW / (lossTarget || 1));

        const parts: Array<{ w: number; v: number }> = [{ w: 0.2, v: clamp(0, 1, weighInsDone / 1) }];
        const wGoal = active.find((x) => x.id === 'workouts');
        const cGoal = active.find((x) => x.id === 'calorieDays');
        if (wGoal) parts.push({ w: 0.45, v: wGoal.A });
        if (cGoal) parts.push({ w: 0.35, v: cGoal.A });
        const sumW = parts.reduce((a, b) => a + b.w, 0) || 1;
        const A = parts.reduce((a, b) => a + (b.w / sumW) * b.v, 0);

        active.push({ id: 'weightLoss', type: 'weightLoss', D, A, O, score: goalScore(D, A, O) });
      } else {
        const { D, gainTarget } = D_weightGain({ W0, Wg, Wt, Tweeks });
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
      }
    }
  }

  const A_total = active.length ? avg(active.map((g) => g.A)) : 0;
  const anyActivity = workoutsDone > 0 || minutesDone > 0 || calorieDaysHit > 0 || weighInsDone > 0;
  const completedIfEndedNow = A_total >= 0.7;
  const missedIfEndedNow = !anyActivity || A_total < 0.5;
  const partialIfEndedNow = !missedIfEndedNow && !completedIfEndedNow;

  const weekScore = combineWeekScore(active.map((g) => g.score));
  const streakIfEndedNow = completedIfEndedNow ? params.streakWeeks + 1 : 0;
  const S = streakMultiplier(streakIfEndedNow);

  const penalty = missedIfEndedNow ? missedWeekPenalty(params.mmrBefore) : partialIfEndedNow ? partialWeekPenalty(params.mmrBefore) : 0;
  
  // Small flat encouragement bonus for a completed week in the lower tiers.
  const oldBand = bandForMMR(params.mmrBefore);
  const lowerTierBonus = lowerTierProgressBonus(oldBand.tier, completedIfEndedNow);

  const deltaMMRProjected = weekScore * S - penalty + lowerTierBonus;
  const mmrProjected = Math.max(0, Math.round(params.mmrBefore + deltaMMRProjected));
  const ranked = applyRankWithDemotionRules({
    oldBand,
    newMMR: mmrProjected,
    tierShieldWeeksRemaining: params.tierShieldWeeksRemaining,
  });

  const mpProjected = ranked.mp;
  const deltaMPProjected = mpProjected - params.mpBefore;

  return {
    weekId: params.weekId,
    seasonId: params.seasonId,
    mmrBefore: params.mmrBefore,
    mmrProjected,
    deltaMMRProjected,
    mpBefore: params.mpBefore,
    mpProjected,
    deltaMPProjected,
    projectedTier: ranked.band.tier,
    projectedDivision: (ranked.band.division ?? null) as any,
    A_total,
    completedIfEndedNow,
    missedIfEndedNow,
    weekScore,
    streakMultiplier: S,
    penalty,
  };
}

export function subscribeMyMmrProjection(uid: string, onChange: (p: MmrProjection | null) => void) {
  const now = new Date();
  const weekId = isoWeekIdInTz(now, DEFAULT_TZ);
  const { start, end, dates } = isoWeekRangeInTz(weekId, DEFAULT_TZ);

  let userMmr: number | null = null;
  let userMp: number | null = null;
  let streakWeeks = 0;
  let tierShieldWeeksRemaining = 0;
  let seasonId = '';
  let goals: Record<string, GoalDoc> = {};
  let workouts: Array<{ date: string; durationMinutes: number }> = [];
  let weights: Array<{ date: string; weight: number; tsMs: number | null }> = [];
  let calorieDaysMet: Set<string> = new Set();
  let groupIds: string[] = [];
  let groupWorkouts: Array<{ date: string; durationMinutes: number }> = [];
  let groupCalorieDays: Set<string> = new Set();

  const emit = () => {
    if (userMmr == null || userMp == null) {
      onChange(null);
      return;
    }
    
    // Merge user workouts with group workouts (dedupe by date, prefer group logs)
    const workoutMap = new Map<string, number>();
    for (const w of workouts) {
      if (w.date >= start && w.date <= end) {
        workoutMap.set(w.date, (workoutMap.get(w.date) ?? 0) + w.durationMinutes);
      }
    }
    for (const w of groupWorkouts) {
      if (w.date >= start && w.date <= end) {
        workoutMap.set(w.date, (workoutMap.get(w.date) ?? 0) + w.durationMinutes);
      }
    }
    const mergedWorkouts = Array.from(workoutMap.entries()).map(([date, durationMinutes]) => ({
      date,
      durationMinutes,
    }));
    
    // Merge calorie days: user calorieDays + group logs
    const mergedCalorieDays = new Set<string>();
    for (const d of calorieDaysMet) {
      if (d >= start && d <= end) mergedCalorieDays.add(d);
    }
    for (const d of groupCalorieDays) {
      if (d >= start && d <= end) mergedCalorieDays.add(d);
    }
    
    onChange(
      computeProjection({
        weekId,
        seasonId,
        mmrBefore: userMmr,
        mpBefore: userMp,
        streakWeeks,
        tierShieldWeeksRemaining,
        goals,
        workouts: mergedWorkouts,
        weights,
        calorieDaysMet: mergedCalorieDays,
      }),
    );
  };

  const unsubs: Array<() => void> = [];

  unsubs.push(
    onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const d = snap.exists() ? ((snap.data() as any) ?? {}) : {};
        userMmr = typeof d?.mmr === 'number' ? Number(d.mmr) : null;
        userMp = typeof d?.mp === 'number' ? Number(d.mp) : typeof d?.lp === 'number' ? Number(d.lp) : 0; // Backward compat
        streakWeeks = typeof d?.streakWeeks === 'number' ? Number(d.streakWeeks) : 0;
        tierShieldWeeksRemaining = typeof d?.tierShieldWeeksRemaining === 'number' ? Number(d.tierShieldWeeksRemaining) : 0;
        seasonId = String(d?.currentSeasonId ?? '').trim();
        emit();
      },
      () => onChange(null),
    ),
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'users', uid, 'goals'),
      (snap) => {
        const out: Record<string, any> = {};
        for (const d of snap.docs) out[d.id] = d.data();
        goals = out;
        emit();
      },
      () => {
        goals = {};
        emit();
      },
    ),
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'workouts'), orderBy('ts', 'desc'), limit(400)),
      (snap) => {
        workouts = snap.docs
          .map((d) => {
            const data = d.data() as any;
            const date = String(data?.date ?? '').trim();
            const mins = Number(data?.durationMinutes);
            if (!date || !Number.isFinite(mins) || mins <= 0) return null;
            return { date, durationMinutes: mins };
          })
          .filter(Boolean) as Array<{ date: string; durationMinutes: number }>;
        emit();
      },
      () => {
        workouts = [];
        emit();
      },
    ),
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'weights'), orderBy('ts', 'desc'), limit(400)),
      (snap) => {
        weights = snap.docs
          .map((d) => {
            const data = d.data() as any;
            const date = String(data?.date ?? '').trim();
            const w = Number(data?.weight);
            const ms = typeof data?.ts?.toMillis === 'function' ? data.ts.toMillis() : null;
            if (!date || !Number.isFinite(w) || w <= 0) return null;
            return { date, weight: w, tsMs: ms as number | null };
          })
          .filter(Boolean) as Array<{ date: string; weight: number; tsMs: number | null }>;
        emit();
      },
      () => {
        weights = [];
        emit();
      },
    ),
  );

  // Calorie days are doc-id keyed by YYYY-MM-DD.
  // Week has 7 days; safe for `in` query.
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'calorieDays'), where(documentId(), 'in', dates)),
      (snap) => {
        const met = new Set<string>();
        for (const d of snap.docs) {
          if (Boolean((d.data() as any)?.met)) met.add(d.id);
        }
        calorieDaysMet = met;
        emit();
      },
      () => {
        calorieDaysMet = new Set();
        emit();
      },
    ),
  );

  // Track group log data per group
  const groupLogData = new Map<string, { workouts: Array<{ date: string; durationMinutes: number }>; calorieDays: Set<string> }>();
  // Track group log subscriptions
  const groupLogUnsubs = new Map<string, () => void>();

  const rebuildGroupData = () => {
    groupWorkouts = [];
    groupCalorieDays = new Set();
    for (const data of groupLogData.values()) {
      groupWorkouts.push(...data.workouts);
      for (const d of data.calorieDays) {
        groupCalorieDays.add(d);
      }
    }
    emit();
  };

  // Subscribe to user's groups to get group IDs
  unsubs.push(
    onSnapshot(
      collection(db, 'users', uid, 'groups'),
      (snap) => {
        const newGroupIds = snap.docs
          .map((d) => String((d.data() as any)?.groupId ?? d.id))
          .filter(Boolean);
        
        // Unsubscribe from groups we're no longer in
        const removedGroups = groupIds.filter((id) => !newGroupIds.includes(id));
        for (const groupId of removedGroups) {
          const unsub = groupLogUnsubs.get(groupId);
          if (unsub) {
            unsub();
            groupLogUnsubs.delete(groupId);
            groupLogData.delete(groupId);
          }
        }
        
        // Subscribe to new groups
        const addedGroups = newGroupIds.filter((id) => !groupIds.includes(id));
        for (const groupId of addedGroups) {
          const logsUnsub = onSnapshot(
            query(collection(db, 'groups', groupId, 'logs'), orderBy('ts', 'desc'), limit(800)),
            (snap) => {
              const workouts: Array<{ date: string; durationMinutes: number }> = [];
              const calorieDays = new Set<string>();
              
              for (const d of snap.docs) {
                const data = d.data() as any;
                if (String(data?.uid ?? '') !== uid) continue;
                const date = String(data?.date ?? '').trim();
                if (!date || date < start || date > end) continue;
                const type = String(data?.type ?? '');

                if (type === 'workout') {
                  const mins = Number(data?.payload?.durationMinutes);
                  if (Number.isFinite(mins) && mins > 0) {
                    workouts.push({ date, durationMinutes: mins });
                  }
                } else if (type === 'calories') {
                  const cals = Number(data?.payload?.calories);
                  if (Number.isFinite(cals) && cals > 0) {
                    calorieDays.add(date);
                  }
                }
              }
              
              groupLogData.set(groupId, { workouts, calorieDays });
              rebuildGroupData();
            },
            () => {
              groupLogData.delete(groupId);
              rebuildGroupData();
            },
          );
          groupLogUnsubs.set(groupId, logsUnsub);
        }
        
        groupIds = newGroupIds;
        rebuildGroupData();
      },
      () => {
        groupIds = [];
        groupLogUnsubs.forEach((u) => u());
        groupLogUnsubs.clear();
        groupLogData.clear();
        rebuildGroupData();
      },
    ),
  );

  return () => {
    unsubs.forEach((u) => u());
    groupLogUnsubs.forEach((u) => u());
  };
}

