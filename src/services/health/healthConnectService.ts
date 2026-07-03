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

function todayWindow() {
  const now = new Date();
  const start = new Date(now);
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

export async function readTodayWorkouts(): Promise<HealthWorkout[]> {
  if (!(await ready())) return [];
  try {
    const { startTime, endTime } = todayWindow();
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

export async function readTodayCalorieEntries(): Promise<HealthCalorieEntry[]> {
  if (!(await ready())) return [];
  try {
    const { startTime, endTime } = todayWindow();
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
  if (!(await ready())) return null;
  try {
    const { startTime, endTime } = todayWindow();
    const res: any = await readRecords('Weight', { timeRangeFilter: { operator: 'between', startTime, endTime } } as any);
    const records: any[] = res?.records ?? [];
    if (records.length === 0) return null;
    // Most recent by time.
    const latest = records.reduce((a, b) => (new Date(b.time).getTime() >= new Date(a.time).getTime() ? b : a));
    const lbs = Number(latest?.weight?.inPounds);
    if (!Number.isFinite(lbs) || lbs <= 0) return null;
    const ts = new Date(latest.time);
    return { weight: Math.round(lbs * 10) / 10, date: todayYYYYMMDD(), timestamp: ts, uuid: latest?.metadata?.id ? String(latest.metadata.id) : undefined };
  } catch (e) {
    console.error('[HealthConnect] readTodayWeight failed:', e);
    return null;
  }
}
