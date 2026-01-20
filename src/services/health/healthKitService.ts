import { Platform } from 'react-native';
import {
  requestAuthorization,
  queryWorkoutSamples,
  queryQuantitySamples,
<<<<<<< HEAD
  queryCorrelationSamples,
  queryStatisticsForQuantitySeparateBySource,
  querySources,
  queryStatisticsForQuantity,
=======
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
  getMostRecentQuantitySample,
  isHealthDataAvailable,
} from '@kingstinct/react-native-healthkit';
import { mapHealthKitWorkoutType } from './workoutMapper';
import { WorkoutType } from '../logs';
<<<<<<< HEAD
import { formatYYYYMMDDLocal, todayYYYYMMDD } from '../../utils/dates';
=======
import { todayYYYYMMDD } from '../../utils/dates';
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d

export type HealthKitWorkout = {
  workoutType: WorkoutType;
  durationMinutes: number;
  startDate: Date;
  endDate: Date;
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
};

export type HealthKitWeight = {
  weight: number; // in pounds
  date: string; // YYYY-MM-DD
  timestamp: Date;
};

<<<<<<< HEAD
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

=======
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
// HealthKit type identifiers as strings (matching Apple's HealthKit constants)
const HKWorkoutTypeIdentifier = 'HKWorkoutTypeIdentifier';
const HKQuantityTypeIdentifierDietaryEnergyConsumed = 'HKQuantityTypeIdentifierDietaryEnergyConsumed';
const HKQuantityTypeIdentifierBodyMass = 'HKQuantityTypeIdentifierBodyMass';
<<<<<<< HEAD
const HKCorrelationTypeIdentifierFood = 'HKCorrelationTypeIdentifierFood';

// NOTE:
// We intentionally do NOT request the Food correlation type during the permission prompt.
// Some iOS versions/devices can throw an Objective‑C exception when requesting correlation
// types (the native module may not catch it), which would crash the app at auth time.
// For calories we request the Dietary Energy quantity type; correlation reads are attempted
// later on a best-effort basis and are already wrapped in try/catch.
=======

>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
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
<<<<<<< HEAD
        console.error('[HealthKit] Permission probe (workouts) failed:', err);
        return false;
=======
        // If error is permission-related, assume not granted
        if (err?.message?.includes('authorization') || err?.code === 'permission') {
          return false;
        }
        // Other errors (like no data) mean permissions are likely granted
        return true;
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
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
<<<<<<< HEAD
        console.error('[HealthKit] Permission probe (calories) failed:', err);
        return false;
=======
        if (err?.message?.includes('authorization') || err?.code === 'permission') {
          return false;
        }
        return true;
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
      }
    })();

  // Try to get most recent weight sample
  const weight = await (async () => {
    try {
      await getMostRecentQuantitySample(HKQuantityTypeIdentifierBodyMass);
      return true;
    } catch (err: any) {
<<<<<<< HEAD
      console.error('[HealthKit] Permission probe (weight) failed:', err);
      return false;
=======
      if (err?.message?.includes('authorization') || err?.code === 'permission') {
        return false;
      }
      return true;
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
    }
  })();

  return { workouts, calories, weight };
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
<<<<<<< HEAD
      limit: 0,
=======
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
    } as any);

    // Handle both array response and object with samples property
    const workouts = Array.isArray(result) ? result : (result?.samples || []);

    return workouts
      .map((w: any) => {
        const workoutType = mapHealthKitWorkoutType(w.workoutActivityType);
        if (!workoutType) return null;

<<<<<<< HEAD
        const durationMinutes = deriveWorkoutDurationMinutes(w);
=======
        // Duration might be in seconds or as a number
        const durationSeconds =
          typeof w.duration === 'number' ? w.duration : w.totalDuration || 0;
        const durationMinutes = Math.round(durationSeconds / 60);
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d

        const startDate = w.startDate instanceof Date ? w.startDate : new Date(w.startDate);
        const endDate = w.endDate instanceof Date ? w.endDate : new Date(w.endDate);

        return {
          workoutType,
          durationMinutes,
          startDate,
          endDate,
        };
      })
<<<<<<< HEAD
      .filter((w: HealthKitWorkout | null): w is HealthKitWorkout => w !== null)
      .filter((w: HealthKitWorkout) => w.startDate >= startOfToday && w.startDate <= now);
=======
      .filter((w: HealthKitWorkout | null): w is HealthKitWorkout => w !== null);
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
  } catch (error) {
    console.error('Error reading HealthKit workouts:', error);
    return [];
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
<<<<<<< HEAD
  const mealType =
    metadata.Meal ||
    metadata.MealType ||
    metadata.meal ||
    metadata.mealType ||
    metadata['HKFoodMeal'];
=======
  const mealType = metadata.MealType || metadata.meal || metadata.mealType || metadata['HKFoodMeal'];
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
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

<<<<<<< HEAD
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
=======
    const result: any = await queryQuantitySamples(HKQuantityTypeIdentifierDietaryEnergyConsumed, {
      startDate: startOfToday,
      endDate: now,
      ascending: true,
    } as any);

    console.log('[HealthKit] Raw calories query result:', JSON.stringify(result, null, 2));

    // Handle both array response and object with samples property
    const samples = Array.isArray(result) ? result : (result?.samples || []);
    console.log('[HealthKit] Processed samples count:', samples.length);

    if (samples.length === 0) {
      console.log('[HealthKit] No calorie samples found for today');
      return [];
    }

    // Log first sample to understand structure
    if (samples.length > 0) {
      console.log('[HealthKit] First sample:', JSON.stringify(samples[0], null, 2));
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
    }

    // Convert each sample to an entry
    const entries: HealthKitCalorieEntry[] = [];
<<<<<<< HEAD
=======
    const today = todayYYYYMMDD();
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d

    console.log('[HealthKit] Processing', samples.length, 'samples into entries...');
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
<<<<<<< HEAD
=======
      console.log(`[HealthKit] Sample ${i + 1}/${samples.length}:`, JSON.stringify(sample, null, 2));
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
      
      // Try multiple ways to extract quantity
      let qty = 0;
      if (typeof sample.quantity === 'number') {
        qty = sample.quantity;
      } else if (typeof sample.value === 'number') {
        qty = sample.value;
<<<<<<< HEAD
      } else if (typeof sample.quantity?.quantity === 'number') {
        qty = sample.quantity.quantity;
      } else if (typeof sample.quantity?.value === 'number') {
        qty = sample.quantity.value;
=======
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
      } else if (sample.quantityValue && typeof sample.quantityValue === 'number') {
        qty = sample.quantityValue;
      }
      
<<<<<<< HEAD
=======
      console.log(`[HealthKit] Sample ${i + 1} quantity:`, qty, 'unit:', sample.unit || sample.quantityUnit || 'unknown');
      
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
      if (qty <= 0) {
        console.log(`[HealthKit] Skipping sample ${i + 1} - quantity is 0 or invalid`);
        continue;
      }

      const startDate = sample.startDate ? new Date(sample.startDate) : (sample.startTime ? new Date(sample.startTime) : new Date());
<<<<<<< HEAD
      if (startDate < startOfToday || startDate > now) {
        continue;
      }
      const meal = extractMealType(sample);
      const source = sample.source?.name || sample.sourceRevision?.source?.name || sample.sourceName || undefined;
      const entryDate = formatYYYYMMDDLocal(startDate);

      entries.push({
        calories: Math.round(qty),
        date: entryDate,
=======
      const meal = extractMealType(sample);
      const source = sample.source?.name || sample.sourceRevision?.source?.name || sample.sourceName || undefined;

      console.log(`[HealthKit] Sample ${i + 1} parsed:`, {
        calories: Math.round(qty),
        date: today,
        meal,
        timestamp: startDate.toISOString(),
        source,
      });

      entries.push({
        calories: Math.round(qty),
        date: today,
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
        meal,
        timestamp: startDate,
        source,
      });
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

<<<<<<< HEAD
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

=======
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
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
    };
  } catch (error) {
    console.error('Error reading HealthKit weight:', error);
    return null;
  }
}

/**
 * Run comprehensive HealthKit diagnostics
 * Returns a detailed diagnostic report as a string
 */
export async function runHealthKitDiagnostics(): Promise<string> {
  const out: string[] = [];
  const timestamp = new Date().toISOString();
<<<<<<< HEAD
  const maxSamplesToInclude = 50;
=======
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
  
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
<<<<<<< HEAD
    out.push('3. Querying workout samples (limit: 0)...');
=======
    out.push('3. Querying workout samples (limit: 1)...');
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
    try {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      
      const result: any = await queryWorkoutSamples({
        startDate: startOfToday,
        endDate: now,
<<<<<<< HEAD
        limit: 0,
=======
        limit: 1,
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
      } as any);
      
      const workouts = Array.isArray(result) ? result : (result?.samples || []);
      out.push(`   queryWorkoutSamples: OK`);
      out.push(`   Result type: ${Array.isArray(result) ? 'array' : typeof result}`);
      out.push(`   Samples count: ${workouts.length}`);
<<<<<<< HEAD
      const workoutSamplesToShow = workouts.slice(0, maxSamplesToInclude);
      out.push(`   Samples (showing ${workoutSamplesToShow.length}${workouts.length > maxSamplesToInclude ? ` of ${workouts.length}` : ''}):`);
      out.push(JSON.stringify(workoutSamplesToShow, null, 2));
=======
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
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
<<<<<<< HEAD
    out.push('4. Querying dietary energy samples (limit: 0)...');
=======
    out.push('4. Querying dietary energy samples (limit: 1)...');
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
    try {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      
      const result: any = await queryQuantitySamples(HKQuantityTypeIdentifierDietaryEnergyConsumed, {
        startDate: startOfToday,
        endDate: now,
<<<<<<< HEAD
        limit: 0,
        unit: 'kcal',
=======
        limit: 1,
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
      } as any);
      
      const samples = Array.isArray(result) ? result : (result?.samples || []);
      out.push(`   queryQuantitySamples: OK`);
      out.push(`   Result type: ${Array.isArray(result) ? 'array' : typeof result}`);
      out.push(`   Samples count: ${samples.length}`);
<<<<<<< HEAD
      const calorieSamplesToShow = samples.slice(0, maxSamplesToInclude);
      out.push(`   Samples (showing ${calorieSamplesToShow.length}${samples.length > maxSamplesToInclude ? ` of ${samples.length}` : ''}):`);
      out.push(JSON.stringify(calorieSamplesToShow, null, 2));
=======
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
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
