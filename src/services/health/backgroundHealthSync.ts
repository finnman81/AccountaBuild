import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { onAuthStateChanged, type User } from 'firebase/auth';

import { auth, db } from '../../firebase/firebase';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getHealthSettings } from '../healthSettings';

/**
 * Periodic background health sync. Registers an OS-scheduled task that syncs
 * Apple Health / Health Connect data even when the app is closed — so logs stay
 * current without opening the app (the baseline "it just syncs" behavior).
 *
 * The OS decides exactly when to run (opportunistically, ~every 15+ min, subject
 * to battery/usage heuristics), so this is periodic, not instant. Near-instant
 * iOS sync via HealthKit background delivery is a separate future enhancement.
 */
export const BACKGROUND_HEALTH_SYNC_TASK = 'accountabuild-background-health-sync';

const isExpoGo = Constants.appOwnership === 'expo';

/** Resolve the persisted Firebase user (auth restore is async in a headless task). */
function waitForAuthedUser(timeoutMs = 8000): Promise<User | null> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (u: User | null) => {
      if (settled) return;
      settled = true;
      unsub();
      clearTimeout(timer);
      resolve(u);
    };
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) finish(u);
    });
    const timer = setTimeout(() => finish(auth.currentUser ?? null), timeoutMs);
  });
}

/**
 * Prod-visible wake telemetry: users/{uid}.healthBg. Without this there is NO
 * way to tell from data whether background execution ever happens (log docs
 * carry event time, not write time) — background sync "worked" for a month on
 * faith alone.
 */
function recordWake(uid: string, trigger: 'bgtask' | 'hk-observer', synced: boolean): void {
  void setDoc(
    doc(db, 'users', uid),
    { healthBg: { lastWakeAt: serverTimestamp(), lastTrigger: trigger, lastSynced: synced } },
    { merge: true },
  ).catch(() => {});
}

/** Shared headless sync: resolve auth/group/settings itself, then sync. */
async function runHeadlessSync(trigger: 'bgtask' | 'hk-observer'): Promise<boolean> {
  const user = await waitForAuthedUser();
  if (!user) return false;
  const groupId = await AsyncStorage.getItem(`activeGroupId:${user.uid}`);
  if (!groupId) { recordWake(user.uid, trigger, false); return false; }
  const settings = await getHealthSettings(user.uid);
  if (!settings.syncWorkouts && !settings.syncCalories && !settings.syncWeight) {
    recordWake(user.uid, trigger, false);
    return false;
  }
  const { syncHealthData } = await import('../healthSync');
  await syncHealthData(user.uid, groupId, settings);
  recordWake(user.uid, trigger, true);
  return true;
}

// Define the task at import time (required by expo-task-manager). No-op in Expo Go.
if (!isExpoGo && Platform.OS !== 'web') {
  TaskManager.defineTask(BACKGROUND_HEALTH_SYNC_TASK, async () => {
    try {
      await runHeadlessSync('bgtask');
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (e) {
      console.error('[BackgroundHealthSync] task failed:', e);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });

  /**
   * iOS instant path, REACT-FREE. The component-mounted observers only exist
   * once the tree is up with user+group+settings subscriptions resolved — on a
   * cold background wake iOS gives us seconds, and that race was the weak link.
   * This registration lives at module scope: it runs on every bundle boot
   * (including headless HK wakes), resolves its own inputs, and syncs directly.
   * Double-syncs with the component path are harmless — deterministic log ids
   * + tombstones make syncHealthData idempotent.
   */
  if (Platform.OS === 'ios') {
    let lastRun = 0;
    void (async () => {
      try {
        const user = await waitForAuthedUser(15000);
        if (!user) return;
        const settings = await getHealthSettings(user.uid);
        if (!settings.syncWorkouts && !settings.syncCalories && !settings.syncWeight) return;
        const HS = await import('./healthService');
        await HS.setupBackgroundObservers(() => {
          const now = Date.now();
          if (now - lastRun < 60_000) return; // debounce bursts of HK changes
          lastRun = now;
          void runHeadlessSync('hk-observer').catch(() => {});
        });
        console.log('[BackgroundHealthSync] headless HK observers registered');
      } catch (e) {
        console.warn('[BackgroundHealthSync] headless observer setup failed:', e);
      }
    })();
  }
}

/** Register the periodic background sync task (idempotent). Call once on app start. */
export async function registerBackgroundHealthSync(): Promise<void> {
  if (isExpoGo || Platform.OS === 'web') return;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      console.log('[BackgroundHealthSync] background tasks restricted by OS');
      return;
    }
    await BackgroundTask.registerTaskAsync(BACKGROUND_HEALTH_SYNC_TASK, { minimumInterval: 15 });
    console.log('[BackgroundHealthSync] registered');
  } catch (e) {
    console.warn('[BackgroundHealthSync] register failed:', e);
  }
}

export async function unregisterBackgroundHealthSync(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_HEALTH_SYNC_TASK)) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_HEALTH_SYNC_TASK);
    }
  } catch {
    /* non-fatal */
  }
}
