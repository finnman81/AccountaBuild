/**
 * MMR core math — SERVER copy, ported near-verbatim from the client TS modules
 * (src/mmr/constants.ts, difficulty.ts, scoring.ts, ranks.ts, progression.ts,
 * adherence.ts, time.ts). Keep the two in lockstep: testing/unit/mmr_parity.test.ts
 * runs BOTH implementations over shared fixtures and fails on any divergence.
 */
const { formatInTimeZone, fromZonedTime } = require('date-fns-tz');
const { addDays } = require('date-fns');

// ---- constants.ts ----
const RULES_VERSION = 'v1';
const K = 100;
const wA = 0.7;
const wO = 0.3;
const STARTING_MMR = 1800;

function clamp(min, max, x) {
  return Math.max(min, Math.min(max, x));
}

function streakMultiplier(streakWeeks) {
  if (streakWeeks >= 12) return 1.45;
  if (streakWeeks >= 8) return 1.3;
  if (streakWeeks >= 4) return 1.15;
  if (streakWeeks >= 2) return 1.05;
  return 1.0;
}

function missedWeekPenalty(mmr) {
  return Math.max(30, 0.015 * mmr);
}

function partialWeekPenalty(mmr) {
  return Math.max(15, 0.0075 * mmr);
}

// ---- difficulty.ts ----
function D_workouts(target) {
  const table = { 1: 0.7, 2: 0.85, 3: 1.0, 4: 1.18, 5: 1.4, 6: 1.7, 7: 1.85 };
  return table[Math.round(target)] ?? 1.0;
}

function D_minutes(targetMinutes) {
  const base = Math.pow(targetMinutes / 150, 0.55);
  return clamp(0.75, 2.0, base);
}

function D_calDays(targetDays) {
  const table = { 1: 0.75, 2: 0.82, 3: 0.9, 4: 0.98, 5: 1.08, 6: 1.22, 7: 1.4 };
  return table[Math.round(targetDays)] ?? 1.0;
}

// Weight-v2 gate — see src/mmr/difficulty.ts for rationale.
const WEIGHT_V2_FROM_WEEK = '2026-W31';
function weightV2ActiveForWeek(weekId) {
  return typeof weekId === 'string' && weekId >= WEIGHT_V2_FROM_WEEK;
}
function D_weightLoss({ W0, Wg, Wt, Tweeks: TweeksIn, hIn, bmiBase }) {
  const L = W0 - Wg;
  const Tweeks = Math.max(4, TweeksIn);
  const p = clamp(0, 1, (W0 - Wt) / (L || 1));
  const h = Number(hIn);
  const useBmi = bmiBase === true && Number.isFinite(h) && h > 0;
  const D_base = useBmi
    ? 1 + 0.9 * clamp(0, 1, L / Math.max(W0 - (22 * h * h) / 703, L, 1))
    : 1 + 0.9 * Math.pow(L / W0, 0.6);
  const D_phase = 1 + 1.0 * Math.pow(p, 3.0);
  const lossTargetRaw = L / Tweeks;
  const lossTarget = clamp(0.25, 2.5, lossTargetRaw);
  const D_timeline = clamp(0.9, 1.6, Math.pow(lossTarget / 1.0, 0.35));
  const D = D_base * D_phase * D_timeline;
  return { D, D_base, lossTarget, progress: p };
}

function D_weightGain({ W0, Wg, Wt, Tweeks: TweeksIn }) {
  const G = Wg - W0;
  const Tweeks = Math.max(4, TweeksIn);
  const p = clamp(0, 1, (Wt - W0) / (G || 1));
  const D_base = 1 + 0.7 * Math.pow(G / W0, 0.6);
  const D_phase = 1 + 0.7 * Math.pow(p, 2.5);
  const gainTargetRaw = G / Tweeks;
  const gainTarget = clamp(0.1, 1.5, gainTargetRaw);
  const D_timeline = clamp(0.9, 1.5, Math.pow(gainTarget / 0.5, 0.35));
  const D = D_base * D_phase * D_timeline;
  return { D, D_base, gainTarget, progress: p };
}

// ---- scoring.ts ----
function goalScore(D, A, O) {
  return K * D * (wA * A + wO * O);
}

function combineWeekScore(scores) {
  if (!scores.length) return 0;
  const maxScore = Math.max(...scores);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  return 0.6 * maxScore + 0.4 * avgScore;
}

function coreCategoryCount(activeGoalIds) {
  const has = (ids) => activeGoalIds.some((id) => ids.includes(id));
  const workouts = has(['workouts', 'minutes']);
  const calories = has(['calorieDays']);
  const weight = has(['weightLoss', 'weightGain']);
  return (workouts ? 1 : 0) + (calories ? 1 : 0) + (weight ? 1 : 0);
}

function breadthFactor(coreCount) {
  const n = Math.max(0, Math.min(3, Math.round(coreCount)));
  const table = { 0: 0, 1: 0.8, 2: 0.92, 3: 1 };
  return table[n] ?? 1;
}

// ---- adherence.ts ----
// Two systems in one (2026-07-18): logging HABIT (any logged day = 0.5) +
// diet ADHERENCE (full 1.0 only in the band: cut/maintenance 75%-120% of
// budget; bulk >= budget). No budget: any logged day counts fully.
// Floor removed 2026-07-20 (punished sick/light days) — ceiling only.
const CAL_BAND_HIGH = 1.2;
const CAL_HABIT_CREDIT = 0.5;
// Activates at the start of this ISO week; earlier weeks keep legacy scoring
// so recomputes never restate closed weeks. Zero-padded ids compare safely.
const CAL_BAND_FROM_WEEK = '2026-W30';
function calorieBandActiveForWeek(weekId) {
  return typeof weekId === 'string' && weekId >= CAL_BAND_FROM_WEEK;
}
const LOW_CAL_THRESHOLD = 500;
const LOW_CAL_FLAG_DAYS = 5;
function countLowCalorieDays(totalsByDate) {
  return Object.values(totalsByDate).filter((t) => t > 0 && t < LOW_CAL_THRESHOLD).length;
}
function calorieDaysHitFromTotals(totalsByDate, dailyCalorieGoal, goalMode = null, useBand = true) {
  const hasBudget = dailyCalorieGoal != null && Number.isFinite(dailyCalorieGoal) && dailyCalorieGoal > 0;
  return Object.values(totalsByDate).reduce((sum, total) => {
    if (!(total > 0)) return sum;
    if (!hasBudget) return sum + 1;
    const budget = dailyCalorieGoal;
    if (!useBand) {
      if (goalMode === 'bulk' ? total < budget : total > budget) return sum;
      return sum + 1;
    }
    const full = goalMode === 'bulk'
      ? total >= budget
      : total <= CAL_BAND_HIGH * budget;
    return sum + (full ? 1 : CAL_HABIT_CREDIT);
  }, 0);
}

// ---- ranks.ts ----
const BANDS = [
  { tier: 'Iron', division: 4, min: 0, max: 249 },
  { tier: 'Iron', division: 3, min: 250, max: 499 },
  { tier: 'Iron', division: 2, min: 500, max: 749 },
  { tier: 'Iron', division: 1, min: 750, max: 999 },
  { tier: 'Bronze', division: 4, min: 1000, max: 1199 },
  { tier: 'Bronze', division: 3, min: 1200, max: 1399 },
  { tier: 'Bronze', division: 2, min: 1400, max: 1599 },
  { tier: 'Bronze', division: 1, min: 1600, max: 1799 },
  { tier: 'Silver', division: 4, min: 1800, max: 1999 },
  { tier: 'Silver', division: 3, min: 2000, max: 2199 },
  { tier: 'Silver', division: 2, min: 2200, max: 2399 },
  { tier: 'Silver', division: 1, min: 2400, max: 2599 },
  { tier: 'Gold', division: 4, min: 2600, max: 2799 },
  { tier: 'Gold', division: 3, min: 2800, max: 2999 },
  { tier: 'Gold', division: 2, min: 3000, max: 3249 },
  { tier: 'Gold', division: 1, min: 3250, max: 3499 },
  { tier: 'Platinum', division: 4, min: 3500, max: 3749 },
  { tier: 'Platinum', division: 3, min: 3750, max: 3999 },
  { tier: 'Platinum', division: 2, min: 4000, max: 4249 },
  { tier: 'Platinum', division: 1, min: 4250, max: 4499 },
  { tier: 'Diamond', division: 4, min: 4500, max: 4849 },
  { tier: 'Diamond', division: 3, min: 4850, max: 5199 },
  { tier: 'Diamond', division: 2, min: 5200, max: 5499 },
  { tier: 'Diamond', division: 1, min: 5500, max: 5799 },
  { tier: 'Master', min: 5800, max: 6999 },
  { tier: 'Challenger', min: 7000, max: 999999 },
];

function bandForMMR(mmr) {
  const x = Math.max(0, Math.round(mmr));
  return BANDS.find((b) => x >= b.min && x <= b.max) ?? BANDS[0];
}

function mpForMMR(mmr, band) {
  if (!band.division) return 0;
  const denom = Math.max(1, band.max - band.min);
  return clamp(0, 100, Math.round(100 * ((mmr - band.min) / denom)));
}

const DIV_DEMOTE_BUFFER = 40;
const TIER_DEMOTE_BUFFER = 120;

function bandIndex(b) {
  return BANDS.findIndex((x) => x.tier === b.tier && x.division === b.division && x.min === b.min && x.max === b.max);
}

function bandOrderIndex(b) {
  return bandIndex(b);
}

function isStrictlyHigher(a, b) {
  return bandIndex(a) > bandIndex(b);
}

function bandBelow(b) {
  const idx = bandIndex(b);
  if (idx <= 0) return null;
  return BANDS[idx - 1] ?? null;
}

function tierFloorBand(tier) {
  const divisionTier = BANDS.find((b) => b.tier === tier && b.division === 4);
  if (divisionTier) return divisionTier;
  return BANDS.find((b) => b.tier === tier && b.division == null) ?? bandForMMR(0);
}

function demotionThresholdForBand(oldBand) {
  const below = bandBelow(oldBand);
  const tierDemotion = below ? below.tier !== oldBand.tier : false;
  const buffer = tierDemotion ? TIER_DEMOTE_BUFFER : DIV_DEMOTE_BUFFER;
  return oldBand.min - buffer;
}

function applyRankWithDemotionRules({ oldBand, newMMR, tierShieldWeeksRemaining }) {
  const candidate = bandForMMR(newMMR);
  if (bandIndex(candidate) >= bandIndex(oldBand)) {
    return { band: candidate, mp: mpForMMR(newMMR, candidate) };
  }
  const tierDemotion = candidate.tier !== oldBand.tier;
  if (tierDemotion && tierShieldWeeksRemaining > 0) {
    const floored = tierFloorBand(oldBand.tier);
    return { band: floored, mp: mpForMMR(newMMR, floored) };
  }
  const threshold = demotionThresholdForBand(oldBand);
  if (newMMR > threshold) {
    return { band: oldBand, mp: mpForMMR(newMMR, oldBand) };
  }
  return { band: candidate, mp: mpForMMR(newMMR, candidate) };
}

// ---- progression.ts ----
function nextShieldWeeks({ shieldBefore, tierPromoted, completedWeek, consecutiveMissedWeeks }) {
  let shield = tierPromoted ? 2 : Math.max(0, shieldBefore);
  if (completedWeek && !tierPromoted && shield > 0) shield = shield - 1;
  if (consecutiveMissedWeeks >= 2) shield = 0;
  return shield;
}

const LOWER_TIERS = new Set(['Iron', 'Bronze', 'Silver', 'Gold']);
const LOWER_TIER_WEEK_BONUS = 50;

function lowerTierProgressBonus(tier, completedWeek) {
  if (!completedWeek) return 0;
  return LOWER_TIERS.has(tier) ? LOWER_TIER_WEEK_BONUS : 0;
}

// ---- time.ts ----
const DEFAULT_TZ = 'America/New_York';

function yyyyMmDdInTz(date, timeZone = DEFAULT_TZ) {
  return formatInTimeZone(date, timeZone, 'yyyy-MM-dd');
}

function isoWeekIdFromUtcNoon(dUtcNoon) {
  const d = new Date(dUtcNoon.getTime());
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4, 12, 0, 0));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function isoWeekIdInTz(date, timeZone = DEFAULT_TZ) {
  const yyyyMmDd = yyyyMmDdInTz(date, timeZone);
  const noonUtc = fromZonedTime(`${yyyyMmDd}T12:00:00`, timeZone);
  return isoWeekIdFromUtcNoon(noonUtc);
}

function seasonIdFromDate(date, timeZone = DEFAULT_TZ) {
  const yyyyMmDd = yyyyMmDdInTz(date, timeZone);
  const m = Number(yyyyMmDd.slice(5, 7));
  const y = yyyyMmDd.slice(0, 4);
  const q = m <= 3 ? 'Q1' : m <= 6 ? 'Q2' : m <= 9 ? 'Q3' : 'Q4';
  return `${y}${q}`;
}

function isoWeekDatesInTz(weekId, timeZone = DEFAULT_TZ) {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekId.trim());
  if (!m) throw new Error('Invalid weekId');
  const isoYear = Number(m[1]);
  const week = Number(m[2]);
  if (!Number.isFinite(isoYear) || !Number.isFinite(week) || week < 1 || week > 53) throw new Error('Invalid weekId');
  const jan4 = fromZonedTime(`${isoYear}-01-04T12:00:00`, timeZone);
  const day = (jan4.getUTCDay() + 6) % 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - day);
  const mon = new Date(week1Mon);
  mon.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
  const out = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(mon);
    d.setUTCDate(mon.getUTCDate() + i);
    out.push(yyyyMmDdInTz(d, timeZone));
  }
  return out;
}

function isoWeekRangeInTz(weekId, timeZone = DEFAULT_TZ) {
  const dates = isoWeekDatesInTz(weekId, timeZone);
  return { start: dates[0], end: dates[dates.length - 1], dates };
}

function nextIsoWeekId(weekId, timeZone = DEFAULT_TZ) {
  const { start } = isoWeekRangeInTz(weekId, timeZone);
  const startUtc = fromZonedTime(`${start}T12:00:00`, timeZone);
  const next = addDays(startUtc, 7);
  return isoWeekIdInTz(next, timeZone);
}

function zonedNoonUtcFromYmd(yyyyMmDd, timeZone = DEFAULT_TZ) {
  return fromZonedTime(`${yyyyMmDd}T12:00:00`, timeZone);
}

module.exports = {
  RULES_VERSION,
  K,
  wA,
  wO,
  STARTING_MMR,
  clamp,
  streakMultiplier,
  missedWeekPenalty,
  partialWeekPenalty,
  D_workouts,
  D_minutes,
  D_calDays,
  D_weightLoss,
  D_weightGain,
  goalScore,
  combineWeekScore,
  coreCategoryCount,
  breadthFactor,
  calorieDaysHitFromTotals,
  calorieBandActiveForWeek,
  weightV2ActiveForWeek,
  WEIGHT_V2_FROM_WEEK,
  countLowCalorieDays,
  LOW_CAL_THRESHOLD,
  LOW_CAL_FLAG_DAYS,
  CAL_BAND_FROM_WEEK,
  BANDS,
  bandForMMR,
  mpForMMR,
  bandOrderIndex,
  isStrictlyHigher,
  applyRankWithDemotionRules,
  demotionThresholdForBand,
  nextShieldWeeks,
  lowerTierProgressBonus,
  LOWER_TIER_WEEK_BONUS,
  DEFAULT_TZ,
  yyyyMmDdInTz,
  isoWeekIdInTz,
  seasonIdFromDate,
  isoWeekDatesInTz,
  isoWeekRangeInTz,
  nextIsoWeekId,
  zonedNoonUtcFromYmd,
};
