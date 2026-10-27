import { goalStatus } from '../src/components/progress/GoalBoard';

describe('goalStatus (pace-relative weekly goal status)', () => {
  it('Monday with nothing logged is still on pace, never red', () => {
    expect(goalStatus(0, 4, 1)).toBe('offPace');
    expect(goalStatus(1, 4, 1)).toBe('onPace');
  });

  it('a hit goal is done, even early in the week', () => {
    expect(goalStatus(4, 4, 2)).toBe('done');
  });

  it('red needs a bad pace and at least three days gone', () => {
    expect(goalStatus(0, 4, 2)).toBe('offPace');
    expect(goalStatus(0, 4, 3)).toBe('behind');
    expect(goalStatus(1, 7, 6)).toBe('behind');
  });

  it('a strong absolute finish is green at week end', () => {
    expect(goalStatus(5, 6, 7)).toBe('onPace');
    expect(goalStatus(3, 6, 7)).toBe('offPace');
    expect(goalStatus(2, 6, 7)).toBe('behind');
  });

  it('no goal is never judged', () => {
    expect(goalStatus(0, 0, 7)).toBe('onPace');
  });
});
