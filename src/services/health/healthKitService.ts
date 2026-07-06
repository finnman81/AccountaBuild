import { Platform } from 'react-native';
import {
  requestAuthorization,
  queryWorkoutSamples,
  queryWorkoutSamplesWithAnchor,
  queryQuantitySamples,
  queryQuantitySamplesWithAnchor,
  queryCorrelationSamples,
  queryStatisticsForQuantitySeparateBySource,
  querySources,
  queryStatisticsForQuantity,
  getMostRecentQuantitySample,
  isHealthDataAvailable,
  enableBackgroundDelivery,
  subscribeToChanges,
  UpdateFrequency,
} from '@kingstinct/react-native-healthkit';
import { mapHealthKitWorkoutType } from './workoutMapper';
import { WorkoutType } from '../logs';
import { formatYYYYMMDDLocal, todayYYYYMMDD } from '../../utils/dates';

export type HealthKitWorkout = {
  workoutType: WorkoutType;
  durationMinutes: number;
  startDate: Date;
  endDate: Date;
  uuid?: string;
};

export type HealthKitCalories = {
  calories: number; // Total dietary energy consumed for today
  date: string; // YYYY-MM-DD
};

export type HealthKitCalorieEntry = {
  calories: number;
  date: string; // YYYY-MM-DD
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'all'; // Inferred or from metadata
  timestamp: Date; // When the entry was recorded
  source?: string; // Source app name if available
  uuid?: string;
};

export type HealthKitWeight = {
  weight: number; // in pounds
  date: string; // YYYY-MM-DD
  timestamp: Date;
  uuid?: string;
};

function coerceNumber(value: any): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function deriveWorkoutDurationMinutes(workout: any): number {
  const durationSeconds = coerceNumber(workout?.duration) ||
    coerceNumber(workout?.durationSeconds) ||
    coerceNumber(workout?.totalDuration) ||
    coerceNumber(workout?.totalDurationSeconds) ||
    coerceNumber(workout?.duration?.quantity) ||
    coerceNumber(workout?.duration?.value);

  if (durationSeconds > 0) {
    return Math.max(1, Math.round(durationSeconds / 60));
  }

  const durationMinutes = coerceNumber(workout?.durationMinutes) ||
    coerceNumber(workout?.totalDurationMinutes);

  if (durationMinutes > 0) {
    return Math.max(1, Math.round(durationMinutes));
  }

  return 0;
}

function summarizeCalorieSample(sample: any) {
  return {
    quantity: sample?.quantity ?? sample?.value ?? sample?.quantityValue ?? null,
    unit: sample?.unit ?? sample?.quantityUnit ?? null,
    startDate: sample?.startDate ?? sample?.startTime ?? null,
    source: sample?.source?.name ?? sample?.sourceRevision?.source?.name ?? sample?.sourceName ?? null,
    metadataKeys: sample?.metadata ? Object.keys(sample.metadata).slice(0, 10) : [],
  };
}

// HealthKit type identifiers as strings (matching Apple's HealthKit constants)
const HKWorkoutTypeIdentifier = 'HKWorkoutTypeIdentifier';
const HKQuantityTypeIdentifierDietaryEnergyConsumed = 'HKQuantityTypeIdentifierDietaryEnergyConsumed';
const HKQuantityTypeIdentifierBodyMass = 'HKQuantityTypeIdentifierBodyMass';
const HKCorrelationTypeIdentifierFood = 'HKCorrelationTypeIdentifierFood';

// NOTE:
// We intentionally do NOT request the Food correlation type during the permission prompt.
// Some iOS versions/devices can throw an Objective‑C exception when requesting correlation
// types (the native module may not catch it), which would crash the app at auth time.
// For calories we request the Dietary Energy quantity type; correlation reads are attempted
// later on a best-effort basis and are already wrapped in try/catch.
const READ_TYPES = [
  HKWorkoutTypeIdentifier,
  HKQuantityTypeIdentifierDietaryEnergyConsumed,
  HKQuantityTypeIdentifierBodyMass,
] as const;

/**
 * Check if HealthKit is available on this device
 */
export async function isHealthKitAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    console.log('HealthKit: Not iOS platform');
    return false;
  }
  try {
    const available = await isHealthDataAvailable();
    console.log('HealthKit: isHealthDataAvailable =', available);
    return available;
  } catch (error) {
    console.error('HealthKit: Error checking availability:', error);
    return false;
  }
}

/**
 * Request HealthKit permissions for the data types we need
 */
export async function requestHealthKitPermissions(): Promise<{
  success: boolean;
  dialogShown: boolean;
  error?: string;
}> {
  if (Platform.OS !== 'ios') {
    return { success: false, dialogShown: false, error: 'Not on iOS' };
  }

  try {
    const available = await isHealthDataAvailable();
    if (!available) {
      return {
        success: false,
        dialogShown: false,
        error: 'HealthKit not available on this device',
      };
    }

    console.log('Requesting HealthKit permissions...');

    // IMPORTANT: HealthKit queries can crash if you query without having requested auth first
    // so we always request here before any reads.
    await requestAuthorization({ toRead: READ_TYPES });

    console.log('HealthKit requestAuthorization completed');

    return { success: true, dialogShown: true };
  } catch (e: any) {
    console.error('Error requesting HealthKit permissions:', e);
    return {
      success: false,
      dialogShown: false,
      error: e?.message ?? 'Failed to request HealthKit permissions',
    };
  }
}

/**
 * Check if HealthKit permissions are granted
 * Best-effort permission checks: we treat "can query without throwing" as "available"
 */
export async function checkHealthKitPermissions(): Promise<{
  workouts: boolean;
  calories: boolean;
  weight: boolean;
}> {
  if (Platform.OS !== 'ios') {
    return { workouts: false, calories: false, weight: false };
  }

  if (!(await isHealthDataAvailable())) {
    return { workouts: false, calories: false, weight: false };
  }

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

    // Try to query workouts (this will fail if permissions not granted)
    const workouts = await (async () => {
      try {
        // Try with different possible API signatures
        const result: any = await queryWorkoutSamples({
          startDate: startOfToday,
          endDate: now,
          limit: 1,
        } as any);
        return true;
      } catch (err: any) {
        console.error('[HealthKit] Permission probe (workouts) failed:', err);
        return false;
      }
    })();

    // Try to query calories
    const calories = await (async () => {
      try {
        const result: any = await queryQuantitySamples(HKQuantityTypeIdentifierDietaryEnergyConsumed, {
          startDate: startOfToday,
          endDate: now,
          limit: 1,
        } as any);
        return true;
      } catch (err: any) {
        console.error('[HealthKit] Permission probe (calories) failed:', err);
        return false;
      }
    })();

  // Try to get most recent weight sample
  const weight = await (async () => {
    try {
      await getMostRecentQuantitySample(HKQuantityTypeIdentifierBodyMass);
      return true;
    } catch (err: any) {
      console.error('[HealthKit] Permission probe (weight) failed:', err);
      return false;
    }
  })();

  return { workouts, calories, weight };
}

/**
 * Map a single HealthKit workout sample/proxy to our HealthKitWorkout shape.
 * Returns null if the activity type can't be mapped. Shared by the today-window
 * read and the anchored (delta) read so both classify workouts identically.
 */
export function mapWorkoutSample(w: any): HealthKitWorkout | null {
  // Enhanced workout type detection using multiple signals
  let workoutType = mapHealthKitWorkoutType(w.workoutActivityType);

  // Special handling for ambiguous type 52 (can be Walking OR TraditionalStrengthTraining)
  const rawType = w.workoutActivityType;
  if (rawType === 52 || rawType === '52') {
    // Check for distance - strength training typically doesn't have distance
    const distance = w.totalDistance || w.distance || w.totalDistanceValue;
    const hasDistance = distance && typeof distance === 'number' && distance > 0;

    // Check source app
    const sourceName = (w.source?.name || w.sourceRevision?.source?.name || w.sourceName || '').toLowerCase();
    const isStrengthApp = sourceName.includes('strong') || sourceName.includes('jefit') ||
                         sourceName.includes('gym') || sourceName.includes('weight');

    // Check metadata
    const metadata = w.metadata || {};
    const metadataType = String(metadata.HKWorkoutActivityType || metadata.workoutType || '').toLowerCase();

    if (hasDistance || metadataType.includes('walk') || metadataType.includes('run')) {
      // Has distance or metadata suggests walking/running
      workoutType = 'jogging';
      console.log('[HealthKit] Resolved ambiguous type 52 to jogging (has distance or walk/run metadata)');
    } else if (isStrengthApp || metadataType.includes('strength') || metadataType.includes('weight')) {
      // Source or metadata suggests strength training
      workoutType = 'weightLifting';
      console.log('[HealthKit] Resolved ambiguous type 52 to weightLifting (strength app/metadata)');
    }
    // Otherwise keep as jogging (default for 52)
  }

  // If we got weightLifting as default, try to infer from metadata/distance
  if (workoutType === 'weightLifting') {
    // Check for distance data - running/jogging typically have distance
    const distance = w.totalDistance || w.distance || w.totalDistanceValue;
    const hasDistance = distance && typeof distance === 'number' && distance > 0;

    // Check source app name for clues
    const sourceName = (w.source?.name || w.sourceRevision?.source?.name || w.sourceName || '').toLowerCase();
    const isRunningApp = sourceName.includes('runna') || sourceName.includes('nike') ||
                        sourceName.includes('strava') || sourceName.includes('runkeeper') ||
                        sourceName.includes('runtastic') || sourceName.includes('garmin');

    // Check metadata for workout type hints
    const metadata = w.metadata || {};
    const metadataType = String(metadata.HKWorkoutActivityType || metadata.workoutType || '').toLowerCase();

    // If we have distance and it's from a running app, it's likely running/jogging
    if (hasDistance && (isRunningApp || metadataType.includes('run'))) {
      // Determine running vs jogging based on pace (if available)
      const durationSeconds = deriveWorkoutDurationMinutes(w) * 60;
      const pace = durationSeconds > 0 && distance > 0 ? (durationSeconds / 60) / (distance / 1609.34) : null; // minutes per mile
      // If pace is reasonable for running (< 12 min/mile), classify as running
      // Otherwise, classify as jogging
      workoutType = (pace && pace < 12) ? 'running' : 'jogging';
      console.log('[HealthKit] Inferred workout type from distance/source:', {
        originalType: w.workoutActivityType,
        inferredType: workoutType,
        distance,
        sourceName,
        pace,
      });
    } else if (hasDistance && !isRunningApp) {
      // Has distance but not from running app - could still be running/jogging
      workoutType = 'jogging'; // Default to jogging for unknown distance-based workouts
      console.log('[HealthKit] Inferred jogging from distance:', {
        originalType: w.workoutActivityType,
        distance,
        sourceName,
      });
    }
  }

  if (!workoutType) return null;

  const durationMinutes = deriveWorkoutDurationMinutes(w);

  const startDate = w.startDate instanceof Date ? w.startDate : new Date(w.startDate);
  const endDate = w.endDate instanceof Date ? w.endDate : new Date(w.endDate);

  return {
    workoutType,
    durationMinutes,
    startDate,
    endDate,
    uuid: w.uuid ? String(w.uuid) : undefined,
  };
}

/**
 * Read workouts for today
 */
export async function readTodayWorkouts(): Promise<HealthKitWorkout[]> {
  if (Platform.OS !== 'ios') return [];
  if (!(await isHealthKitAvailable())) return [];

  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const result: any = await queryWorkoutSamples({
      startDate: startOfToday,
      endDate: now,
      ascending: true,
      limit: 0,
    } as any);

    // Handle both array response and object with samples property
    const workouts = Array.isArray(result) ? result : (result?.samples || []);

    return workouts
      .map(mapWorkoutSample)
      .filter((w: HealthKitWorkout | null): w is HealthKitWorkout => w !== null)
      .filter((w: HealthKitWorkout) => w.startDate >= startOfToday && w.startDate <= now);
  } catch (error) {
    console.error('Error reading HealthKit workouts:', error);
    return [];
  }
}

export type AnchoredResult<T> = { items: T[]; deletedUuids: string[]; newAnchor?: string };

/**
 * Delta read of workouts since `anchor` (undefined = first run, returns full
 * history — the caller date-bounds imports via isRecentImportDate). Returns the
 * new/changed workouts, the uuids of workouts deleted in Health, and the next
 * anchor to persist.
 */
export async function readWorkoutsSinceAnchor(anchor?: string): Promise<AnchoredResult<HealthKitWorkout>> {
  if (Platform.OS !== 'ios') return { items: [], deletedUuids: [] };
  if (!(await isHealthKitAvailable())) return { items: [], deletedUuids: [] };

  try {
    const res: any = await queryWorkoutSamplesWithAnchor({ limit: 0, anchor } as any);
    const rawWorkouts = Array.isArray(res?.workouts) ? res.workouts : [];
    const items = rawWorkouts
      .map(mapWorkoutSample)
      .filter((w: HealthKitWorkout | null): w is HealthKitWorkout => w !== null);
    const deletedUuids = (Array.isArray(res?.deletedSamples) ? res.deletedSamples : [])
      .map((d: any) => (d?.uuid ? String(d.uuid) : ''))
      .filter(Boolean);
    return { items, deletedUuids, newAnchor: res?.newAnchor ? String(res.newAnchor) : undefined };
  } catch (error) {
    console.error('[HealthKit] Error reading workouts since anchor:', error);
    return { items: [], deletedUuids: [] };
  }
}

/**
 * Infer meal type from time of day
 */
function inferMealTypeFromTime(date: Date): 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'all' {
  const hour = date.getHours();
  // Breakfast: 5am - 10am
  if (hour >= 5 && hour < 10) return 'breakfast';
  // Lunch: 11am - 3pm
  if (hour >= 11 && hour < 15) return 'lunch';
  // Dinner: 5pm - 10pm
  if (hour >= 17 && hour < 22) return 'dinner';
  // Snack: everything else
  return 'snack';
}

/**
 * Extract meal type from HealthKit metadata
 */
function extractMealType(sample: any): 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'all' {
  const metadata = sample.metadata || {};
  
  // Check for custom meal type metadata (common keys used by apps)
  const mealType =
    metadata.Meal ||
    metadata.MealType ||
    metadata.meal ||
    metadata.mealType ||
    metadata['HKFoodMeal'];
  if (mealType) {
    const mealLower = String(mealType).toLowerCase();
    if (mealLower.includes('breakfast')) return 'breakfast';
    if (mealLower.includes('lunch')) return 'lunch';
    if (mealLower.includes('dinner') || mealLower.includes('supper')) return 'dinner';
    if (mealLower.includes('snack')) return 'snack';
  }
  
  // Infer from time if no metadata
  const startDate = sample.startDate ? new Date(sample.startDate) : new Date();
  return inferMealTypeFromTime(startDate);
}

/**
 * Map a single dietary-energy quantity sample to a calorie entry (dated by the
 * sample's own start time). Returns null for zero/invalid quantities. No window
 * filtering — callers apply their own date bounds. Shared by the today read and
 * the anchored (delta) read.
 */
export function mapDietaryEnergySample(sample: any): HealthKitCalorieEntry | null {
  let qty = 0;
  if (typeof sample.quantity === 'number') {
    qty = sample.quantity;
  } else if (typeof sample.value === 'number') {
    qty = sample.value;
  } else if (typeof sample.quantity?.quantity === 'number') {
    qty = sample.quantity.quantity;
  } else if (typeof sample.quantity?.value === 'number') {
    qty = sample.quantity.value;
  } else if (sample.quantityValue && typeof sample.quantityValue === 'number') {
    qty = sample.quantityValue;
  }

  if (qty <= 0) return null;

  const startDate = sample.startDate ? new Date(sample.startDate) : (sample.startTime ? new Date(sample.startTime) : new Date());
  if (Number.isNaN(startDate.valueOf())) return null;

  const meal = extractMealType(sample);
  const source = sample.source?.name || sample.sourceRevision?.source?.name || sample.sourceName || undefined;

  return {
    calories: Math.round(qty),
    date: formatYYYYMMDDLocal(startDate),
    meal,
    timestamp: startDate,
    source,
    uuid: sample.uuid ? String(sample.uuid) : undefined,
  };
}

/**
 * Delta read of dietary-energy entries since `anchor` (undefined = first run,
 * full history — caller date-bounds via isRecentImportDate). Returns new/changed
 * entries, uuids deleted in Health, and the next anchor to persist.
 *
 * Note: only individual dietary-energy samples participate in anchored sync.
 * The food-correlation and daily-statistics fallbacks (used when no per-sample
 * data exists) have no stable sample UUID/anchor and stay on the today read.
 */
export async function readCalorieEntriesSinceAnchor(anchor?: string): Promise<AnchoredResult<HealthKitCalorieEntry>> {
  if (Platform.OS !== 'ios') return { items: [], deletedUuids: [] };
  if (!(await isHealthKitAvailable())) return { items: [], deletedUuids: [] };

  try {
    const res: any = await queryQuantitySamplesWithAnchor(HKQuantityTypeIdentifierDietaryEnergyConsumed, {
      limit: 0,
      anchor,
      unit: 'kcal',
    } as any);
    const rawSamples = Array.isArray(res?.samples) ? res.samples : [];
    const items = rawSamples
      .map(mapDietaryEnergySample)
      .filter((e: HealthKitCalorieEntry | null): e is HealthKitCalorieEntry => e !== null);
    const deletedUuids = (Array.isArray(res?.deletedSamples) ? res.deletedSamples : [])
      .map((d: any) => (d?.uuid ? String(d.uuid) : ''))
      .filter(Boolean);
    return { items, deletedUuids, newAnchor: res?.newAnchor ? String(res.newAnchor) : undefined };
  } catch (error) {
    console.error('[HealthKit] Error reading calories since anchor:', error);
    return { items: [], deletedUuids: [] };
  }
}

/**
 * Read individual dietary energy entries for today (not summed)
 */
export async function readTodayCalorieEntries(): Promise<HealthKitCalorieEntry[]> {
  if (Platform.OS !== 'ios') return [];
  if (!(await isHealthKitAvailable())) return [];

  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    console.log('[HealthKit] Reading calorie entries from', startOfToday, 'to', now);

    let result: any = await queryQuantitySamples(HKQuantityTypeIdentifierDietaryEnergyConsumed, {
      startDate: startOfToday,
      endDate: now,
      ascending: true,
      unit: 'kcal',
      limit: 0,
    } as any);

    // If kcal query returned nothing, try alternate energy units
    const kcalSamples = Array.isArray(result) ? result : (result?.samples || []);
    if (kcalSamples.length === 0) {
      result = await queryQuantitySamples(HKQuantityTypeIdentifierDietaryEnergyConsumed, {
        startDate: startOfToday,
        endDate: now,
        ascending: true,
        unit: 'Cal',
        limit: 0,
      } as any);
    }

    // Handle both array response and object with samples property
    let samples = Array.isArray(result) ? result : (result?.samples || []);
    console.log('[HealthKit] Processed samples count:', samples.length);

    // Guard against HealthKit returning samples outside the requested window.
    samples = samples.filter((sample: any) => {
      const sampleDate = sample?.startDate ? new Date(sample.startDate) : null;
      if (!sampleDate || Number.isNaN(sampleDate.valueOf())) return false;
      return sampleDate >= startOfToday && sampleDate <= now;
    });

    if (samples.length === 0) {
      console.log('[HealthKit] No calorie samples found for today - trying food correlations...');

      try {
        const correlations = await queryCorrelationSamples(HKCorrelationTypeIdentifierFood, {
          startDate: startOfToday,
          endDate: now,
          ascending: true,
          limit: 0,
        } as any);

        console.log('[HealthKit] Food correlations count:', correlations.length);

        const entries: HealthKitCalorieEntry[] = [];
        const today = todayYYYYMMDD();

        for (let i = 0; i < correlations.length; i++) {
          const corr = correlations[i];
          const objects = Array.isArray(corr?.objects) ? corr.objects : [];
          const corrStart = corr?.startDate ? new Date(corr.startDate) : new Date();
          if (corrStart < startOfToday || corrStart > now) continue;

          const corrAny = corr as any;
          for (const obj of objects) {
            if (obj?.quantityType !== HKQuantityTypeIdentifierDietaryEnergyConsumed) continue;
            const qty = typeof obj.quantity === 'number' ? obj.quantity : 0;
            if (qty <= 0) continue;

            const meal = extractMealType(corr) ?? extractMealType(obj);
            const source =
              corrAny?.source?.name ||
              corrAny?.sourceRevision?.source?.name ||
              obj?.source?.name ||
              obj?.sourceRevision?.source?.name ||
              undefined;

            entries.push({
              calories: Math.round(qty),
              date: today,
              meal,
              timestamp: corrStart,
              source,
            });
          }
        }

        if (entries.length > 0) {
          console.log('[HealthKit] Returning', entries.length, 'entries from food correlations');
          return entries;
        }
      } catch (corrError) {
        console.error('[HealthKit] Error reading food correlations:', corrError);
      }
    }

    if (samples.length === 0) {
      console.log('[HealthKit] No calorie samples or correlations found - trying daily statistics...');
      try {
        const stats: any = await queryStatisticsForQuantity(
          HKQuantityTypeIdentifierDietaryEnergyConsumed,
          ['cumulativeSum'],
          {
            filter: { date: { startDate: startOfToday, endDate: now } },
            unit: 'kcal',
          } as any,
        );
        const total = stats?.sumQuantity?.quantity ?? 0;
        if (total > 0) {
          console.log('[HealthKit] Using statistics sumQuantity:', total);
          return [
            {
              calories: Math.round(total),
              date: todayYYYYMMDD(),
              meal: 'all',
              timestamp: now,
              source: stats?.sources?.[0]?.name,
            },
          ];
        }
      } catch (statsError) {
        console.error('[HealthKit] Error reading calorie statistics:', statsError);
      }
    }

    // Log a small preview to understand structure without overwhelming logs
    if (samples.length > 0) {
      const preview = samples.slice(0, 3).map(summarizeCalorieSample);
      console.log('[HealthKit] Sample preview:', preview);
    }

    // Convert each sample to an entry (today-window only)
    const entries: HealthKitCalorieEntry[] = [];

    console.log('[HealthKit] Processing', samples.length, 'samples into entries...');
    for (let i = 0; i < samples.length; i++) {
      const entry = mapDietaryEnergySample(samples[i]);
      if (!entry) continue;
      // Keep only samples in today's window (guard against out-of-range reads).
      if (entry.timestamp < startOfToday || entry.timestamp > now) continue;
      entries.push(entry);
    }

    console.log('[HealthKit] Returning', entries.length, 'calorie entries out of', samples.length, 'samples');
    if (entries.length === 0 && samples.length > 0) {
      console.warn('[HealthKit] WARNING: Had samples but created no entries. Check quantity extraction logic.');
    }
    return entries;
  } catch (error) {
    console.error('[HealthKit] Error reading calorie entries:', error);
    return [];
  }
}

/**
 * Read total dietary energy (calories consumed) for today
 * @deprecated Use readTodayCalorieEntries() for individual entries with meal types
 */
export async function readTodayCalories(): Promise<HealthKitCalories | null> {
  const entries = await readTodayCalorieEntries();
  if (entries.length === 0) return null;

  const totalCalories = entries.reduce((sum, e) => sum + e.calories, 0);
  return {
    calories: totalCalories,
    date: todayYYYYMMDD(),
  };
}

export async function readCalorieDiagnostics(): Promise<{
  sources: any[];
  statsBySource: any[];
}> {
  if (Platform.OS !== 'ios') return { sources: [], statsBySource: [] };
  if (!(await isHealthKitAvailable())) return { sources: [], statsBySource: [] };

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  try {
    const sources = await querySources(HKQuantityTypeIdentifierDietaryEnergyConsumed);
    const statsBySource = await queryStatisticsForQuantitySeparateBySource(
      HKQuantityTypeIdentifierDietaryEnergyConsumed,
      ['cumulativeSum'],
      {
        filter: { date: { startDate: startOfToday, endDate: now } },
        unit: 'kcal',
      } as any,
    );
    return { sources: Array.from(sources), statsBySource: Array.from(statsBySource) };
  } catch (error) {
    console.error('[HealthKit] Error reading calorie diagnostics:', error);
    return { sources: [], statsBySource: [] };
  }
}

export async function readWorkoutDiagnostics(): Promise<{
  sources: any[];
}> {
  if (Platform.OS !== 'ios') return { sources: [] };
  if (!(await isHealthKitAvailable())) return { sources: [] };
  try {
    const sources = await querySources(HKWorkoutTypeIdentifier);
    return { sources: Array.from(sources) };
  } catch (error) {
    console.error('[HealthKit] Error reading workout diagnostics:', error);
    return { sources: [] };
  }
}

/**
 * Read most recent weight entry for today
 */
export async function readTodayWeight(): Promise<HealthKitWeight | null> {
  if (Platform.OS !== 'ios') return null;
  if (!(await isHealthKitAvailable())) return null;

  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    // Get most recent weight sample
    const sample: any = await getMostRecentQuantitySample(HKQuantityTypeIdentifierBodyMass);

    if (!sample) return null;

    const sampleDate = sample.startDate instanceof Date ? sample.startDate : new Date(sample.startDate);
    
    // Only return if it's from today
    if (sampleDate < startOfToday) return null;

    const qty = typeof sample.quantity === 'number' ? sample.quantity : null;
    if (qty == null || qty <= 0) return null;

    // If it comes back in kg, convert to lbs
    const unit = String(sample.unit ?? '').toLowerCase();
    let weightInPounds = qty;
    if (unit === 'kg' || unit.includes('kilogram')) {
      weightInPounds = qty * 2.2046226218;
    }

    return {
      weight: Math.round(weightInPounds * 10) / 10, // Round to 1 decimal place
      date: todayYYYYMMDD(),
      timestamp: sampleDate,
      uuid: sample.uuid ? String(sample.uuid) : undefined,
    };
  } catch (error) {
    console.error('Error reading HealthKit weight:', error);
    return null;
  }
}

/**
 * Read weight entries for the last `daysBack` days — the latest sample per local
 * day (used by sync backfill so unopened-app days still get their weigh-ins).
 */
export async function readRecentWeights(daysBack = 7): Promise<HealthKitWeight[]> {
  if (Platform.OS !== 'ios') return [];
  if (!(await isHealthKitAvailable())) return [];

  try {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - daysBack);
    start.setHours(0, 0, 0, 0);

    const result: any = await queryQuantitySamples(HKQuantityTypeIdentifierBodyMass, {
      startDate: start,
      endDate: now,
      ascending: true,
      limit: 0,
    } as any);
    const samples: any[] = Array.isArray(result) ? result : (result?.samples ?? []);

    const byDate = new Map<string, HealthKitWeight>();
    for (const sample of samples) {
      const qty = typeof sample.quantity === 'number' ? sample.quantity : null;
      if (qty == null || qty <= 0) continue;
      const ts = sample.startDate instanceof Date ? sample.startDate : new Date(sample.startDate);
      if (Number.isNaN(ts.valueOf())) continue;
      const unit = String(sample.unit ?? '').toLowerCase();
      const lbs = unit === 'kg' || unit.includes('kilogram') ? qty * 2.2046226218 : qty;
      const date = formatYYYYMMDDLocal(ts);
      const prev = byDate.get(date);
      if (!prev || ts.getTime() >= prev.timestamp.getTime()) {
        byDate.set(date, {
          weight: Math.round(lbs * 10) / 10,
          date,
          timestamp: ts,
          uuid: sample.uuid ? String(sample.uuid) : undefined,
        });
      }
    }
    return Array.from(byDate.values());
  } catch (error) {
    console.error('[HealthKit] Error reading recent weights:', error);
    return [];
  }
}

/**
 * Enable HealthKit background delivery + change observers so new workouts /
 * calories / weight trigger a near-instant sync (Strava-style), even when the
 * app is backgrounded. `onChange` is fired when HealthKit signals new data.
 * Returns a cleanup that removes the observers. iOS-only; fully guarded.
 */
export async function setupBackgroundObservers(onChange: () => void): Promise<() => void> {
  if (Platform.OS !== 'ios') return () => {};
  const types = [
    HKWorkoutTypeIdentifier,
    HKQuantityTypeIdentifierDietaryEnergyConsumed,
    HKQuantityTypeIdentifierBodyMass,
  ];
  const subs: Array<{ remove: () => boolean }> = [];
  for (const t of types) {
    try {
      await enableBackgroundDelivery(t as any, UpdateFrequency.immediate);
    } catch (e) {
      console.warn('[HealthKit] enableBackgroundDelivery failed for', t, e);
    }
    try {
      subs.push(subscribeToChanges(t as any, () => {
        try {
          onChange();
        } catch {
          /* non-fatal */
        }
      }));
    } catch (e) {
      console.warn('[HealthKit] subscribeToChanges failed for', t, e);
    }
  }
  return () => {
    for (const s of subs) {
      try {
        s.remove();
      } catch {
        /* non-fatal */
      }
    }
  };
}

/**
 * Run comprehensive HealthKit diagnostics
 * Returns a detailed diagnostic report as a string
 */
export async function runHealthKitDiagnostics(): Promise<string> {
  const out: string[] = [];
  const timestamp = new Date().toISOString();
  const maxSamplesToInclude = 50;
  
  out.push('=== HealthKit Diagnostics ===');
  out.push(`Timestamp: ${timestamp}`);
  out.push(`Platform: ${Platform.OS}`);
  out.push('');

  try {
    // Step 1: Check if HealthKit is available
    out.push('1. Checking isHealthDataAvailable()...');
    try {
      const available = await isHealthDataAvailable();
      out.push(`   Result: ${String(available)}`);
      out.push(`   Type: ${typeof available}`);
    } catch (e: any) {
      out.push(`   ERROR: ${e?.message ?? String(e)}`);
      out.push(`   Stack: ${e?.stack ?? 'N/A'}`);
      out.push(`   Raw: ${JSON.stringify(e, null, 2)}`);
    }
    out.push('');

    // Step 2: Request authorization
    out.push('2. Requesting authorization...');
    try {
      await requestAuthorization({
        toRead: [
          HKWorkoutTypeIdentifier,
          HKQuantityTypeIdentifierDietaryEnergyConsumed,
          HKQuantityTypeIdentifierBodyMass,
        ],
      });
      out.push('   requestAuthorization: OK (returned without error)');
    } catch (e: any) {
      out.push(`   ERROR: ${e?.message ?? String(e)}`);
      out.push(`   Code: ${e?.code ?? 'N/A'}`);
      out.push(`   Stack: ${e?.stack ?? 'N/A'}`);
      out.push(`   Raw: ${JSON.stringify(e, null, 2)}`);
    }
    out.push('');

    // Step 3: Try querying workouts
    out.push('3. Querying workout samples (limit: 0)...');
    try {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      
      const result: any = await queryWorkoutSamples({
        startDate: startOfToday,
        endDate: now,
        limit: 0,
      } as any);
      
      const workouts = Array.isArray(result) ? result : (result?.samples || []);
      out.push(`   queryWorkoutSamples: OK`);
      out.push(`   Result type: ${Array.isArray(result) ? 'array' : typeof result}`);
      out.push(`   Samples count: ${workouts.length}`);
      const workoutSamplesToShow = workouts.slice(0, maxSamplesToInclude);
      out.push(`   Samples (showing ${workoutSamplesToShow.length}${workouts.length > maxSamplesToInclude ? ` of ${workouts.length}` : ''}):`);
      out.push(JSON.stringify(workoutSamplesToShow, null, 2));
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        out.push(`   Has samples property: ${'samples' in result}`);
        out.push(`   Has deletedSamples: ${'deletedSamples' in result}`);
        out.push(`   Has newAnchor: ${'newAnchor' in result}`);
      }
    } catch (e: any) {
      out.push(`   ERROR: ${e?.message ?? String(e)}`);
      out.push(`   Code: ${e?.code ?? 'N/A'}`);
      out.push(`   Stack: ${e?.stack ?? 'N/A'}`);
      out.push(`   Raw: ${JSON.stringify(e, null, 2)}`);
    }
    out.push('');

    // Step 4: Try querying calories
    out.push('4. Querying dietary energy samples (limit: 0)...');
    try {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      
      const result: any = await queryQuantitySamples(HKQuantityTypeIdentifierDietaryEnergyConsumed, {
        startDate: startOfToday,
        endDate: now,
        limit: 0,
        unit: 'kcal',
      } as any);
      
      const samples = Array.isArray(result) ? result : (result?.samples || []);
      out.push(`   queryQuantitySamples: OK`);
      out.push(`   Result type: ${Array.isArray(result) ? 'array' : typeof result}`);
      out.push(`   Samples count: ${samples.length}`);
      const calorieSamplesToShow = samples.slice(0, maxSamplesToInclude);
      out.push(`   Samples (showing ${calorieSamplesToShow.length}${samples.length > maxSamplesToInclude ? ` of ${samples.length}` : ''}):`);
      out.push(JSON.stringify(calorieSamplesToShow, null, 2));
    } catch (e: any) {
      out.push(`   ERROR: ${e?.message ?? String(e)}`);
      out.push(`   Code: ${e?.code ?? 'N/A'}`);
      out.push(`   Stack: ${e?.stack ?? 'N/A'}`);
      out.push(`   Raw: ${JSON.stringify(e, null, 2)}`);
    }
    out.push('');

    // Step 5: Try getting most recent weight
    out.push('5. Getting most recent weight sample...');
    try {
      const sample = await getMostRecentQuantitySample(HKQuantityTypeIdentifierBodyMass);
      out.push(`   getMostRecentQuantitySample: OK`);
      out.push(`   Sample: ${sample ? 'exists' : 'null'}`);
      if (sample) {
        out.push(`   Quantity: ${(sample as any)?.quantity ?? 'N/A'}`);
        out.push(`   Unit: ${(sample as any)?.unit ?? 'N/A'}`);
      }
    } catch (e: any) {
      out.push(`   ERROR: ${e?.message ?? String(e)}`);
      out.push(`   Code: ${e?.code ?? 'N/A'}`);
      out.push(`   Stack: ${e?.stack ?? 'N/A'}`);
      out.push(`   Raw: ${JSON.stringify(e, null, 2)}`);
    }
    out.push('');

    // Step 6: Check permission status
    out.push('6. Checking permission status...');
    try {
      const perms = await checkHealthKitPermissions();
      out.push(`   Workouts: ${perms.workouts}`);
      out.push(`   Calories: ${perms.calories}`);
      out.push(`   Weight: ${perms.weight}`);
    } catch (e: any) {
      out.push(`   ERROR: ${e?.message ?? String(e)}`);
      out.push(`   Raw: ${JSON.stringify(e, null, 2)}`);
    }

  } catch (e: any) {
    out.push('');
    out.push('=== FATAL ERROR ===');
    out.push(`Message: ${e?.message ?? String(e)}`);
    out.push(`Stack: ${e?.stack ?? 'N/A'}`);
    out.push(`Raw: ${JSON.stringify(e, null, 2)}`);
  }

  out.push('');
  out.push('=== End Diagnostics ===');
  
  return out.join('\n');
}
