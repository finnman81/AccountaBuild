import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { todayYYYYMMDD } from '../utils/dates';
import { addCaloriesLog, addWorkoutLog, addWeightLog, type WorkoutType } from './logs';
import { upsertUserWeightHistoryFromGroupLog } from './logEdits';
import * as HealthService from './health/healthService';
import type { HealthSettings } from './healthSettings';

export type SyncResult = {
  workoutsSynced: number;
  caloriesSynced: boolean;
  weightSynced: boolean;
  errors: string[];
  diagnostics?: {
    calories?: {
      hasManualLog: boolean;
      dataFromHealth: any;
      reason?: string;
    };
    weight?: {
      hasManualLog: boolean;
      dataFromHealth: any;
      reason?: string;
    };
    workouts?: {
      hasManualLog: boolean;
      dataFromHealth: any;
      reason?: string;
    };
  };
};

/**
 * Check if a manual log exists for today for a specific type
 */
async function hasManualLogForToday(
  groupId: string,
  uid: string,
  logType: 'calories' | 'workout' | 'weight',
): Promise<boolean> {
  const today = todayYYYYMMDD();
  const logsRef = collection(db, 'groups', groupId, 'logs');
  const q = query(
    logsRef,
    where('uid', '==', uid),
    where('type', '==', logType),
    where('date', '==', today),
    where('source', '==', 'self_reported'),
  );

  const snapshot = await getDocs(q);
  return !snapshot.empty;
}

// Sync lock to prevent concurrent syncs
let syncInProgress = false;
let syncPromise: Promise<SyncResult> | null = null;

/**
 * Check if a synced log already exists for today with the same value
 * This prevents duplicate entries when syncing multiple times
 */
async function hasSyncedLogForToday(
  groupId: string,
  uid: string,
  logType: 'calories' | 'workout' | 'weight',
  value: number,
  source: 'apple_health' | 'google_fit',
  additionalData?: { workoutType?: string; durationMinutes?: number; meal?: string },
): Promise<boolean> {
  const today = todayYYYYMMDD();
  const logsRef = collection(db, 'groups', groupId, 'logs');
  
  // For weight, check if same weight value already exists from same source
  if (logType === 'weight') {
    const q = query(
      logsRef,
      where('uid', '==', uid),
      where('type', '==', 'weight'),
      where('date', '==', today),
      where('source', '==', source),
    );
    const snapshot = await getDocs(q);
    // Check if any existing log has the same weight value
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const existingWeight = Number((data.payload as any)?.weight);
      // If weight matches within 0.1 lb (to account for rounding), consider it a duplicate
      if (Math.abs(existingWeight - value) < 0.1) {
        console.log('[HealthSync] Duplicate weight detected:', existingWeight, 'vs', value);
        return true;
      }
    }
    return false;
  }
  
  // For calories, check if same calorie value AND meal type already exists from same source
  if (logType === 'calories') {
    const meal = additionalData?.meal;
    const q = query(
      logsRef,
      where('uid', '==', uid),
      where('type', '==', 'calories'),
      where('date', '==', today),
      where('source', '==', source),
    );
    const snapshot = await getDocs(q);
    // Check if any existing log has the same calorie value AND meal type
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const existingCalories = Number((data.payload as any)?.calories);
      const existingMeal = String((data.payload as any)?.meal ?? '');
      // If calories match exactly AND meal type matches, consider it a duplicate
      if (existingCalories === value && existingMeal === meal) {
        console.log('[HealthSync] Duplicate calories detected:', existingCalories, 'calories for', existingMeal, 'vs', value, 'calories for', meal);
        return true;
      }
    }
    return false;
  }
  
  // For workouts, check if same workout type and duration already exists from same source
  if (logType === 'workout' && additionalData?.workoutType && additionalData?.durationMinutes !== undefined) {
    const q = query(
      logsRef,
      where('uid', '==', uid),
      where('type', '==', 'workout'),
      where('date', '==', today),
      where('source', '==', source),
    );
    const snapshot = await getDocs(q);
    // Check if any existing log has the same workout type and similar duration
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const existingWorkoutType = String((data.payload as any)?.workoutType ?? '');
      const existingDuration = Number((data.payload as any)?.durationMinutes ?? 0);
      // If workout type matches and duration is within 1 minute, consider it a duplicate
      if (existingWorkoutType === additionalData.workoutType && 
          Math.abs(existingDuration - additionalData.durationMinutes) <= 1) {
        console.log('[HealthSync] Duplicate workout detected:', existingWorkoutType, existingDuration, 'vs', additionalData.workoutType, additionalData.durationMinutes);
        return true;
      }
    }
    return false;
  }
  
  return false;
}

/**
 * Sync health data for today
 * 
 * NOTE: Currently allows both manual logs and synced data to coexist.
 * TODO: Consider adding duplicate detection or manual log priority in the future.
 * 
 * Syncs all data from start of today (00:00:00) to now.
 * 
 * Uses a sync lock to prevent concurrent syncs from running simultaneously.
 */
export async function syncHealthData(
  uid: string,
  groupId: string,
  settings: HealthSettings,
): Promise<SyncResult> {
  // If sync is already in progress, return the existing promise
  if (syncInProgress && syncPromise) {
    console.log('[HealthSync] Sync already in progress, returning existing promise');
    return syncPromise;
  }

  // Set sync lock
  syncInProgress = true;
  syncPromise = (async () => {
    const result: SyncResult = {
      workoutsSynced: 0,
      caloriesSynced: false,
      weightSynced: false,
      errors: [],
      diagnostics: {},
    };

    try {
      console.log('[HealthSync] Starting sync...', { uid, groupId, settings });
    
    // Check permissions first
    const permissions = await HealthService.checkHealthPermissions();
    console.log('[HealthSync] Permissions:', permissions);
    
    const platform = require('react-native').Platform.OS;
    console.log('[HealthSync] Platform:', platform);

    // Sync workouts
    if (settings.syncWorkouts && permissions.workouts) {
      console.log('[HealthSync] Syncing workouts...');
      try {
        const workouts = await HealthService.readTodayWorkouts();
        console.log('[HealthSync] Workouts from Health:', workouts.length);
        
        const healthSource = platform === 'ios' ? 'apple_health' : 'google_fit';
        let syncedCount = 0;
        let skippedDuplicates = 0;
        const workoutSummaries = workouts.map((w) => ({
          workoutType: w.workoutType,
          durationMinutes: w.durationMinutes,
          startDate: w.startDate,
          endDate: w.endDate,
        }));

        result.diagnostics!.workouts = {
          hasManualLog: false,
          dataFromHealth: {
            source: healthSource,
            totalCount: workouts.length,
            items: workoutSummaries,
          },
        };
        
        for (const workout of workouts) {
          try {
            // Check if this exact workout already exists from this source today
            const alreadyExists = await hasSyncedLogForToday(
              groupId, 
              uid, 
              'workout', 
              0, // value not used for workouts
              healthSource,
              {
                workoutType: workout.workoutType,
                durationMinutes: workout.durationMinutes,
              }
            );
            
            if (alreadyExists) {
              skippedDuplicates += 1;
              continue;
            }
            
            await addWorkoutLog({
              groupId,
              uid,
              workoutType: workout.workoutType as WorkoutType,
              durationMinutes: workout.durationMinutes,
              date: todayYYYYMMDD(),
              note: `Synced from ${platform === 'ios' ? 'Apple Health' : 'Google Fit'}`,
              source: healthSource,
            });
            syncedCount++;
            result.workoutsSynced++;
            if (syncedCount <= 3) {
              console.log('[HealthSync] Synced workout:', workout.workoutType, workout.durationMinutes, 'minutes');
            }
          } catch (error) {
            console.error('[HealthSync] Failed to sync workout:', error);
            result.errors.push(`Failed to sync workout: ${error}`);
          }
        }
        
        result.diagnostics!.workouts = {
          hasManualLog: false,
          dataFromHealth: {
            source: healthSource,
            totalCount: workouts.length,
            syncedCount,
            skippedDuplicates,
            items: workoutSummaries,
          },
        };

        console.log('[HealthSync] Synced', syncedCount, 'out of', workouts.length, 'workouts');
      } catch (error) {
        console.error('[HealthSync] Failed to read workouts:', error);
        result.errors.push(`Failed to read workouts: ${error}`);
        result.diagnostics!.workouts = {
          hasManualLog: false,
          dataFromHealth: null,
          reason: `Error: ${error}`,
        };
      }
    } else {
      console.log('[HealthSync] Skipping workouts -', { 
        syncEnabled: settings.syncWorkouts, 
        hasPermission: permissions.workouts 
      });
      result.diagnostics!.workouts = {
        hasManualLog: false,
        dataFromHealth: null,
        reason: `Sync disabled (syncEnabled: ${settings.syncWorkouts}, hasPermission: ${permissions.workouts})`,
      };
    }

    // Sync calories
    if (settings.syncCalories && permissions.calories) {
      console.log('[HealthSync] Syncing calories...');
      try {
        // Read individual calorie entries (with meal types)
        console.log('[HealthSync] Calling readTodayCalorieEntries()...');
        const calorieEntries = await HealthService.readTodayCalorieEntries();
        console.log('[HealthSync] Calorie entries from Health:', calorieEntries.length);
        
        // Also get total for diagnostics (fallback)
        const caloriesTotal = await HealthService.readTodayCalories();
        console.log('[HealthSync] Total calories (fallback):', caloriesTotal);
        
        result.diagnostics!.calories = {
          hasManualLog: false, // No longer checking - allowing both manual and synced
          dataFromHealth: {
            entries: calorieEntries,
            entriesDetailed: calorieEntries.map((e) => ({
              calories: e.calories,
              meal: e.meal,
              date: e.date,
              timestamp: e.timestamp,
              source: e.source,
            })),
            total: caloriesTotal,
            entriesCount: calorieEntries.length,
          },
        };
        
        if (calorieEntries.length > 0) {
          // Create a separate log entry for each calorie entry
          let syncedCount = 0;
          const healthSource = platform === 'ios' ? 'apple_health' : 'google_fit';
          let skippedDuplicates = 0;
          
          for (const entry of calorieEntries) {
            try {
              // Check if this exact calorie entry already exists from this source today
              // Must match both calories AND meal type to be considered a duplicate
              const alreadyExists = await hasSyncedLogForToday(
                groupId, 
                uid, 
                'calories', 
                entry.calories, 
                healthSource,
                { meal: entry.meal }
              );
              
              if (alreadyExists) {
                skippedDuplicates += 1;
                continue;
              }
              
              const sourceNote = entry.source 
                ? `Synced from ${platform === 'ios' ? 'Apple Health' : 'Google Fit'} (${entry.source})`
                : `Synced from ${platform === 'ios' ? 'Apple Health' : 'Google Fit'}`;
              
              await addCaloriesLog({
                groupId,
                uid,
                calories: entry.calories,
                meal: entry.meal,
                date: entry.date,
                note: sourceNote,
                source: healthSource,
              });
              syncedCount++;
              if (syncedCount <= 3) {
                console.log('[HealthSync] Synced calorie entry:', entry.calories, 'calories for', entry.meal);
              }
            } catch (error) {
              console.error('[HealthSync] Failed to sync individual calorie entry:', error);
              result.errors.push(`Failed to sync calorie entry: ${error}`);
            }
          }
          
          if (syncedCount > 0) {
            result.caloriesSynced = true;
            console.log('[HealthSync] Synced', syncedCount, 'calorie entries');
          } else {
            result.diagnostics!.calories.reason = 'Failed to sync any entries';
          }

          result.diagnostics!.calories.dataFromHealth = {
            ...result.diagnostics!.calories.dataFromHealth,
            syncedCount,
            skippedDuplicates,
            source: healthSource,
          };
        } else {
          const reason = caloriesTotal === null 
            ? 'No data returned from HealthKit' 
            : caloriesTotal.calories === 0 
              ? 'Calories value is 0' 
              : 'No entries found';
          result.diagnostics!.calories.reason = reason;
          console.log('[HealthSync] No calorie entries to sync -', {
            entriesCount: calorieEntries.length,
            totalCalories: caloriesTotal,
          });
        }
      } catch (error) {
        console.error('[HealthSync] Failed to sync calories:', error);
        result.errors.push(`Failed to sync calories: ${error}`);
        result.diagnostics!.calories!.reason = `Error: ${error}`;
      }
    } else {
      console.log('[HealthSync] Skipping calories -', { 
        syncEnabled: settings.syncCalories, 
        hasPermission: permissions.calories 
      });
      result.diagnostics!.calories = {
        hasManualLog: false,
        dataFromHealth: null,
        reason: `Sync disabled (syncEnabled: ${settings.syncCalories}, hasPermission: ${permissions.calories})`,
      };
    }

    // Sync weight
    if (settings.syncWeight && permissions.weight) {
      console.log('[HealthSync] Syncing weight...');
      try {
        // Always read HealthKit data - manual logs no longer block syncing
        const weight = await HealthService.readTodayWeight();
        console.log('[HealthSync] Weight from Health:', weight);
        console.log('[HealthSync] Weight value:', weight?.weight, 'type:', typeof weight?.weight);
        
        const healthSource = platform === 'ios' ? 'apple_health' : 'google_fit';
        
        result.diagnostics!.weight = {
          hasManualLog: false, // No longer checking - allowing both manual and synced
          dataFromHealth: weight,
        };
        
        if (weight && weight.weight > 0) {
          // Check if this exact weight already exists from this source today
          const alreadyExists = await hasSyncedLogForToday(groupId, uid, 'weight', weight.weight, healthSource);
          
          if (alreadyExists) {
            result.diagnostics!.weight.reason = `Weight ${weight.weight} lb already synced today from ${healthSource}`;
            console.log('[HealthSync] Skipping weight - already exists:', weight.weight);
          } else {
            const res = await addWeightLog({
              groupId,
              uid,
              weight: weight.weight,
              date: todayYYYYMMDD(),
              note: `Synced from ${platform === 'ios' ? 'Apple Health' : 'Google Fit'}`,
              source: healthSource,
            });
            await upsertUserWeightHistoryFromGroupLog({
              uid,
              groupId,
              groupLogId: res.id,
              date: todayYYYYMMDD(),
              weight: weight.weight,
            });
            result.weightSynced = true;
            console.log('[HealthSync] Synced weight:', weight.weight);
          }
        } else {
          const reason = weight === null 
            ? 'No data returned from HealthKit' 
            : weight.weight === 0 
              ? 'Weight value is 0' 
              : 'Unknown reason';
          result.diagnostics!.weight.reason = reason;
          console.log('[HealthSync] No weight to sync -', {
            weight: weight,
            weightValue: weight?.weight,
            isNull: weight === null,
            isZero: weight?.weight === 0,
          });
        }
      } catch (error) {
        console.error('[HealthSync] Failed to sync weight:', error);
        result.errors.push(`Failed to sync weight: ${error}`);
        result.diagnostics!.weight!.reason = `Error: ${error}`;
      }
    } else {
      console.log('[HealthSync] Skipping weight -', { 
        syncEnabled: settings.syncWeight, 
        hasPermission: permissions.weight 
      });
      result.diagnostics!.weight = {
        hasManualLog: false,
        dataFromHealth: null,
        reason: `Sync disabled (syncEnabled: ${settings.syncWeight}, hasPermission: ${permissions.weight})`,
      };
    }
    
    console.log('[HealthSync] Sync complete:', result);
    } catch (error) {
      console.error('[HealthSync] Sync failed:', error);
      result.errors.push(`Sync failed: ${error}`);
    } finally {
      // Release sync lock
      syncInProgress = false;
      syncPromise = null;
    }

    return result;
  })();

  return syncPromise;
}
