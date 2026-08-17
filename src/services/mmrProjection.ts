import { collection, doc, documentId, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { missedWeekPenalty, partialWeekPenalty, streakMultiplier } from '../mmr/constants';
import { D_calDays, D_minutes, D_workouts, D_weightGain, D_weightLoss, weightV2ActiveForWeek, weightV3ActiveForWeek } from '../mmr/difficulty';
import { applyRankWithDemotionRules, bandForMMR } from '../mmr/ranks';
import { lowerTierProgressBonus } from '../mmr/progression';
import { breadthFactor, combineWeekScore, coreCategoryCount, goalScore } from '../mmr/scoring';
import { calorieBandActiveForWeek, calorieDaysHitFromTotals } from '../mmr/adherence';
import { DEFAULT_TZ, isoWeekIdInTz, isoWeekRangeInTz, yyyyMmDdInTz } from '../mmr/time';
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
  /** Early in the week with nothing logged yet — neutral, not "at risk". */
  weekJustStarted: boolean;
  /**
   * Could this week ACTUALLY drop your rank? Computed from the worst case the
   * week can still produce (log nothing from here = the full missed-week
   * penalty) run through the real demotion rules, shield included.
   *
   * Missing a week and being demoted are different things: the penalty is
   * ~1.5% of FP, while demotion needs that to carry you below the band's
   * demote buffer with no shield. Treating "missed" as "demotion risk" cried
   * wolf at users who were nowhere near dropping — Jake at Gold II 3045 could
   * log nothing all week, land at 2999, and still be Gold II.
   */
  demotionPossible: boolean;
  /** Raw needs for "still winnable" messaging (0 target = category off). */
  workoutsDone: number;
  workoutsTarget: number;
  calorieDaysDone: number;
  calorieDaysTarget: number;
  /** Days remaining in the ISO week, INCLUDING today. */
  daysLeft: number;
  weekScore: number;
  streakMultiplier: number;
  penalty: number;
  /** Breadth multiplier from how many core categories are tracked. */
  breadth: number;
  /** Per-goal progress for the self-audit breakdown ("why is my score what it is"). */
  perGoal: Array<{ id: string; label: string; detail: string; paceA: number }>;
  /**
   * Marginal FP of the NEXT log of each kind, RIGHT NOW — the projection
   * re-run with one hypothetical extra entry. Answers "what's a workout worth
   * to me today". 0 = it wouldn't move this week's score (target already hit,
   * or no matching goal).
   */
  whatIf: { workout: number; calorieDay: number; weighIn: number };
  /**
   * This week scored AS IF it ended with the current inputs (weekEnd frame:
   * raw done/target, full penalty). The FP toast diffs THIS across a save so
   * a log's celebrated value matches its stated what-if worth — the now-frame
   * mmrProjected drip-feeds by design and undersells on-pace logs.
   */
  mmrWeekEndProjected: number;
  /** This week is a declared vacation week (penalty shield active). */
  onVacation: boolean;
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


  // v2 (weekly-average outcome): mean weigh-in per week — daily fluctuation
  // mostly cancels, so two single mornings no longer decide the week.
  const prevStartDate = parseDateLocal(start);
  prevStartDate.setDate(prevStartDate.getDate() - 7);
  const prevStart = `${prevStartDate.getFullYear()}-${String(prevStartDate.getMonth() + 1).padStart(2, '0')}-${String(prevStartDate.getDate()).padStart(2, '0')}`;
  const prevWeekEntries = all.filter((w) => w.date >= prevStart && w.date <= prevEnd);
  const avgThisWeek = inWeek.length ? inWeek.reduce((a, b) => a + b.weight, 0) / inWeek.length : null;
  const avgPrevWeek = prevWeekEntries.length ? prevWeekEntries.reduce((a, b) => a + b.weight, 0) / prevWeekEntries.length : null;

  // v3: best weigh-in each way, for phase difficulty (mirrors mmr-compute).
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

type ProjectionParams = {
  weekId: string;
  seasonId: string;
  mmrBefore: number;
  mpBefore: number;
  streakWeeks: number;
  tierShieldWeeksRemaining: number;
  goals: Record<string, GoalDoc>;
  workouts: Array<{ date: string; durationMinutes: number }>;
  weights: Array<{ date: string; weight: number; tsMs: number | null }>;
  /** Manual "hit my calories" toggle days (always full credit). */
  calorieDaysMet: Set<string>;
  /** Per-day logged calorie totals — feeds the band rule like the scorers. */
  calorieTotalsByDate?: Record<string, number>;
  dailyCalorieGoal?: number | null;
  goalMode?: 'cut' | 'bulk' | 'maintenance' | null;
  /** Profile height (inches) — powers weight-v2 BMI-spare difficulty. */
  heightIn?: number | null;
  /** Current week declared a vacation week — no penalty projected. */
  vacation?: boolean;
};

export function computeProjection(
  params: ProjectionParams,
  opts?: { skipWhatIf?: boolean; frame?: 'now' | 'weekEnd' },
): MmrProjection {
  const { start, end, dates } = isoWeekRangeInTz(params.weekId, DEFAULT_TZ);

  // Pace-aware achievement: judge "are you on track SO FAR", not "did you finish
  // the whole week's target already". Early in the week, hitting your per-day pace
  // counts as on-track (1 of 5 workouts on Monday is perfect pace, not a miss).
  // At week's end elapsedFrac = 1, so this collapses to actual/target.
  //
  // frame 'weekEnd' forces elapsedFrac = 1: score the week AS IF it ended with
  // these inputs (raw done/target, full penalty, unscaled delta). Used by the
  // what-if engine — the marginal value of a log must be measured against the
  // week's FINAL score, not today's pace-capped partial (a log that keeps you
  // on pace moves the final score a lot while moving today's projection ~0).
  const today = yyyyMmDdInTz(new Date(), DEFAULT_TZ);
  const daysElapsed = today > end ? 7 : Math.max(1, Math.min(7, dates.filter((d) => d <= today).length));
  const elapsedFrac = opts?.frame === 'weekEnd' ? 1 : daysElapsed / 7;
  const paceA = (actual: number, target: number) => clamp(0, 1, actual / Math.max(0.0001, (target || 1) * elapsedFrac));

  let workoutsDone = 0;
  let minutesDone = 0;
  for (const w of params.workouts) {
    if (!w.date || w.date < start || w.date > end) continue;
    workoutsDone += 1;
    minutesDone += w.durationMinutes;
  }

  // Mirror the scorers exactly: manual-toggle days are full credit; log-derived
  // days use the band rule (habit 0.5 / in-band 1.0); take the larger count.
  const toggleDays = Array.from(params.calorieDaysMet.values()).filter((d) => d >= start && d <= end).length;
  const totalsInWeek: Record<string, number> = {};
  for (const [d, v] of Object.entries(params.calorieTotalsByDate ?? {})) {
    if (d >= start && d <= end && Number(v) > 0) totalsInWeek[d] = Number(v);
  }
  const fromLogs = calorieDaysHitFromTotals(totalsInWeek, params.dailyCalorieGoal ?? null, params.goalMode ?? null, calorieBandActiveForWeek(params.weekId));
  const calorieDaysHit = Math.max(toggleDays, fromLogs);
  const { weighInsDone, weightEndOfWeek, weightPrevWeekEnd, avgThisWeek, avgPrevWeek, minThisWeek, maxThisWeek } =
    pickWeeklyWeights(params.weights, start, end);
  // Weight v2/v3 (mirrors the scorer). The projection's frame system already
  // drips current-week value via elapsedFrac, so change C needs nothing here.
  const weightV2 = weightV2ActiveForWeek(params.weekId);
  const weightV3 = weightV3ActiveForWeek(params.weekId);

  const active: Array<{ id: string; type: string; D: number; A: number; O: number; score: number }> = [];

  if ((params.goals.workouts?.status ?? 'active') === 'active' && Number.isFinite(params.goals.workouts?.targetWorkoutsPerWeek)) {
    const t = Number(params.goals.workouts.targetWorkoutsPerWeek);
    const A = paceA(workoutsDone, t);
    const D = D_workouts(t);
    const O = A;
    active.push({ id: 'workouts', type: 'workouts', D, A, O, score: goalScore(D, A, O) });
  }

  if ((params.goals.minutes?.status ?? 'active') === 'active' && Number.isFinite(params.goals.minutes?.targetMinutesPerWeek)) {
    const t = Number(params.goals.minutes.targetMinutesPerWeek);
    const A = paceA(minutesDone, t);
    const D = D_minutes(t);
    const O = A;
    active.push({ id: 'minutes', type: 'minutes', D, A, O, score: goalScore(D, A, O) });
  }

  if ((params.goals.calorieDays?.status ?? 'active') === 'active' && Number.isFinite(params.goals.calorieDays?.targetDaysPerWeek)) {
    const t = Number(params.goals.calorieDays.targetDaysPerWeek);
    const A = paceA(calorieDaysHit, t);
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
        const { D, lossTarget } = D_weightLoss({
          W0, Wg, Wt, Tweeks, hIn: params.heightIn, bmiBase: weightV2,
          WtPhase: weightV3 ? minThisWeek : null,
        });
        const dW = weightV2 && avgPrevWeek != null && avgThisWeek != null ? avgPrevWeek - avgThisWeek : Number(weightPrevWeekEnd) - Wt;
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
        const { D, gainTarget } = D_weightGain({ W0, Wg, Wt, Tweeks, WtPhase: weightV3 ? maxThisWeek : null });
        const dW = weightV2 && avgPrevWeek != null && avgThisWeek != null ? avgThisWeek - avgPrevWeek : Wt - Number(weightPrevWeekEnd);
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
  // Pace-aware risk: an empty Monday/Tuesday is "week just started", not a
  // projected miss — you judge someone on what they've done VS the day of the
  // week, and on day 1-3 with nothing logged there's nothing to judge yet.
  // weekEnd frame: the week is over by definition — "just started" grace
  // doesn't apply (what-ifs on a Monday must still price in penalty rescue).
  const weekJustStarted = opts?.frame === 'weekEnd' ? false : !anyActivity && daysElapsed <= 3;
  const missedIfEndedNow = !weekJustStarted && (!anyActivity || A_total < 0.5);
  const partialIfEndedNow = !weekJustStarted && !missedIfEndedNow && !completedIfEndedNow;

  const breadth = breadthFactor(coreCategoryCount(active.map((g) => g.id)));
  const weekScore = combineWeekScore(active.map((g) => g.score)) * breadth;
  const streakIfEndedNow = completedIfEndedNow ? params.streakWeeks + 1 : 0;
  const S = streakMultiplier(streakIfEndedNow);

  // Scale the projected penalty by how much of the week has elapsed: the real
  // scorer only penalizes at week close, so showing the FULL penalty on a
  // Tuesday overstates the risk. As the week ends (elapsedFrac -> 1) the
  // projection converges to the real close-out math.
  const basePenalty = params.vacation
    ? 0
    : missedIfEndedNow
      ? missedWeekPenalty(params.mmrBefore)
      : partialIfEndedNow
        ? partialWeekPenalty(params.mmrBefore)
        : 0;
  const penalty = basePenalty * elapsedFrac;
  
  // Small flat encouragement bonus for a completed week in the lower tiers.
  const oldBand = bandForMMR(params.mmrBefore);
  const lowerTierBonus = lowerTierProgressBonus(oldBand.tier, completedIfEndedNow);

  // Earn the projection gradually: pace-adjusted adherence means one Monday
  // workout reads as "100% on pace", which used to project the ENTIRE week's
  // score (+178 FP next to a 1/7-workouts card). Scaling the gain by
  // elapsedFrac keeps it honest — it grows day by day and converges to the
  // real close-out math as the week ends.
  const deltaMMRProjected = (weekScore * S + lowerTierBonus) * elapsedFrac - penalty;
  const mmrProjected = Math.max(0, Math.round(params.mmrBefore + deltaMMRProjected));
  const ranked = applyRankWithDemotionRules({
    oldBand,
    newMMR: mmrProjected,
    tierShieldWeeksRemaining: params.tierShieldWeeksRemaining,
  });

  const mpProjected = ranked.mp;
  const deltaMPProjected = mpProjected - params.mpBefore;

  // Worst case still reachable this week: earn nothing more, take the full
  // missed-week penalty. If even that holds the band, demotion is off the
  // table and the UI must not claim otherwise.
  const worstCaseMMR = Math.max(0, Math.round(params.mmrBefore - missedWeekPenalty(params.mmrBefore)));
  const worstBand = applyRankWithDemotionRules({
    oldBand,
    newMMR: worstCaseMMR,
    tierShieldWeeksRemaining: params.tierShieldWeeksRemaining,
  }).band;
  const demotionPossible =
    worstBand.tier !== oldBand.tier ||
    (worstBand.division ?? 0) > (oldBand.division ?? 0); // higher division number = lower rank

  // Self-audit rows: what each goal is contributing and why.
  const GOAL_LABELS: Record<string, string> = {
    workouts: 'Workouts',
    minutes: 'Active minutes',
    calorieDays: 'Calorie days',
    weightLoss: 'Weight loss',
    weightGain: 'Weight gain',
  };
  const perGoal = active.map((g) => {
    let detail = '';
    if (g.id === 'workouts') detail = `${workoutsDone} of ${Number(params.goals.workouts?.targetWorkoutsPerWeek) || 0} this week`;
    else if (g.id === 'minutes') detail = `${minutesDone} of ${Number(params.goals.minutes?.targetMinutesPerWeek) || 0} min this week`;
    else if (g.id === 'calorieDays') detail = `${calorieDaysHit} of ${Number(params.goals.calorieDays?.targetDaysPerWeek) || 0} days hit`;
    else detail = weighInsDone > 0 ? 'weighed in this week' : 'no weigh-in yet this week';
    return { id: g.id, label: GOAL_LABELS[g.id] ?? g.id, detail, paceA: Math.round(g.A * 100) / 100 };
  });

  // Marginal value of the next log of each kind: re-run this projection with
  // ONE hypothetical extra entry dated today and diff the outcome — in the
  // weekEnd frame ("what does this log add to the week's FINAL score"), NOT
  // the now frame, where the pace cap makes an on-pace user's next log look
  // worthless (+2 for someone who then banks +99 by staying on pace all day).
  // Recursion is guarded by skipWhatIf so hypothetical runs don't recurse.
  let whatIf = { workout: 0, calorieDay: 0, weighIn: 0 };
  // In a weekEnd-frame run, mmrProjected IS the end-of-week value; in a
  // now-frame run it's replaced by the dedicated weekEnd re-run below.
  let mmrWeekEndProjected = mmrProjected;
  if (!opts?.skipWhatIf) {
    const baseEnd = computeProjection(params, { skipWhatIf: true, frame: 'weekEnd' }).mmrProjected;
    mmrWeekEndProjected = baseEnd;
    const marginal = (mutated: ProjectionParams) =>
      Math.max(0, Math.round(computeProjection(mutated, { skipWhatIf: true, frame: 'weekEnd' }).mmrProjected - baseEnd));
    const weekWorkouts = params.workouts.filter((w) => w.date >= start && w.date <= end);
    const typicalMins = weekWorkouts.length
      ? Math.round(weekWorkouts.reduce((a, w) => a + w.durationMinutes, 0) / weekWorkouts.length)
      : 45;
    whatIf = {
      workout: marginal({ ...params, workouts: [...params.workouts, { date: today, durationMinutes: typicalMins }] }),
      // "Hit calories today" = a fully-logged day AT budget (full band credit).
      // Overwriting today's total also prices the half→full upgrade of an
      // under-logged day, not just empty→logged.
      calorieDay: marginal({
        ...params,
        calorieDaysMet: new Set([...params.calorieDaysMet, today]),
        calorieTotalsByDate: { ...(params.calorieTotalsByDate ?? {}), [today]: Number(params.dailyCalorieGoal) > 0 ? Number(params.dailyCalorieGoal) : 1 },
      }),
      weighIn: Number.isFinite(weightEndOfWeek) || Number.isFinite(weightPrevWeekEnd)
        ? marginal({
            ...params,
            weights: [
              ...params.weights,
              { date: today, weight: Number(weightEndOfWeek ?? weightPrevWeekEnd), tsMs: Number.MAX_SAFE_INTEGER },
            ],
          })
        : 0,
    };
  }

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
    weekJustStarted,
    demotionPossible,
    workoutsDone,
    workoutsTarget: (params.goals.workouts?.status ?? 'active') === 'active' && Number.isFinite(params.goals.workouts?.targetWorkoutsPerWeek) ? Number(params.goals.workouts.targetWorkoutsPerWeek) : 0,
    calorieDaysDone: calorieDaysHit,
    calorieDaysTarget: (params.goals.calorieDays?.status ?? 'active') === 'active' && Number.isFinite(params.goals.calorieDays?.targetDaysPerWeek) ? Number(params.goals.calorieDays.targetDaysPerWeek) : 0,
    daysLeft: dates.filter((d) => d >= today).length,
    weekScore,
    streakMultiplier: S,
    penalty,
    breadth,
    perGoal,
    whatIf,
    mmrWeekEndProjected,
    onVacation: params.vacation === true,
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
  let groupCalorieTotals: Record<string, number> = {};
  let dailyCalorieGoal: number | null = null;
  let heightIn: number | null = null;
  let goalMode: 'cut' | 'bulk' | 'maintenance' | null = null;
  let onVacation = false;

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
    
    // Manual-toggle days pass as the full-credit set; log totals go through
    // separately so the band rule can judge them (mirrors the scorers).
    const mergedCalorieDays = new Set<string>();
    for (const d of calorieDaysMet) {
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
        calorieTotalsByDate: groupCalorieTotals,
        dailyCalorieGoal,
        goalMode,
        heightIn,
        vacation: onVacation,
      }),
    );
  };

  const unsubs: Array<() => void> = [];

  // Vacation flag lives on this week's weekly doc (set by services/vacation.ts).
  unsubs.push(
    onSnapshot(
      doc(db, 'users', uid, 'weekly', weekId),
      (snap) => {
        onVacation = snap.exists() && (snap.data() as any)?.vacation === true;
        emit();
      },
      () => {
        onVacation = false;
        emit();
      },
    ),
  );

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
        dailyCalorieGoal = typeof d?.dailyCalorieGoal === 'number' ? Number(d.dailyCalorieGoal) : null;
        heightIn = Number.isFinite(Number(d?.height)) && Number(d?.height) > 0 ? Number(d.height) : null;
        goalMode = ['cut', 'bulk', 'maintenance'].includes(d?.goalMode) ? d.goalMode : null;
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
  const groupLogData = new Map<string, { workouts: Array<{ date: string; durationMinutes: number }>; calorieTotals: Record<string, number> }>();
  // Track group log subscriptions
  const groupLogUnsubs = new Map<string, () => void>();

  const rebuildGroupData = () => {
    groupWorkouts = [];
    groupCalorieTotals = {};
    for (const data of groupLogData.values()) {
      groupWorkouts.push(...data.workouts);
      for (const [d, v] of Object.entries(data.calorieTotals)) {
        groupCalorieTotals[d] = (groupCalorieTotals[d] ?? 0) + v;
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
            // Direct uid+date query (composite index) — the newest-800 window
            // dropped early-week logs in chatty groups and cost 20x the reads.
            query(collection(db, 'groups', groupId, 'logs'), where('uid', '==', uid), where('date', '>=', start), where('date', '<=', end)),
            (snap) => {
              const workouts: Array<{ date: string; durationMinutes: number }> = [];
              const calorieTotals: Record<string, number> = {};
              
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
                    calorieTotals[date] = (calorieTotals[date] ?? 0) + cals;
                  }
                }
              }
              
              groupLogData.set(groupId, { workouts, calorieTotals });
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

