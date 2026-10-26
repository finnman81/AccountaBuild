/**
 * "Home has its fresh data." Background chores (health sync, heartbeat,
 * streak mirror, push registration, reminder re-arm, update check) used to all
 * fire in the first second and share Firestore's single connection with
 * Home's reads. They now wait for this, with a timeout so nothing can hang.
 */
import { auth } from '../firebase/firebase';

let settled = false;
const waiters: Array<() => void> = [];

/**
 * Firebase Auth has finished restoring the session. The app paints before
 * this (cached user), so anything that WRITES must wait for it or the
 * request goes out anonymous and the rules deny it (Sentry 10/26: Red's
 * Android, registerPushToken 'Missing or insufficient permissions' after
 * the 6s settle timeout beat a slow auth restore).
 */
export async function whenAuthReady(): Promise<void> {
  try {
    const a: any = auth;
    if (!a) return;
    if (typeof a.authStateReady === 'function') await a.authStateReady();
    if (a.currentUser) return;
    // Restored as signed OUT (the cached user was stale): hold until someone
    // actually signs in. Chores must never run as a user who isn't there.
    await new Promise<void>((resolve) => {
      const unsub = a.onAuthStateChanged((u: unknown) => {
        if (u) {
          unsub();
          resolve();
        }
      });
    });
  } catch {
    /* never block on this */
  }
}

export function markAppSettled(): void {
  if (settled) return;
  settled = true;
  waiters.splice(0).forEach((resolve) => resolve());
}

export function whenAppSettled(maxWaitMs = 6000): Promise<void> {
  const settledOrTimeout: Promise<void> = settled
    ? Promise.resolve()
    : new Promise((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, maxWaitMs);
      });
  // Auth readiness has no timeout: a chore that runs signed-out is worse than late.
  return settledOrTimeout.then(whenAuthReady);
}
