import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebase/firebase';

/** Per-user, per-version local "onboarding done" flag key. */
export const onboardingLocalKey = (uid: string) => `onboardingComplete:${uid}:v${CURRENT_ONBOARDING_VERSION}`;

export type OnboardingData = {
  version?: number;
  completed: boolean;
  startedAt?: any; // Timestamp
  completedAt?: any; // Timestamp
  lastStep?: number;
};

/**
 * Bump this whenever onboarding changes enough that EVERY user — new or
 * returning — should see it again (e.g. the Midnight Blue redesign + intent
 * picker). Users whose stored `onboarding.version` is below this are routed
 * back through onboarding on next launch; completing it re-stamps the current
 * version, so it only shows once per bump. No backend migration needed.
 */
export const CURRENT_ONBOARDING_VERSION = 2;

export function useOnboardingStatus(uid: string | null): { isCompleted: boolean; isLoading: boolean } {
  // The status is stamped with the uid it was resolved FOR, and loading is
  // derived from that stamp during render.
  //
  // Why not an isLoading flag: the old code set isLoading back to true inside
  // this effect, but passive effects run AFTER the render where the uid
  // arrives. That one render saw ready && !completed, so AppNavigator mounted
  // the ONBOARDING stack (and hid the splash) before snapping to MainTabs,
  // and a cold-start push tap queued for onReady could be lost with it.
  // "Today initial display" was recorded as a child of the Welcome
  // transaction on 48 launches in 7 days (2026-08-25). With the stamp, a new
  // uid reads as loading on its very first render.
  const [status, setStatus] = useState<{ uid: string; completed: boolean } | null>(null);

  useEffect(() => {
    if (!uid || !db) return;

    let cancelled = false;
    const localKey = onboardingLocalKey(uid);

    // Mark this uid resolved. With no verdict, keep what we already knew for
    // this uid (a stale cache snapshot must never downgrade a completed user).
    const resolve = (completed?: boolean) => {
      if (cancelled) return;
      setStatus((prev) => ({
        uid,
        completed: completed ?? (prev?.uid === uid ? prev.completed : false),
      }));
    };

    // Never hang on the gate. If neither the local flag nor a server snapshot
    // answers (offline cold start), fall back to the old behaviour rather than
    // holding a blank screen behind the splash forever.
    const bail = setTimeout(() => resolve(), 2500);

    // Optimistically trust a persisted local completion. Once a user finishes
    // onboarding on this device we never want a cold-start cache miss (a cached
    // user doc that predates the completion write) to flash the welcome screen
    // and re-trap them. The server snapshot below stays the source of truth.
    AsyncStorage.getItem(localKey)
      .then((v) => {
        if (!cancelled && v === 'true') {
          clearTimeout(bail);
          resolve(true);
        }
      })
      .catch(() => {});

    // Subscribe to real-time updates
    const unsubscribe = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        // A cache-first snapshot can briefly claim the user doc doesn't exist
        // before the server responds, which flashed the onboarding welcome at
        // returning users. Stay in "loading" until we have real data.
        if (!snap.exists() && snap.metadata.fromCache) return;

        let completed = false;
        if (snap.exists()) {
          const data = snap.data();
          const onboarding = (data.onboarding as OnboardingData | undefined) ?? { completed: false };
          const seenCurrentVersion = (onboarding.version ?? 1) >= CURRENT_ONBOARDING_VERSION;
          completed = onboarding.completed === true && seenCurrentVersion;
        }

        clearTimeout(bail);
        if (completed) {
          resolve(true);
          AsyncStorage.setItem(localKey, 'true').catch(() => {});
        } else if (!snap.metadata.fromCache) {
          // Only a confirmed SERVER read may send a user (back) into onboarding —
          // a stale cache snapshot must never downgrade a completed user.
          resolve(false);
          AsyncStorage.removeItem(localKey).catch(() => {});
        } else {
          resolve();
        }
      },
      (error) => {
        console.error('[Onboarding] Error checking status:', error);
        clearTimeout(bail);
        resolve();
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(bail);
      unsubscribe();
    };
  }, [uid]);

  // Signed out (or no Firestore): nothing to wait for, never "completed".
  if (!uid || !db) return { isCompleted: false, isLoading: false };
  const resolved = !!status && status.uid === uid;
  return { isCompleted: resolved && status.completed, isLoading: !resolved };
}
