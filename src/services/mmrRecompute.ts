import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * Ask the SERVER to recompute my FP (the recomputeMyMmr callable).
 *
 * This replaced the on-device scorer (src/services/mmrUpdate.ts, removed
 * 2026-07-22): scoring now has exactly one implementation — functions/
 * mmr-compute.js — and Firestore rules deny client writes to mmr state, so
 * a client that computed locally couldn't persist the result anyway.
 *
 * 'week'    — current week only (cheap; used by the post-log live settle)
 * 'catchup' — season rollover + walk every unclosed week (Profile open/refresh)
 *
 * Failures are safe to swallow at call sites that were already fire-and-forget:
 * the 6-hour scheduled compute settles everyone regardless.
 */
export async function recomputeMyMmr(mode: 'week' | 'catchup'): Promise<void> {
  const fn = httpsCallable(getFunctions(getApp()), 'recomputeMyMmr');
  await fn({ mode });
}
