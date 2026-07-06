import { Platform } from 'react-native';
import Constants from 'expo-constants';

export type HealthWorkout = {
  workoutType: string; // Will be WorkoutType from logs, but typed as string for compatibility
  durationMinutes: number;
  startDate: Date;
  endDate: Date;
  uuid?: string;
};

export type HealthCalories = {
  calories: number;
  date: string; // YYYY-MM-DD
};

export type HealthCalorieEntry = {
  calories: number;
  date: string; // YYYY-MM-DD
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'all';
  timestamp: Date;
  source?: string;
  uuid?: string;
};

export type HealthWeight = {
  weight: number;
  date: string; // YYYY-MM-DD
  timestamp: Date;
  uuid?: string;
};

export type HealthPermissions = {
  workouts: boolean;
  calories: boolean;
  weight: boolean;
};

export type AnchoredResult<T> = { items: T[]; deletedUuids: string[]; newAnchor?: string };

// NOTE: Expo Go cannot load HealthKit/Google Fit (NitroModules).
// These dynamic imports + Expo Go guard prevent runtime crashes.
const isExpoGo = Constants.appOwnership === 'expo';

async function getHealthKitService() {
  // Only block in Expo Go - custom dev clients can use native modules
  if (isExpoGo) {
    console.log('HealthKit: Blocked - running in Expo Go');
    return null;
  }
  try {
    console.log('HealthKit: Attempting to load service module...');
    const service = await import('./healthKitService');
    console.log('HealthKit: Service module loaded successfully');
    return service;
  } catch (error) {
    console.error('HealthKit: Service module failed to load:', error);
    return null;
  }
}

async function getGoogleFitService() {
  // Only block in Expo Go - custom dev clients can use native modules.
  // Android health now uses Health Connect (react-native-health-connect), which
  // exposes the same googleFit* function names this module dispatches to.
  if (isExpoGo) return null;
  try {
    return await import('./healthConnectService');
  } catch (error) {
    console.error('Health Connect service unavailable:', error);
    return null;
  }
}

/**
 * Check if health services are available on this platform
 */
export async function isHealthAvailable(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    const service = await getHealthKitService();
    if (!service) return false;
    return await service.isHealthKitAvailable();
  } else if (Platform.OS === 'android') {
    const service = await getGoogleFitService();
    if (!service) return false;
    return await service.isGoogleFitAvailable();
  }
  return false;
}

/**
 * Request health permissions
 */
export async function requestHealthPermissions(): Promise<{ success: boolean; dialogShown: boolean; error?: string }> {
  if (Platform.OS === 'ios') {
    const service = await getHealthKitService();
    if (!service) {
      return { success: false, dialogShown: false, error: 'HealthKit service not available' };
    }
    return await service.requestHealthKitPermissions();
  } else if (Platform.OS === 'android') {
    const service = await getGoogleFitService();
    if (!service) {
      return { success: false, dialogShown: false, error: 'Google Fit service not available' };
    }
    const granted = await service.requestGoogleFitPermissions();
    return { success: granted, dialogShown: granted };
  }
  return { success: false, dialogShown: false, error: 'Unsupported platform' };
}

/**
 * Check health permissions status
 */
export async function checkHealthPermissions(): Promise<HealthPermissions> {
  if (Platform.OS === 'ios') {
    const service = await getHealthKitService();
    if (!service) return { workouts: false, calories: false, weight: false };
    return await service.checkHealthKitPermissions();
  } else if (Platform.OS === 'android') {
    const service = await getGoogleFitService();
    if (!service) return { workouts: false, calories: false, weight: false };
    return await service.checkGoogleFitPermissions();
  }
  return { workouts: false, calories: false, weight: false };
}

/**
 * Read workouts for today
 */
export async function readTodayWorkouts(): Promise<HealthWorkout[]> {
  if (Platform.OS === 'ios') {
    const service = await getHealthKitService();
    if (!service) return [];
    return await service.readTodayWorkouts();
  } else if (Platform.OS === 'android') {
    const service = await getGoogleFitService();
    if (!service) return [];
    return await service.readTodayWorkouts();
  }
  return [];
}

/**
 * Delta read of workouts since the given anchor (idempotent, honors deletions).
 * Android has no anchored path yet, so it returns an empty passthrough.
 */
export async function readWorkoutsSinceAnchor(anchor?: string): Promise<AnchoredResult<HealthWorkout>> {
  if (Platform.OS === 'ios') {
    const service = await getHealthKitService();
    if (!service || typeof (service as any).readWorkoutsSinceAnchor !== 'function') {
      return { items: [], deletedUuids: [], newAnchor: anchor };
    }
    return await (service as any).readWorkoutsSinceAnchor(anchor);
  }
  if (Platform.OS === 'android') {
    // Health Connect has no anchored workout read wired yet; wrap today's
    // workouts as a delta (deterministic ids keep it idempotent, no deletions).
    const service = await getGoogleFitService();
    if (!service) return { items: [], deletedUuids: [], newAnchor: anchor };
    const items = await service.readTodayWorkouts();
    return { items, deletedUuids: [], newAnchor: anchor };
  }
  return { items: [], deletedUuids: [], newAnchor: anchor };
}

/**
 * Delta read of dietary-energy entries since the given anchor.
 * Android has no anchored path yet, so it returns an empty passthrough.
 */
export async function readCalorieEntriesSinceAnchor(anchor?: string): Promise<AnchoredResult<HealthCalorieEntry>> {
  if (Platform.OS === 'ios') {
    const service = await getHealthKitService();
    if (!service || typeof (service as any).readCalorieEntriesSinceAnchor !== 'function') {
      return { items: [], deletedUuids: [], newAnchor: anchor };
    }
    return await (service as any).readCalorieEntriesSinceAnchor(anchor);
  }
  return { items: [], deletedUuids: [], newAnchor: anchor };
}

/**
 * Set up near-instant background sync triggers (iOS HealthKit background delivery
 * + change observers). Android relies on the periodic background task instead, so
 * this is a no-op there. Returns a cleanup function.
 */
export async function setupBackgroundObservers(onChange: () => void): Promise<() => void> {
  if (Platform.OS === 'ios') {
    const service = await getHealthKitService();
    if (service && typeof (service as any).setupBackgroundObservers === 'function') {
      return (service as any).setupBackgroundObservers(onChange);
    }
  }
  return () => {};
}

/**
 * Read individual calorie entries for today (with meal types)
 */
export async function readTodayCalorieEntries(): Promise<HealthCalorieEntry[]> {
  if (Platform.OS === 'ios') {
    const service = await getHealthKitService();
    if (!service) return [];
    if (typeof (service as any).readTodayCalorieEntries === 'function') {
      return await (service as any).readTodayCalorieEntries();
    }
  }
  // Android: return empty for now (can be implemented later)
  return [];
}

export async function readCalorieDiagnostics(): Promise<{ sources: any[]; statsBySource: any[] }> {
  if (Platform.OS === 'ios') {
    const service = await getHealthKitService();
    if (!service || typeof (service as any).readCalorieDiagnostics !== 'function') {
      return { sources: [], statsBySource: [] };
    }
    return await (service as any).readCalorieDiagnostics();
  }
  return { sources: [], statsBySource: [] };
}

export async function readWorkoutDiagnostics(): Promise<{ sources: any[] }> {
  if (Platform.OS === 'ios') {
    const service = await getHealthKitService();
    if (!service || typeof (service as any).readWorkoutDiagnostics !== 'function') {
      return { sources: [] };
    }
    return await (service as any).readWorkoutDiagnostics();
  }
  return { sources: [] };
}

/**
 * Read total calories consumed for today
 */
export async function readTodayCalories(): Promise<HealthCalories | null> {
  if (Platform.OS === 'ios') {
    const service = await getHealthKitService();
    if (!service) return null;
    return await service.readTodayCalories();
  } else if (Platform.OS === 'android') {
    const service = await getGoogleFitService();
    if (!service) return null;
    return await service.readTodayCalories();
  }
  return null;
}

/**
 * Read most recent weight entry for today
 */
export async function readTodayWeight(): Promise<HealthWeight | null> {
  if (Platform.OS === 'ios') {
    const service = await getHealthKitService();
    if (!service) return null;
    return await service.readTodayWeight();
  } else if (Platform.OS === 'android') {
    const service = await getGoogleFitService();
    if (!service) return null;
    return await service.readTodayWeight();
  }
  return null;
}
