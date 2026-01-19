import { Platform } from 'react-native';
import {
  requestAuthorization,
  queryWorkoutSamples,
  queryQuantitySamples,
  getMostRecentQuantitySample,
  isHealthDataAvailable,
} from '@kingstinct/react-native-healthkit';
import { mapHealthKitWorkoutType } from './workoutMapper';
import { WorkoutType } from '../logs';
import { todayYYYYMMDD } from '../../utils/dates';

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

// HealthKit type identifiers as strings (matching Apple's HealthKit constants)
const HKWorkoutTypeIdentifier = 'HKWorkoutTypeIdentifier';
const HKQuantityTypeIdentifierDietaryEnergyConsumed = 'HKQuantityTypeIdentifierDietaryEnergyConsumed';
const HKQuantityTypeIdentifierBodyMass = 'HKQuantityTypeIdentifierBodyMass';

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
        // If error is permission-related, assume not granted
        if (err?.message?.includes('authorization') || err?.code === 'permission') {
          return false;
        }
        // Other errors (like no data) mean permissions are likely granted
        return true;
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
        if (err?.message?.includes('authorization') || err?.code === 'permission') {
          return false;
        }
        return true;
      }
    })();

  // Try to get most recent weight sample
  const weight = await (async () => {
    try {
      await getMostRecentQuantitySample(HKQuantityTypeIdentifierBodyMass);
      return true;
    } catch (err: any) {
      if (err?.message?.includes('authorization') || err?.code === 'permission') {
        return false;
      }
      return true;
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
    } as any);

    // Handle both array response and object with samples property
    const workouts = Array.isArray(result) ? result : (result?.samples || []);

    return workouts
      .map((w: any) => {
        const workoutType = mapHealthKitWorkoutType(w.workoutActivityType);
        if (!workoutType) return null;

        // Duration might be in seconds or as a number
        const durationSeconds =
          typeof w.duration === 'number' ? w.duration : w.totalDuration || 0;
        const durationMinutes = Math.round(durationSeconds / 60);

        const startDate = w.startDate instanceof Date ? w.startDate : new Date(w.startDate);
        const endDate = w.endDate instanceof Date ? w.endDate : new Date(w.endDate);

        return {
          workoutType,
          durationMinutes,
          startDate,
          endDate,
        };
      })
      .filter((w: HealthKitWorkout | null): w is HealthKitWorkout => w !== null);
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
  const mealType = metadata.MealType || metadata.meal || metadata.mealType || metadata['HKFoodMeal'];
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
    }

    // Convert each sample to an entry
    const entries: HealthKitCalorieEntry[] = [];
    const today = todayYYYYMMDD();

    console.log('[HealthKit] Processing', samples.length, 'samples into entries...');
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      console.log(`[HealthKit] Sample ${i + 1}/${samples.length}:`, JSON.stringify(sample, null, 2));
      
      // Try multiple ways to extract quantity
      let qty = 0;
      if (typeof sample.quantity === 'number') {
        qty = sample.quantity;
      } else if (typeof sample.value === 'number') {
        qty = sample.value;
      } else if (sample.quantityValue && typeof sample.quantityValue === 'number') {
        qty = sample.quantityValue;
      }
      
      console.log(`[HealthKit] Sample ${i + 1} quantity:`, qty, 'unit:', sample.unit || sample.quantityUnit || 'unknown');
      
      if (qty <= 0) {
        console.log(`[HealthKit] Skipping sample ${i + 1} - quantity is 0 or invalid`);
        continue;
      }

      const startDate = sample.startDate ? new Date(sample.startDate) : (sample.startTime ? new Date(sample.startTime) : new Date());
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
    out.push('3. Querying workout samples (limit: 1)...');
    try {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      
      const result: any = await queryWorkoutSamples({
        startDate: startOfToday,
        endDate: now,
        limit: 1,
      } as any);
      
      const workouts = Array.isArray(result) ? result : (result?.samples || []);
      out.push(`   queryWorkoutSamples: OK`);
      out.push(`   Result type: ${Array.isArray(result) ? 'array' : typeof result}`);
      out.push(`   Samples count: ${workouts.length}`);
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
    out.push('4. Querying dietary energy samples (limit: 1)...');
    try {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      
      const result: any = await queryQuantitySamples(HKQuantityTypeIdentifierDietaryEnergyConsumed, {
        startDate: startOfToday,
        endDate: now,
        limit: 1,
      } as any);
      
      const samples = Array.isArray(result) ? result : (result?.samples || []);
      out.push(`   queryQuantitySamples: OK`);
      out.push(`   Result type: ${Array.isArray(result) ? 'array' : typeof result}`);
      out.push(`   Samples count: ${samples.length}`);
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
