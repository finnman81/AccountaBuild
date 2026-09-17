import { carryCheckpoints } from '../../src/mmr/difficulty';

describe('carryCheckpoints (re-planned weight goal)', () => {
  it('a finished goal leaves a fresh ledger for the next one', () => {
    expect(carryCheckpoints({ startWeight: 222, goalWeight: 215, checkpointsAwarded: [0.1, 0.25, 0.5, 0.75, 1] }, { startWeight: 215, goalWeight: 205 })).toEqual([]);
  });
  it('same numbers (date-only change) keep the ledger', () => {
    expect(carryCheckpoints({ startWeight: 188, goalWeight: 175, checkpointsAwarded: [0.1, 0.25] }, { startWeight: 188, goalWeight: 175 })).toEqual([0.1, 0.25]);
  });
  it('nudging the start weight cannot re-pay pounds already rewarded', () => {
    // paid to 188 - 0.25*13 = 184.75; new 10% rung sits at 186.6 -> already paid
    expect(carryCheckpoints({ startWeight: 188, goalWeight: 175, checkpointsAwarded: [0.1, 0.25] }, { startWeight: 187.9, goalWeight: 175 })).toEqual([0.1, 0.25]);
  });
  it('a harder target re-marks only the rungs the old pounds cover', () => {
    // paid to 184.75; new goal 188 -> 168: 10% = 186 (paid), 25% = 183 (not yet)
    expect(carryCheckpoints({ startWeight: 188, goalWeight: 175, checkpointsAwarded: [0.1, 0.25] }, { startWeight: 188, goalWeight: 168 })).toEqual([0.1]);
  });
  it('works for gain, and a direction flip carries nothing', () => {
    expect(carryCheckpoints({ startWeight: 150, goalWeight: 160, checkpointsAwarded: [0.1, 0.25, 0.5] }, { startWeight: 150, goalWeight: 170 })).toEqual([0.1, 0.25]);
    expect(carryCheckpoints({ startWeight: 150, goalWeight: 160, checkpointsAwarded: [0.5] }, { startWeight: 160, goalWeight: 150 })).toEqual([]);
  });
  it('no previous goal', () => {
    expect(carryCheckpoints(null, { startWeight: 200, goalWeight: 190 })).toEqual([]);
  });
});
