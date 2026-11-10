import { InteractionManager } from 'react-native';

/**
 * One stage for every celebration (FP toast, first log, streak, rank-up,
 * badge). They used to fire on their own timers, so a single save could stack
 * the toast, the streak screen and a rank-up push on top of each other, or
 * start one while the log sheet was still sliding away.
 *
 * A job gets the stage, calls done() when it is over, and the next one starts
 * after a short gap. Jobs also wait for any interaction React Native is
 * tracking (native-stack transitions are not tracked, so this is a light
 * courtesy, not a guarantee). A job that never calls done() is released
 * after MAX_HOLD_MS so the queue can't jam.
 */
type Job = (done: () => void) => void;

const GAP_MS = 250;
const MAX_HOLD_MS = 12_000;

const queue: Job[] = [];
let busy = false;

function pump(): void {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;

  let finished = false;
  let guard: ReturnType<typeof setTimeout> | null = null;
  const done = () => {
    if (finished) return;
    finished = true;
    if (guard) clearTimeout(guard);
    setTimeout(() => {
      busy = false;
      pump();
    }, GAP_MS);
  };
  guard = setTimeout(done, MAX_HOLD_MS);

  InteractionManager.runAfterInteractions(() => {
    try {
      job(done);
    } catch {
      done();
    }
  });
}

export function enqueueCelebration(job: Job): void {
  queue.push(job);
  pump();
}

/** Test hook. */
export function resetCelebrationQueue(): void {
  queue.length = 0;
  busy = false;
}
