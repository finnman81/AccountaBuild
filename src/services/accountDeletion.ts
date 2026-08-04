import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * Delete the signed-in user's account (App Store Guideline 5.1.1(v)).
 *
 * Server-side by necessity: Firestore rules deny client deletes of
 * `users/{uid}` and `publicUsers/{uid}` (delete-and-recreate was an FP-reset
 * exploit), so the app can't tear itself down locally.
 *
 * The literal 'DELETE' confirmation is required by the function too, so a
 * mis-wired button can never destroy an account.
 */
export type DeletionReport = {
  ok: true;
  groupsLeft: number;
  subcollections: number;
  logs: number;
  messages: number;
};

export async function deleteMyAccount(): Promise<DeletionReport> {
  const fn = httpsCallable(getFunctions(getApp()), 'deleteMyAccount');
  const res = await fn({ confirm: 'DELETE' });
  return res.data as DeletionReport;
}
