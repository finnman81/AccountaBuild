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
  const [isCompleted, setIsCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!uid || !db) {
      setIsCompleted(false);
      setIsLoading(false);
      return;
    }

    // BACK INTO LOADING. The previous run of this effect (uid === null, before
    // auth restored) left isLoading FALSE, and isCompleted defaults to false.
    // So the instant auth resolved, AppNavigator saw ready && !completed and
    // mounted the ONBOARDING stack for everyone, until the Firestore snapshot
    // landed a beat later and flipped it to MainTabs.
    //
    // That flash was invisible in the error feed but plain in the traces:
    // "Today initial display" was being recorded as a child of the Welcome
    // transaction on 48 launches in 7 days, i.e. returning users met the
    // onboarding welcome screen for ~0.9s on cold start (2026-08-25).
    setIsLoading(true);

    let cancelled = false;
    const localKey = onboardingLocalKey(uid);

    // Never hang on the gate. If neither the local flag nor a server snapshot
    // answers (offline cold start), fall back to the old behaviour rather than
    // holding a blank screen behind the splash forever.
    const bail = setTimeout(() => {
      if (!cancelled) setIsLoading(false);
    }, 2500);

    // Optimistically trust a persisted local completion. Once a user finishes
    // onboarding on this device we never want a cold-start cache miss (a cached
    // user doc that predates the completion write) to flash the welcome screen
    // and re-trap them. The server snapshot below stays the source of truth.
    AsyncStorage.getItem(localKey)
      .then((v) => {
        if (!cancelled && v === 'true') {
          clearTimeout(bail);
          setIsCompleted(true);
          setIsLoading(false);
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

        if (completed) {
          setIsCompleted(true);
          AsyncStorage.setItem(localKey, 'true').catch(() => {});
        } else if (!snap.metadata.fromCache) {
          // Only a confirmed SERVER read may send a user (back) into onboarding —
          // a stale cache snapshot must never downgrade a completed user.
          setIsCompleted(false);
          AsyncStorage.removeItem(localKey).catch(() => {});
        }
        clearTimeout(bail);
        setIsLoading(false);
      },
      (error) => {
        console.error('[Onboarding] Error checking status:', error);
        clearTimeout(bail);
        setIsLoading(false);
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(bail);
      unsubscribe();
    };
  }, [uid]);

  return { isCompleted, isLoading };
}
