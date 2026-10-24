/**
 * "Home has its fresh data." Background chores (health sync, heartbeat,
 * streak mirror, push registration, reminder re-arm, update check) used to all
 * fire in the first second and share Firestore's single connection with
 * Home's reads. They now wait for this, with a timeout so nothing can hang.
 */
let settled = false;
const waiters: Array<() => void> = [];

export function markAppSettled(): void {
  if (settled) return;
  settled = true;
  waiters.splice(0).forEach((resolve) => resolve());
}

export function whenAppSettled(maxWaitMs = 6000): Promise<void> {
  if (settled) return Promise.resolve();
  return new Promise((resolve) => {
    waiters.push(resolve);
    setTimeout(resolve, maxWaitMs);
  });
}
