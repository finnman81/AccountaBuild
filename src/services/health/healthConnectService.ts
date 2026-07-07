import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  getSdkStatus,
  initialize,
  requestPermission,
  getGrantedPermissions,
  readRecords,
  SdkAvailabilityStatus,
  ExerciseType,
  MealType,
} from 'react-native-health-connect';

import { formatYYYYMMDDLocal, todayYYYYMMDD } from '../../utils/dates';

export type HealthWorkout = { workoutType: string; durationMinutes: number; startDate: Date; endDate: Date; uuid?: string };
export type HealthCalorieEntry = { calories: number; date: string; meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'all'; timestamp: Date; source?: string; uuid?: string };
export type HealthWeight = { weight: number; date: string; timestamp: Date; uuid?: string };
export type HealthCalories = { calories: number; date: string };

const isExpoGo = Constants.appOwnership === 'expo';

// Map Health Connect exercise-type ints (via the lib's ExerciseType constants) to our WorkoutType strings.
const EX = ExerciseType as Record<string, number>;
const WORKOUT_MAP: Array<[number | undefined, string]> = [
  [EX.RUNNING, 'running'], [EX.RUNNING_TREADMILL, 'running'],
  [EX.WALKING, 'walking'], [EX.HIKING, 'ruck'],
  [EX.BIKING, 'bike'], [EX.BIKING_STATIONARY, 'bike'],
  [EX.SWIMMING_POOL, 'swim'], [EX.SWIMMING_OPEN_WATER, 'swim'],
  [EX.STRENGTH_TRAINING, 'weightLifting'], [EX.WEIGHTLIFTING, 'weightLifting'],
  [EX.ELLIPTICAL, 'elliptical'],
  [EX.ROWING, 'rowing'], [EX.ROWING_MACHINE, 'rowing'],
  [EX.YOGA, 'yoga'], [EX.PILATES, 'pilates'], [EX.STRETCHING, 'stretching'],
  [EX.STAIR_CLIMBING, 'stairMaster'], [EX.STAIR_CLIMBING_MACHINE, 'stairMaster'],
  [EX.HIGH_INTENSITY_INTERVAL_TRAINING, 'hiit'],
];
function mapExerciseType(t: number | undefined): string {
  const hit = WORKOUT_MAP.find(([code]) => code != null && code === t);
  return hit ? hit[1] : 'weightLifting';
}

function inferMealFromTime(d: Date): HealthCalorieEntry['meal'] {
  const h = d.getHours();
  if (h >= 5 && h < 10) return 'breakfast';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}
const ML = MealType as Record<string, number>;
function mapMeal(mealType: number | undefined, ts: Date): HealthCalorieEntry['meal'] {
  if (mealType === ML.BREAKFAST) return 'breakfast';
  if (mealType === ML.LUNCH) return 'lunch';
  if (mealType === ML.DINNER) return 'dinner';
  if (mealType === ML.SNACK) return 'snack';
  return inferMealFromTime(ts);
}

const READ_PERMS = [
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'Nutrition' },
  { accessType: 'read', recordType: 'Weight' },
] as const;

function readWindow(daysBack = 0) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - Math.max(0, daysBack));
  start.setHours(0, 0, 0, 0);
  return { startTime: start.toISOString(), endTime: now.toISOString(), start, now };
}

/** Ensure the Health Connect SDK is available + initialized. Returns false in Expo Go / non-Android. */
async function ready(): Promise<boolean> {
  if (Platform.OS !== 'android' || isExpoGo) return false;
  try {
    const status = await getSdkStatus();
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) return false;
    return await initialize();
  } catch (e) {
    console.error('[HealthConnect] init failed:', e);
    return false;
  }
}

export async function isGoogleFitAvailable(): Promise<boolean> {
  return ready();
}

export async function requestGoogleFitPermissions(): Promise<boolean> {
  if (!(await ready())) return false;
  try {
    const granted = await requestPermission(READ_PERMS as any);
    return Array.isArray(granted) && granted.length > 0;
  } catch (e) {
    console.error('[HealthConnect] requestPermission failed:', e);
    return false;
  }
}

export async function checkGoogleFitPermissions(): Promise<{ workouts: boolean; calories: boolean; weight: boolean }> {
  if (!(await ready())) return { workouts: false, calories: false, weight: false };
  try {
    const granted = (await getGrantedPermissions()) as Array<{ accessType: string; recordType: string }>;
    const has = (rt: string) => granted.some((p) => p.recordType === rt && p.accessType === 'read');
    return { workouts: has('ExerciseSession'), calories: has('Nutrition'), weight: has('Weight') };
  } catch {
    return { workouts: false, calories: false, weight: false };
  }
}

export async function readTodayWorkouts(daysBack = 0): Promise<HealthWorkout[]> {
  if (!(await ready())) return [];
  try {
    const { startTime, endTime } = readWindow(daysBack);
    const res: any = await readRecords('ExerciseSession', { timeRangeFilter: { operator: 'between', startTime, endTime } } as any);
    const records: any[] = res?.records ?? [];
    return records
      .map((r) => {
        const start = new Date(r.startTime);
        const end = new Date(r.endTime);
        const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
        return { workoutType: mapExerciseType(r.exerciseType), durationMinutes, startDate: start, endDate: end, uuid: r?.metadata?.id ? String(r.metadata.id) : undefined };
      })
      .filter((w) => Number.isFinite(w.durationMinutes) && w.durationMinutes > 0);
  } catch (e) {
    console.error('[HealthConnect] readTodayWorkouts failed:', e);
    return [];
  }
}

/** Alias for windowed workout reads (matches the HealthKit service surface). */
export async function readRecentWorkouts(daysBack = 7): Promise<HealthWorkout[]> {
  return readTodayWorkouts(daysBack);
}

export async function readTodayCalorieEntries(daysBack = 0): Promise<HealthCalorieEntry[]> {
  if (!(await ready())) return [];
  try {
    const { startTime, endTime } = readWindow(daysBack);
    const res: any = await readRecords('Nutrition', { timeRangeFilter: { operator: 'between', startTime, endTime } } as any);
    const records: any[] = res?.records ?? [];
    const entries: HealthCalorieEntry[] = [];
    for (const r of records) {
      const kcal = Math.round(Number(r?.energy?.inKilocalories) || 0);
      if (kcal <= 0) continue;
      const ts = new Date(r.startTime ?? r.endTime);
      entries.push({
        calories: kcal,
        date: formatYYYYMMDDLocal(ts),
        meal: mapMeal(r?.mealType, ts),
        timestamp: ts,
        source: r?.metadata?.dataOrigin ?? undefined,
        uuid: r?.metadata?.id ? String(r.metadata.id) : undefined,
      });
    }
    return entries;
  } catch (e) {
    console.error('[HealthConnect] readTodayCalorieEntries failed:', e);
    return [];
  }
}

export async function readTodayCalories(): Promise<HealthCalories | null> {
  const entries = await readTodayCalorieEntries();
  if (entries.length === 0) return null;
  return { calories: entries.reduce((s, e) => s + e.calories, 0), date: todayYYYYMMDD() };
}

export async function readTodayWeight(): Promise<HealthWeight | null> {
  const recent = await readRecentWeights(0);
  if (recent.length === 0) return null;
  return recent.reduce((a, b) => (b.timestamp.getTime() >= a.timestamp.getTime() ? b : a));
}

/** Weight entries for the last `daysBack` days — latest sample per local day (sync backfill). */
export async function readRecentWeights(daysBack = 7): Promise<HealthWeight[]> {
  if (!(await ready())) return [];
  try {
    const { startTime, endTime } = readWindow(daysBack);
    const res: any = await readRecords('Weight', { timeRangeFilter: { operator: 'between', startTime, endTime } } as any);
    const records: any[] = res?.records ?? [];
    const byDate = new Map<string, HealthWeight>();
    for (const r of records) {
      const lbs = Number(r?.weight?.inPounds);
      if (!Number.isFinite(lbs) || lbs <= 0) continue;
      const ts = new Date(r.time);
      if (Number.isNaN(ts.valueOf())) continue;
      const date = formatYYYYMMDDLocal(ts);
      const prev = byDate.get(date);
      if (!prev || ts.getTime() >= prev.timestamp.getTime()) {
        byDate.set(date, { weight: Math.round(lbs * 10) / 10, date, timestamp: ts, uuid: r?.metadata?.id ? String(r.metadata.id) : undefined });
      }
    }
    return Array.from(byDate.values());
  } catch (e) {
    console.error('[HealthConnect] readRecentWeights failed:', e);
    return [];
  }
}
