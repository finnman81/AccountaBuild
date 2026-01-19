import { Platform } from 'react-native';
import GoogleFit, { Scopes } from 'react-native-google-fit';
import { mapGoogleFitWorkoutType } from './workoutMapper';
import { WorkoutType } from '../logs';
import { todayYYYYMMDD } from '../../utils/dates';

export type GoogleFitWorkout = {
  workoutType: WorkoutType;
  durationMinutes: number;
  startDate: Date;
  endDate: Date;
};

export type GoogleFitCalories = {
  calories: number; // Total calories consumed for today
  date: string; // YYYY-MM-DD
};

export type GoogleFitWeight = {
  weight: number; // in pounds
  date: string; // YYYY-MM-DD
  timestamp: Date;
};

/**
 * Check if Google Fit is available
 */
export async function isGoogleFitAvailable(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    // react-native-google-fit may use different method names
    // Try both isAvailable() and checking isAuthorized
    if (typeof GoogleFit.isAvailable === 'function') {
      return await GoogleFit.isAvailable();
    }
    // Fallback: check if authorized (implies available)
    return GoogleFit.isAuthorized || false;
  } catch {
    return false;
  }
}

/**
 * Request Google Fit permissions
 */
export async function requestGoogleFitPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (!(await isGoogleFitAvailable())) return false;

  try {
    const options = {
      scopes: [
        Scopes.FITNESS_ACTIVITY_READ,
        Scopes.FITNESS_BODY_READ,
        Scopes.FITNESS_NUTRITION_READ,
      ],
    };

    const authResult = await GoogleFit.authorize(options);
    return authResult.success;
  } catch (error) {
    console.error('Error requesting Google Fit permissions:', error);
    return false;
  }
}

/**
 * Check if Google Fit permissions are granted
 */
export async function checkGoogleFitPermissions(): Promise<{
  workouts: boolean;
  calories: boolean;
  weight: boolean;
}> {
  if (Platform.OS !== 'android') {
    return { workouts: false, calories: false, weight: false };
  }

  try {
    // Check authorization status
    let isAuthorized = false;
    if (typeof GoogleFit.checkIsAuthorized === 'function') {
      await GoogleFit.checkIsAuthorized();
      isAuthorized = GoogleFit.isAuthorized || false;
    } else if (typeof GoogleFit.isAuthorized !== 'undefined') {
      isAuthorized = GoogleFit.isAuthorized;
    }
    
    return {
      workouts: isAuthorized,
      calories: isAuthorized,
      weight: isAuthorized,
    };
  } catch {
    return { workouts: false, calories: false, weight: false };
  }
}

/**
 * Read workouts for today
 */
export async function readTodayWorkouts(): Promise<GoogleFitWorkout[]> {
  if (Platform.OS !== 'android') return [];
  if (!(await isGoogleFitAvailable())) return [];

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Try different method names that might exist in different versions
    let workouts: any[] = [];
    if (typeof GoogleFit.getDailyWorkoutSamples === 'function') {
      workouts = await GoogleFit.getDailyWorkoutSamples({
        startDate: today.toISOString(),
        endDate: tomorrow.toISOString(),
      });
    } else if (typeof GoogleFit.getWorkoutSamples === 'function') {
      workouts = await GoogleFit.getWorkoutSamples({
        startDate: today.toISOString(),
        endDate: tomorrow.toISOString(),
      });
    }

    return workouts.map((w: any) => ({
      workoutType: mapGoogleFitWorkoutType(w.activityType || w.type || 0),
      durationMinutes: Math.round((w.duration || 0) / 1000 / 60), // Convert ms to minutes
      startDate: new Date(w.startDate || Date.now()),
      endDate: new Date(w.endDate || Date.now()),
    }));
  } catch (error) {
    console.error('Error reading Google Fit workouts:', error);
    return [];
  }
}

/**
 * Read total calories consumed for today
 */
export async function readTodayCalories(): Promise<GoogleFitCalories | null> {
  if (Platform.OS !== 'android') return null;
  if (!(await isGoogleFitAvailable())) return null;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Google Fit nutrition data - API may vary by version
    // Try different method names that might exist
    let nutritionData: any[] = [];
    if (typeof GoogleFit.getDailyNutritionSamples === 'function') {
      nutritionData = await GoogleFit.getDailyNutritionSamples({
        startDate: today.toISOString(),
        endDate: tomorrow.toISOString(),
      });
    } else if (typeof GoogleFit.getNutritionSamples === 'function') {
      nutritionData = await GoogleFit.getNutritionSamples({
        startDate: today.toISOString(),
        endDate: tomorrow.toISOString(),
      });
    }

    // Sum calories from all nutrition entries
    const totalCalories = nutritionData.reduce((sum: number, entry: any) => {
      // Google Fit returns calories in different fields, check common ones
      const calories = entry.calories || entry.energy || entry.value || entry.calorie || 0;
      return sum + (typeof calories === 'number' ? calories : 0);
    }, 0);

    if (totalCalories <= 0) return null;

    return {
      calories: Math.round(totalCalories),
      date: todayYYYYMMDD(),
    };
  } catch (error) {
    console.error('Error reading Google Fit calories:', error);
    return null;
  }
}

/**
 * Read most recent weight entry for today
 */
export async function readTodayWeight(): Promise<GoogleFitWeight | null> {
  if (Platform.OS !== 'android') return null;
  if (!(await isGoogleFitAvailable())) return null;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const weightData = await GoogleFit.getWeightSamples({
      startDate: today.toISOString(),
      endDate: tomorrow.toISOString(),
      unit: 'pound',
    });

    if (weightData.length === 0) return null;

    // Get the most recent weight entry
    const latest = weightData.sort((a: any, b: any) => {
      const dateA = new Date(a.startDate || a.date || 0).getTime();
      const dateB = new Date(b.startDate || b.date || 0).getTime();
      return dateB - dateA;
    })[0];

    const weight = latest.value || latest.weight;
    if (!weight || weight <= 0) return null;

    return {
      weight: Math.round(weight * 10) / 10, // Round to 1 decimal place
      date: todayYYYYMMDD(),
      timestamp: new Date(latest.startDate || latest.date || Date.now()),
    };
  } catch (error) {
    console.error('Error reading Google Fit weight:', error);
    return null;
  }
}
