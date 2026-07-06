import { Platform } from 'react-native';

import { upsertGroupLogById, deleteGroupLogById, type WorkoutType } from './logs';
import { upsertUserWeightHistoryFromGroupLog } from './logEdits';
import { resolveHealthLogId, healthLogDocId, isRecentImportDate } from './health/healthLog';
import { getAnchor, setAnchor } from './health/healthAnchors';
import { formatYYYYMMDDLocal, todayYYYYMMDD } from '../utils/dates';
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

/** How far back sync imports (days). Covers a week of unopened-app activity. */
const BACKFILL_DAYS = 7;

/** Delete the group logs for samples that were removed in Apple Health. */
async function deleteSyncedLogs(
  groupId: string,
  deletedUuids: string[],
  result: SyncResult,
  label: string,
): Promise<number> {
  let removed = 0;
  for (const uuid of deletedUuids) {
    const id = healthLogDocId(uuid);
    if (!id) continue;
    try {
      await deleteGroupLogById(groupId, id);
      removed += 1;
    } catch (e) {
      result.errors.push(`${label} delete: ${e}`);
    }
  }
  return removed;
}

/**
 * Sync Apple Health / Google Fit data into the active group's logs.
 *
 * Idempotent + delta-based:
 * - Every synced sample is written to a deterministic doc id derived from its
 *   HealthKit UUID (see health/healthLog.ts) via a merge upsert. Re-syncing the
 *   same sample overwrites itself instead of creating a duplicate, with no
 *   per-item dedup reads (the old N+1 pattern is gone).
 * - Workouts use anchored queries: each sync reads only what changed since the
 *   stored anchor, and samples deleted in Health are removed from the group.
 * - Calories import via the today read (which handles individual samples, food
 *   correlations, and daily-statistics sources), and use an anchored query to
 *   honor deletions. Weight imports the most recent value for today.
 *
 * First run (no stored anchor) skips deletion processing and just seeds the
 * anchor, so subsequent syncs are pure deltas.
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
    const today = todayYYYYMMDD();

    try {
      const permissions = await HealthService.checkHealthPermissions();
      console.log('[HealthSync] Starting sync', { uid, groupId, settings, permissions });

      // ---- Workouts (anchored delta: import new/changed, honor deletions) ----
      if (settings.syncWorkouts && permissions.workouts) {
        try {
          const anchor = await getAnchor(uid, 'workouts');
          const { items, deletedUuids, newAnchor } = await HealthService.readWorkoutsSinceAnchor(anchor);
          let synced = 0;
          for (const w of items) {
            const date = formatYYYYMMDDLocal(w.startDate);
            // Backfill window: last 7 days, so days the app wasn't opened still count.
            if (!isRecentImportDate(date, today, BACKFILL_DAYS)) continue;
            try {
              const logId = resolveHealthLogId(w.uuid, { type: 'workout', date, value: w.durationMinutes, source });
              await upsertGroupLogById(groupId, logId, {
                uid,
                type: 'workout',
                date,
                source,
                payload: { workoutType: w.workoutType as WorkoutType, durationMinutes: w.durationMinutes, note: `Synced from ${sourceLabel}` },
              });
              synced += 1;
              result.workoutsSynced += 1;
            } catch (e) {
              result.errors.push(`workout: ${e}`);
            }
          }
          // Skip deletions on first run (no prior anchor) to avoid no-op churn.
          const removed = anchor ? await deleteSyncedLogs(groupId, deletedUuids, result, 'workout') : 0;
          if (newAnchor) await setAnchor(uid, 'workouts', newAnchor);
          result.diagnostics!.workouts = { dataFromHealth: { source, deltaCount: items.length, deletedCount: removed, firstRun: !anchor }, syncedCount: synced };
          console.log('[HealthSync] Workouts: synced', synced, 'deleted', removed, 'of delta', items.length);
        } catch (e) {
          result.errors.push(`read workouts: ${e}`);
          result.diagnostics!.workouts = { dataFromHealth: null, reason: `Error: ${e}` };
        }
      } else {
        result.diagnostics!.workouts = { dataFromHealth: null, reason: `disabled (enabled=${settings.syncWorkouts}, perm=${permissions.workouts})` };
      }

      // ---- Calories (today read import for all source types; anchored deletions) ----
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
          // Backfill + deletions via the anchored delta read: import any entries
          // from the last week the app missed, and honor Apple Health deletions.
          const anchor = await getAnchor(uid, 'calories');
          const { items: deltaEntries, deletedUuids, newAnchor } = await HealthService.readCalorieEntriesSinceAnchor(anchor);
          for (const entry of deltaEntries) {
            if (!isRecentImportDate(entry.date, today, BACKFILL_DAYS)) continue;
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
              result.errors.push(`calorie backfill: ${e}`);
            }
          }
          if (synced > 0) result.caloriesSynced = true;
          const removed = anchor ? await deleteSyncedLogs(groupId, deletedUuids, result, 'calorie') : 0;
          if (newAnchor) await setAnchor(uid, 'calories', newAnchor);

          result.diagnostics!.calories = { dataFromHealth: { source, entriesCount: entries.length, deletedCount: removed, firstRun: !anchor }, syncedCount: synced };
          console.log('[HealthSync] Calories:', synced, 'entries, deleted', removed);
        } catch (e) {
          result.errors.push(`read calories: ${e}`);
          result.diagnostics!.calories = { dataFromHealth: null, reason: `Error: ${e}` };
        }
      } else {
        result.diagnostics!.calories = { dataFromHealth: null, reason: `disabled (enabled=${settings.syncCalories}, perm=${permissions.calories})` };
      }

      // ---- Weight (latest per day, last week — backfills unopened-app days) ----
      if (settings.syncWeight && permissions.weight) {
        try {
          const weights = await HealthService.readRecentWeights(BACKFILL_DAYS);
          let syncedW = 0;
          for (const weight of weights) {
            if (!weight || weight.weight <= 0) continue;
            if (!isRecentImportDate(weight.date, today, BACKFILL_DAYS)) continue;
            try {
              const logId = resolveHealthLogId(weight.uuid, { type: 'weight', date: weight.date, value: weight.weight, source });
              await upsertGroupLogById(groupId, logId, {
                uid,
                type: 'weight',
                date: weight.date,
                source,
                payload: { weight: weight.weight, note: `Synced from ${sourceLabel}` },
              });
              await upsertUserWeightHistoryFromGroupLog({ uid, groupId, groupLogId: logId, date: weight.date, weight: weight.weight });
              syncedW += 1;
            } catch (e) {
              result.errors.push(`weight: ${e}`);
            }
          }
          if (syncedW > 0) result.weightSynced = true;
          result.diagnostics!.weight = { dataFromHealth: { count: weights.length }, syncedCount: syncedW, reason: syncedW === 0 ? 'no weights in window' : undefined };
          console.log('[HealthSync] Weights synced:', syncedW, 'of', weights.length);
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
