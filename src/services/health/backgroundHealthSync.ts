import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { onAuthStateChanged, type User } from 'firebase/auth';

import { auth } from '../../firebase/firebase';
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

// Define the task at import time (required by expo-task-manager). No-op in Expo Go.
if (!isExpoGo && Platform.OS !== 'web') {
  TaskManager.defineTask(BACKGROUND_HEALTH_SYNC_TASK, async () => {
    try {
      const user = await waitForAuthedUser();
      if (!user) return BackgroundTask.BackgroundTaskResult.Success;

      const groupId = await AsyncStorage.getItem(`activeGroupId:${user.uid}`);
      if (!groupId) return BackgroundTask.BackgroundTaskResult.Success;

      const settings = await getHealthSettings(user.uid);
      if (!settings.syncWorkouts && !settings.syncCalories && !settings.syncWeight) {
        return BackgroundTask.BackgroundTaskResult.Success;
      }

      const { syncHealthData } = await import('../healthSync');
      await syncHealthData(user.uid, groupId, settings);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (e) {
      console.error('[BackgroundHealthSync] task failed:', e);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
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
