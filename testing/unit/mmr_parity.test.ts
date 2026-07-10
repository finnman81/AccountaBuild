/**
 * Parity: the server MMR math (functions/mmr-core.js, plain JS for the
 * scheduled Cloud Function + admin scripts) must produce IDENTICAL results to
 * the client TS modules it was ported from. Any drift between the two
 * implementations fails here.
 */
import * as constants from '../../src/mmr/constants';
import * as difficulty from '../../src/mmr/difficulty';
import * as scoring from '../../src/mmr/scoring';
import * as ranks from '../../src/mmr/ranks';
import * as progression from '../../src/mmr/progression';
import { calorieDaysHitFromTotals } from '../../src/mmr/adherence';
import { isoWeekIdInTz, isoWeekRangeInTz, nextIsoWeekId, seasonIdFromDate, DEFAULT_TZ } from '../../src/mmr/time';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const server = require('../../functions/mmr-core');

describe('MMR parity: client TS vs server JS', () => {
  test('bands: identical mapping across the whole MMR range', () => {
    for (let mmr = 0; mmr <= 8000; mmr += 25) {
      const c = ranks.bandForMMR(mmr);
      const s = server.bandForMMR(mmr);
      expect(`${s.tier}|${s.division ?? ''}|${s.min}|${s.max}`).toBe(`${c.tier}|${c.division ?? ''}|${c.min}|${c.max}`);
      expect(server.mpForMMR(mmr, s)).toBe(ranks.mpForMMR(mmr, c));
    }
  });

  test('demotion rules: hysteresis, shield, tier drop', () => {
    const cases = [
      { oldMMR: 1850, newMMR: 2050, shield: 0 }, // promotion
      { oldMMR: 1850, newMMR: 1790, shield: 0 }, // within hysteresis buffer -> hold
      { oldMMR: 1850, newMMR: 1600, shield: 0 }, // real drop
      { oldMMR: 1850, newMMR: 1500, shield: 1 }, // tier drop blocked by shield
      { oldMMR: 2650, newMMR: 2560, shield: 0 }, // division hysteresis at Gold IV
    ];
    for (const k of cases) {
      const cOld = ranks.bandForMMR(k.oldMMR);
      const sOld = server.bandForMMR(k.oldMMR);
      const c = ranks.applyRankWithDemotionRules({ oldBand: cOld, newMMR: k.newMMR, tierShieldWeeksRemaining: k.shield });
      const s = server.applyRankWithDemotionRules({ oldBand: sOld, newMMR: k.newMMR, tierShieldWeeksRemaining: k.shield });
      expect(`${s.band.tier}|${s.band.division ?? ''}|${s.mp}`).toBe(`${c.band.tier}|${c.band.division ?? ''}|${c.mp}`);
    }
  });

  test('scoring: goalScore / combineWeekScore / breadth / categories', () => {
    expect(server.goalScore(1.2, 0.8, 0.5)).toBeCloseTo(scoring.goalScore(1.2, 0.8, 0.5), 10);
    expect(server.combineWeekScore([10, 20, 30])).toBeCloseTo(scoring.combineWeekScore([10, 20, 30]), 10);
    expect(server.combineWeekScore([])).toBe(scoring.combineWeekScore([]));
    for (let n = 0; n <= 3; n += 1) expect(server.breadthFactor(n)).toBe(scoring.breadthFactor(n));
    const idSets = [[], ['workouts'], ['workouts', 'minutes'], ['workouts', 'calorieDays', 'weightLoss'], ['minutes', 'calorieDays', 'weightGain']];
    for (const ids of idSets) expect(server.coreCategoryCount(ids)).toBe(scoring.coreCategoryCount(ids));
  });

  test('difficulty tables + weight-goal difficulty', () => {
    for (let t = 1; t <= 7; t += 1) {
      expect(server.D_workouts(t)).toBe(difficulty.D_workouts(t));
      expect(server.D_calDays(t)).toBe(difficulty.D_calDays(t));
    }
    for (const m of [10, 90, 150, 300, 9999]) expect(server.D_minutes(m)).toBeCloseTo(difficulty.D_minutes(m), 10);
    const wl = { W0: 200, Wg: 180, Wt: 195, Tweeks: 12 };
    expect(server.D_weightLoss(wl).D).toBeCloseTo(difficulty.D_weightLoss(wl).D, 10);
    const wg = { W0: 160, Wg: 175, Wt: 162, Tweeks: 16 };
    expect(server.D_weightGain(wg).D).toBeCloseTo(difficulty.D_weightGain(wg).D, 10);
  });

  test('penalties, streak multiplier, shields, lower-tier bonus, adherence', () => {
    for (const mmr of [500, 1800, 3000, 6000]) {
      expect(server.missedWeekPenalty(mmr)).toBeCloseTo(constants.missedWeekPenalty(mmr), 10);
      expect(server.partialWeekPenalty(mmr)).toBeCloseTo(constants.partialWeekPenalty(mmr), 10);
    }
    for (const w of [0, 1, 2, 4, 8, 12, 20]) expect(server.streakMultiplier(w)).toBe(constants.streakMultiplier(w));
    const shieldCases = [
      { shieldBefore: 0, tierPromoted: true, completedWeek: true, consecutiveMissedWeeks: 0 },
      { shieldBefore: 2, tierPromoted: false, completedWeek: true, consecutiveMissedWeeks: 0 },
      { shieldBefore: 2, tierPromoted: false, completedWeek: false, consecutiveMissedWeeks: 2 },
    ];
    for (const c of shieldCases) expect(server.nextShieldWeeks(c)).toBe(progression.nextShieldWeeks(c));
    expect(server.lowerTierProgressBonus('Silver', true)).toBe(progression.lowerTierProgressBonus('Silver', true));
    expect(server.lowerTierProgressBonus('Platinum', true)).toBe(progression.lowerTierProgressBonus('Platinum', true));

    const totals = { a: 1500, b: 2500, c: 2000, d: 0 };
    for (const mode of [null, 'cut', 'bulk', 'maintenance'] as const) {
      expect(server.calorieDaysHitFromTotals(totals, 2000, mode)).toBe(calorieDaysHitFromTotals(totals, 2000, mode));
    }
    expect(server.calorieDaysHitFromTotals(totals, null)).toBe(calorieDaysHitFromTotals(totals, null));
  });

  test('time: week ids, ranges, season ids match', () => {
    const dates = [new Date('2026-01-02T12:00:00Z'), new Date('2026-07-10T12:00:00Z'), new Date('2026-12-31T12:00:00Z')];
    for (const d of dates) {
      expect(server.isoWeekIdInTz(d, DEFAULT_TZ)).toBe(isoWeekIdInTz(d, DEFAULT_TZ));
      expect(server.seasonIdFromDate(d, DEFAULT_TZ)).toBe(seasonIdFromDate(d, DEFAULT_TZ));
    }
    const wk = isoWeekIdInTz(dates[1], DEFAULT_TZ);
    expect(server.isoWeekRangeInTz(wk, DEFAULT_TZ)).toEqual(isoWeekRangeInTz(wk, DEFAULT_TZ));
    expect(server.nextIsoWeekId(wk, DEFAULT_TZ)).toBe(nextIsoWeekId(wk, DEFAULT_TZ));
    expect(server.STARTING_MMR).toBe(constants.STARTING_MMR);
    expect(server.RULES_VERSION).toBe(constants.RULES_VERSION);
  });
});
