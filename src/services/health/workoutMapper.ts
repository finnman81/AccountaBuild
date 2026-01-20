import { WorkoutType } from '../logs';

/**
 * Maps HealthKit workout types to app's WorkoutType enum
 */
export function mapHealthKitWorkoutType(healthKitType: string | number | unknown): WorkoutType {
  // Safely convert to string - HealthKit may return numeric enum values
  const normalized = String(healthKitType ?? '').toLowerCase().replace(/[_\s-]/g, '');
  
  // Direct matches
  if (normalized.includes('running') || normalized === 'run') return 'running';
  if (normalized.includes('jogging') || normalized === 'jog') return 'jogging';
  if (normalized.includes('cycling') || normalized.includes('bike') || normalized === 'bicycle') return 'bike';
  if (normalized.includes('swimming') || normalized === 'swim') return 'swim';
  if (normalized.includes('rowing') || normalized === 'row') return 'rowing';
  if (normalized.includes('elliptical')) return 'elliptical';
  if (normalized.includes('yoga')) return 'yoga';
  if (normalized.includes('hiit') || normalized.includes('highintensity')) return 'hiit';
  if (normalized.includes('stair') || normalized.includes('stairclimbing')) return 'stairMaster';
  if (normalized.includes('walking') && normalized.includes('incline')) return 'inclineWalk';
  
  // Strength training variations
  if (
    normalized.includes('strength') ||
<<<<<<< HEAD
    normalized.includes('traditionalstrengthtraining') ||
=======
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
    normalized.includes('weightlifting') ||
    normalized.includes('weightlifting') ||
    normalized.includes('resistance') ||
    normalized.includes('bodybuilding')
  ) {
    return 'weightLifting';
  }
  
  // Default fallback
  return 'weightLifting';
}

/**
 * Maps Google Fit activity types to app's WorkoutType enum
 */
export function mapGoogleFitWorkoutType(googleFitType: number | string): WorkoutType {
  // Google Fit uses numeric activity types
  // Common types: 8=running, 1=biking, 5=walking, 9=swimming, etc.
  const typeNum = typeof googleFitType === 'string' ? parseInt(googleFitType, 10) : googleFitType;
  
  // Google Fit activity type constants (from react-native-google-fit)
  const ACTIVITY_RUNNING = 8;
  const ACTIVITY_BIKING = 1;
  const ACTIVITY_WALKING = 5;
  const ACTIVITY_SWIMMING = 9;
  const ACTIVITY_ROWING = 11;
  const ACTIVITY_ELLIPTICAL = 13;
  const ACTIVITY_STRENGTH_TRAINING = 80;
  const ACTIVITY_YOGA = 84;
  const ACTIVITY_HIIT = 87;
  
  switch (typeNum) {
    case ACTIVITY_RUNNING:
      return 'running';
    case ACTIVITY_BIKING:
      return 'bike';
    case ACTIVITY_SWIMMING:
      return 'swim';
    case ACTIVITY_ROWING:
      return 'rowing';
    case ACTIVITY_ELLIPTICAL:
      return 'elliptical';
    case ACTIVITY_YOGA:
      return 'yoga';
    case ACTIVITY_HIIT:
      return 'hiit';
    case ACTIVITY_STRENGTH_TRAINING:
      return 'weightLifting';
    case ACTIVITY_WALKING:
      // Could be incline walk, but default to jogging for now
      return 'jogging';
    default:
      return 'weightLifting';
  }
}
