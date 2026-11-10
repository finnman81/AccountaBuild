jest.mock('react-native', () => ({
  InteractionManager: {
    runAfterInteractions: (fn: () => void) => {
      fn();
      return { cancel: () => {} };
    },
  },
}));

import { enqueueCelebration, resetCelebrationQueue } from '../src/services/celebrationQueue';

describe('celebration queue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetCelebrationQueue();
  });
  afterEach(() => jest.useRealTimers());

  it('plays one at a time, in order', () => {
    const log: string[] = [];
    let endToast: () => void = () => {};
    enqueueCelebration((done) => {
      log.push('toast');
      endToast = done;
    });
    enqueueCelebration((done) => {
      log.push('streak');
      done();
    });
    expect(log).toEqual(['toast']); // streak waits for the toast

    endToast();
    jest.advanceTimersByTime(300);
    expect(log).toEqual(['toast', 'streak']);
  });

  it('releases a job that never finishes', () => {
    const log: string[] = [];
    enqueueCelebration(() => log.push('stuck'));
    enqueueCelebration((done) => {
      log.push('next');
      done();
    });
    jest.advanceTimersByTime(12_500);
    expect(log).toEqual(['stuck', 'next']);
  });

  it('survives a job that throws', () => {
    const log: string[] = [];
    enqueueCelebration(() => {
      throw new Error('boom');
    });
    enqueueCelebration((done) => {
      log.push('next');
      done();
    });
    jest.advanceTimersByTime(300);
    expect(log).toEqual(['next']);
  });
});
