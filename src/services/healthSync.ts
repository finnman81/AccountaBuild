import { Platform } from 'react-native';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';

import { db } from '../firebase/firebase';
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

/**
 * Delete the group logs for samples that were removed in Apple Health.
 *
 * Two guards against HealthKit misreporting deletions (watch/phone merges can
 * flag LIVE samples as deleted — prod 2026-08-12 ate a workout + dinner):
 *  - a uuid we just imported this run is alive by definition; never delete it
 *  - sync deletes never tombstone, so a false report costs one sync cycle,
 *    not the sample forever (the direct-window read re-imports it)
 */
async function deleteSyncedLogs(
  groupId: string,
  deletedUuids: string[],
  result: SyncResult,
  label: string,
  justImportedIds?: Set<string>,
): Promise<number> {
  let removed = 0;
  for (const uuid of deletedUuids) {
    const id = healthLogDocId(uuid);
    if (!id) continue;
    if (justImportedIds?.has(id)) continue;
    try {
      await deleteGroupLogById(groupId, id, { tombstone: false });
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

      // FIRST-EVER sync imports today only. Backfilling a week of history for
      // a brand-new member fabricates instant 7-day streaks and floods the
      // group feed with pre-join activity; ongoing syncs keep the full window
      // to cover unopened-app days.
      const isFirstSync = !(await getAnchor(uid, 'workouts'));
      const importDays = isFirstSync ? 1 : BACKFILL_DAYS;

      // Hard floor: never import health data dated before the user joined
      // this group — without it, deleted pre-join backfill would just
      // reappear on the next sync (idempotent upserts re-import the window).
      let joinFloor: string | null = null;
      try {
        const membership = await getDoc(doc(db, 'users', uid, 'groups', groupId));
        const j = (membership.data() as any)?.joinedAt;
        const jd = typeof j?.toDate === 'function' ? j.toDate() : null;
        if (jd) joinFloor = formatYYYYMMDDLocal(jd);
      } catch {
        /* non-fatal — sync proceeds without the floor */
      }
      const importOk = (date: string) => isRecentImportDate(date, today, importDays) && (!joinFloor || date >= joinFloor);

      // Tombstones: log ids the user DELETED. Without this, the idempotent
      // upsert resurrects a deleted synced workout on every sync ("I delete
      // the extra and it comes back"). Tombstoned ids are skipped, and if one
      // somehow exists again (imported by an old app version), re-deleted.
      let tombstones = new Set<string>();
      try {
        const ts = await getDocs(collection(db, 'users', uid, 'healthTombstones'));
        tombstones = new Set(ts.docs.map((d) => d.id));
      } catch {
        /* non-fatal */
      }
      const isTombstoned = async (logId: string): Promise<boolean> => {
        if (!tombstones.has(logId)) return false;
        // Self-heal: an old app version may have re-imported it after deletion.
        await deleteGroupLogById(groupId, logId).catch(() => {});
        return true;
      };

      // ---- Workouts (anchored delta: import new/changed, honor deletions) ----
      if (settings.syncWorkouts && permissions.workouts) {
        try {
          // Import from a DIRECT recent-window read (robust — never permanently
          // skips data the way an advanced anchor can). Idempotent upserts prevent
          // dupes. The anchored read is used only for deletion detection.
          const items = await HealthService.readRecentWorkouts(importDays);

          // Near-duplicate suppression: phones + watches frequently record the
          // SAME session as two HealthKit samples with different uuids
          // (observed in prod: 53m@9:51 + 49m@9:50 lifting pairs). Same
          // workout type starting within 15 minutes = one session; keep the
          // longest sample.
          const kept: typeof items = [];
          for (const w of [...items].sort((a, b) => b.durationMinutes - a.durationMinutes)) {
            const wDate = formatYYYYMMDDLocal(w.startDate);
            const dup = kept.some(
              (k) =>
                k.workoutType === w.workoutType &&
                formatYYYYMMDDLocal(k.startDate) === wDate &&
                Math.abs(k.startDate.getTime() - w.startDate.getTime()) <= 15 * 60 * 1000,
            );
            if (!dup) kept.push(w);
          }

          let synced = 0;
          const importedIds = new Set<string>();
          for (const w of kept) {
            const date = formatYYYYMMDDLocal(w.startDate);
            if (!importOk(date)) continue;
            try {
              const logId = resolveHealthLogId(w.uuid, { type: 'workout', date, value: w.durationMinutes, source });
              if (await isTombstoned(logId)) continue;
              importedIds.add(logId);
              await upsertGroupLogById(groupId, logId, {
                uid,
                type: 'workout',
                date,
                source,
                // Real event time -> stable ts across re-syncs + correct chat ordering.
                eventAt: w.startDate,
                payload: { workoutType: w.workoutType as WorkoutType, durationMinutes: w.durationMinutes, note: `Synced from ${sourceLabel}` },
              });
              synced += 1;
              result.workoutsSynced += 1;
            } catch (e) {
              result.errors.push(`workout: ${e}`);
            }
          }
          // Deletions via the anchored delta (skip first run to avoid no-op churn).
          const anchor = await getAnchor(uid, 'workouts');
          const { deletedUuids, newAnchor } = await HealthService.readWorkoutsSinceAnchor(anchor);
          const removed = anchor ? await deleteSyncedLogs(groupId, deletedUuids, result, 'workout', importedIds) : 0;
          if (newAnchor) await setAnchor(uid, 'workouts', newAnchor);
          result.diagnostics!.workouts = { dataFromHealth: { source, totalCount: items.length, dedupedCount: items.length - kept.length, deletedCount: removed }, syncedCount: synced };
          console.log('[HealthSync] Workouts: synced', synced, 'deleted', removed, 'of', items.length);
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
          const importedIds = new Set<string>();
          for (const entry of entries) {
            try {
              const logId = resolveHealthLogId(entry.uuid, { type: 'calories', date: entry.date, value: entry.calories, meal: entry.meal, source });
              if (await isTombstoned(logId)) continue;
              importedIds.add(logId);
              await upsertGroupLogById(groupId, logId, {
                uid,
                type: 'calories',
                date: entry.date,
                source,
                eventAt: entry.timestamp,
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
            if (!importOk(entry.date)) continue;
            try {
              const logId = resolveHealthLogId(entry.uuid, { type: 'calories', date: entry.date, value: entry.calories, meal: entry.meal, source });
              if (await isTombstoned(logId)) continue;
              importedIds.add(logId);
              await upsertGroupLogById(groupId, logId, {
                uid,
                type: 'calories',
                date: entry.date,
                source,
                eventAt: entry.timestamp,
                payload: { calories: entry.calories, meal: entry.meal, note: entry.source ? `Synced from ${sourceLabel} (${entry.source})` : `Synced from ${sourceLabel}` },
              });
              synced += 1;
            } catch (e) {
              result.errors.push(`calorie backfill: ${e}`);
            }
          }
          if (synced > 0) result.caloriesSynced = true;
          const removed = anchor ? await deleteSyncedLogs(groupId, deletedUuids, result, 'calorie', importedIds) : 0;
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
          const weights = await HealthService.readRecentWeights(importDays);
          let syncedW = 0;
          for (const weight of weights) {
            if (!weight || weight.weight <= 0) continue;
            if (!importOk(weight.date)) continue;
            try {
              const logId = resolveHealthLogId(weight.uuid, { type: 'weight', date: weight.date, value: weight.weight, source });
              if (await isTombstoned(logId)) continue;
              await upsertGroupLogById(groupId, logId, {
                uid,
                type: 'weight',
                date: weight.date,
                source,
                eventAt: weight.timestamp,
                payload: { weight: weight.weight, note: `Synced from ${sourceLabel}` },
              });
              await upsertUserWeightHistoryFromGroupLog({ uid, groupId, groupLogId: logId, date: weight.date, weight: weight.weight });
              syncedW += 1;
            } catch (e) {
              result.errors.push(`weight: ${e}`);
            }
          }
          if (syncedW > 0) result.weightSynced = true;
          // A weigh-in synced for TODAY is the user's latest known weight —
          // keep the profile's "Current weight" in step with it.
          const todays = weights.filter((w) => w && w.date === today && w.weight > 0);
          if (todays.length > 0) {
            const latest = todays[todays.length - 1]!;
            try {
              const { updateMyProfile, syncMyMemberProfileToAllGroups } = await import('./profile');
              await updateMyProfile({ uid, weightCurrent: latest.weight });
              await syncMyMemberProfileToAllGroups(uid);
            } catch (e) {
              result.errors.push(`weight profile sync: ${e}`);
            }
          }
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
