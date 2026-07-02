import { Platform } from 'react-native';

import { upsertGroupLogById, type WorkoutType } from './logs';
import { upsertUserWeightHistoryFromGroupLog } from './logEdits';
import { resolveHealthLogId } from './health/healthLog';
import { todayYYYYMMDD } from '../utils/dates';
import * as HealthService from './health/healthService';
import type { HealthSettings } from './healthSettings';

export type SyncResult = {
  workoutsSynced: number;
  caloriesSynced: boolean;
  weightSynced: boolean;
  errors: string[];
  diagnostics?: {
    workouts?: { dataFromHealth: any; syncedCount?: number; reason?: string };
    calories?: { dataFromHealth: any; syncedCount?: number; reason?: string };
    weight?: { dataFromHealth: any; syncedCount?: number; reason?: string };
  };
};

// One sync at a time; concurrent callers share the in-flight promise.
let syncInProgress = false;
let syncPromise: Promise<SyncResult> | null = null;

/**
 * Sync today's Apple Health / Google Fit data into the active group's logs.
 *
 * Idempotent: every synced sample is written to a deterministic doc id derived
 * from its HealthKit/Health Connect UUID (see health/healthLog.ts) via a merge
 * upsert. Re-syncing the same sample overwrites itself instead of creating a
 * duplicate, and there are no per-item dedup reads (the old N+1 pattern is gone).
 */
export async function syncHealthData(uid: string, groupId: string, settings: HealthSettings): Promise<SyncResult> {
  if (syncInProgress && syncPromise) {
    console.log('[HealthSync] Sync already in progress, returning existing promise');
    return syncPromise;
  }

  syncInProgress = true;
  syncPromise = (async () => {
    const result: SyncResult = { workoutsSynced: 0, caloriesSynced: false, weightSynced: false, errors: [], diagnostics: {} };
    const source = Platform.OS === 'ios' ? 'apple_health' : 'google_fit';
    const sourceLabel = Platform.OS === 'ios' ? 'Apple Health' : 'Google Fit';

    try {
      const permissions = await HealthService.checkHealthPermissions();
      console.log('[HealthSync] Starting sync', { uid, groupId, settings, permissions });

      // ---- Workouts ----
      if (settings.syncWorkouts && permissions.workouts) {
        try {
          const workouts = await HealthService.readTodayWorkouts();
          let synced = 0;
          for (const w of workouts) {
            try {
              const logId = resolveHealthLogId(w.uuid, { type: 'workout', date: todayYYYYMMDD(), value: w.durationMinutes, source });
              await upsertGroupLogById(groupId, logId, {
                uid,
                type: 'workout',
                date: todayYYYYMMDD(),
                source,
                payload: { workoutType: w.workoutType as WorkoutType, durationMinutes: w.durationMinutes, note: `Synced from ${sourceLabel}` },
              });
              synced += 1;
              result.workoutsSynced += 1;
            } catch (e) {
              result.errors.push(`workout: ${e}`);
            }
          }
          result.diagnostics!.workouts = { dataFromHealth: { source, totalCount: workouts.length }, syncedCount: synced };
          console.log('[HealthSync] Workouts:', synced, 'of', workouts.length);
        } catch (e) {
          result.errors.push(`read workouts: ${e}`);
          result.diagnostics!.workouts = { dataFromHealth: null, reason: `Error: ${e}` };
        }
      } else {
        result.diagnostics!.workouts = { dataFromHealth: null, reason: `disabled (enabled=${settings.syncWorkouts}, perm=${permissions.workouts})` };
      }

      // ---- Calories (per-entry, meal-aware) ----
      if (settings.syncCalories && permissions.calories) {
        try {
          const entries = await HealthService.readTodayCalorieEntries();
          let synced = 0;
          for (const entry of entries) {
            try {
              const logId = resolveHealthLogId(entry.uuid, { type: 'calories', date: entry.date, value: entry.calories, meal: entry.meal, source });
              await upsertGroupLogById(groupId, logId, {
                uid,
                type: 'calories',
                date: entry.date,
                source,
                payload: { calories: entry.calories, meal: entry.meal, note: entry.source ? `Synced from ${sourceLabel} (${entry.source})` : `Synced from ${sourceLabel}` },
              });
              synced += 1;
            } catch (e) {
              result.errors.push(`calorie entry: ${e}`);
            }
          }
          if (synced > 0) result.caloriesSynced = true;
          result.diagnostics!.calories = { dataFromHealth: { source, entriesCount: entries.length }, syncedCount: synced };
          console.log('[HealthSync] Calories:', synced, 'entries');
        } catch (e) {
          result.errors.push(`read calories: ${e}`);
          result.diagnostics!.calories = { dataFromHealth: null, reason: `Error: ${e}` };
        }
      } else {
        result.diagnostics!.calories = { dataFromHealth: null, reason: `disabled (enabled=${settings.syncCalories}, perm=${permissions.calories})` };
      }

      // ---- Weight (most recent today) ----
      if (settings.syncWeight && permissions.weight) {
        try {
          const weight = await HealthService.readTodayWeight();
          if (weight && weight.weight > 0) {
            const logId = resolveHealthLogId(weight.uuid, { type: 'weight', date: todayYYYYMMDD(), value: weight.weight, source });
            await upsertGroupLogById(groupId, logId, {
              uid,
              type: 'weight',
              date: todayYYYYMMDD(),
              source,
              payload: { weight: weight.weight, note: `Synced from ${sourceLabel}` },
            });
            await upsertUserWeightHistoryFromGroupLog({ uid, groupId, groupLogId: logId, date: todayYYYYMMDD(), weight: weight.weight });
            result.weightSynced = true;
            result.diagnostics!.weight = { dataFromHealth: weight, syncedCount: 1 };
            console.log('[HealthSync] Weight synced:', weight.weight);
          } else {
            result.diagnostics!.weight = { dataFromHealth: weight ?? null, reason: weight ? 'weight is 0' : 'no weight today' };
          }
        } catch (e) {
          result.errors.push(`read weight: ${e}`);
          result.diagnostics!.weight = { dataFromHealth: null, reason: `Error: ${e}` };
        }
      } else {
        result.diagnostics!.weight = { dataFromHealth: null, reason: `disabled (enabled=${settings.syncWeight}, perm=${permissions.weight})` };
      }

      console.log('[HealthSync] Sync complete', result);
    } catch (e) {
      console.error('[HealthSync] Sync failed', e);
      result.errors.push(`sync failed: ${e}`);
    } finally {
      syncInProgress = false;
      syncPromise = null;
    }

    return result;
  })();

  return syncPromise;
}
