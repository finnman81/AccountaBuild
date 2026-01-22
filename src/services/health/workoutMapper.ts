import { WorkoutType } from '../logs';

/**
 * HealthKit Workout Activity Type numeric constants
 * Reference: https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype
 */
const HKWorkoutActivityType = {
  // Running and walking variations
  Running: 37,
  Walking: 52,
  WheelchairWalkPace: 70,
  WheelchairRunPace: 71,
  Hiking: 24,
  // Cycling
  Cycling: 13,
  // Swimming
  Swimming: 46,
  // Rowing
  Rowing: 17,
  // Elliptical
  Elliptical: 16,
  // Yoga and mind-body activities
  Yoga: 57,
  Pilates: 59,
  TaiChi: 60,
  // HIIT
  HighIntensityIntervalTraining: 58,
  // Stairs
  Stairs: 53,
  StairClimbing: 53,
  // Active rest and recovery
  Flexibility: 61,
  PreparationAndRecovery: 62,
  Cooldown: 63,
  MindAndBody: 64,
  // Strength training
  TraditionalStrengthTraining: 52, // Note: This is the same as Walking in older iOS versions
  // Note: TraditionalStrengthTraining is actually 52 in some versions, but newer iOS uses different values
  // We'll handle this via string matching as well
} as const;

/**
 * Maps HealthKit workout types to app's WorkoutType enum
 * Handles both numeric enum values and string representations
 */
export function mapHealthKitWorkoutType(healthKitType: string | number | unknown): WorkoutType {
  // First, handle numeric enum values (HealthKit's primary format)
  const typeNum = typeof healthKitType === 'number' ? healthKitType : 
                  typeof healthKitType === 'string' && /^\d+$/.test(healthKitType) ? parseInt(healthKitType, 10) : null;
  
  if (typeNum !== null && Number.isFinite(typeNum)) {
    // Handle numeric enum values
    switch (typeNum) {
      // Running variations
      case HKWorkoutActivityType.Running:
      case HKWorkoutActivityType.WheelchairRunPace:
        return 'running';
      
      // Walking variations (map to jogging for now, or could be incline walk)
      case HKWorkoutActivityType.Walking:
      case HKWorkoutActivityType.WheelchairWalkPace:
        // Note: 52 can be either Walking OR TraditionalStrengthTraining in some iOS versions
        // We'll handle this ambiguity via additional metadata checks in the service layer
        return 'jogging';
      
      case HKWorkoutActivityType.Hiking:
        // Hiking could be running or jogging depending on intensity
        // Default to jogging, but could be enhanced with metadata
        return 'jogging';
      
      // Cycling
      case HKWorkoutActivityType.Cycling:
        return 'bike';
      
      // Swimming
      case HKWorkoutActivityType.Swimming:
        return 'swim';
      
      // Rowing
      case HKWorkoutActivityType.Rowing:
        return 'rowing';
      
      // Elliptical
      case HKWorkoutActivityType.Elliptical:
        return 'elliptical';
      
      // Yoga and mind-body activities
      case HKWorkoutActivityType.Yoga:
        return 'yoga';
      
      case HKWorkoutActivityType.Pilates:
        return 'pilates';
      
      case HKWorkoutActivityType.TaiChi:
        return 'taiChi';
      
      // Active rest and recovery
      case HKWorkoutActivityType.Flexibility:
      case HKWorkoutActivityType.PreparationAndRecovery:
      case HKWorkoutActivityType.Cooldown:
        return 'stretching';
      
      case HKWorkoutActivityType.MindAndBody:
        // Mind and body is a general category - default to yoga, but could be meditation
        return 'yoga';
      
      // HIIT
      case HKWorkoutActivityType.HighIntensityIntervalTraining:
        return 'hiit';
      
      // Stairs
      case HKWorkoutActivityType.Stairs:
      case HKWorkoutActivityType.StairClimbing:
        return 'stairMaster';
      
      // Note: TraditionalStrengthTraining (52) conflicts with Walking in some iOS versions
      // We'll handle this via string matching below
    }
  }
  
  // Fallback to string matching (for string representations or metadata)
  const normalized = String(healthKitType ?? '').toLowerCase().replace(/[_\s-]/g, '');
  
  // Running variations - comprehensive matching
  if (
    normalized.includes('running') || 
    normalized === 'run' ||
    normalized === '37' || // Running enum value
    normalized.includes('runna') || // Runna app
    normalized.includes('treadmill') ||
    normalized.includes('trackrunning') ||
    normalized.includes('outdoorrunning') ||
    normalized.includes('indoorrunning')
  ) {
    return 'running';
  }
  
  // Jogging variations
  if (
    normalized.includes('jogging') || 
    normalized === 'jog' ||
    normalized.includes('easyrun') ||
    normalized.includes('recoveryrun')
  ) {
    return 'jogging';
  }
  
  // Walking variations - could be jogging, incline walk, or walking
  if (normalized.includes('walking')) {
    if (normalized.includes('incline') || normalized.includes('uphill')) {
      return 'inclineWalk';
    }
    // Regular walking - map to 'walking' type for active rest
    return 'walking';
  }
  
  // Hiking - could be running or jogging depending on intensity
  if (normalized.includes('hiking') || normalized === '24') {
    return 'jogging'; // Default to jogging, but could be running for intense hikes
  }
  
  // Cycling
  if (
    normalized.includes('cycling') || 
    normalized.includes('bike') || 
    normalized === 'bicycle' ||
    normalized === '13' || // Cycling enum value
    normalized.includes('indoorcycling') ||
    normalized.includes('outdoorcycling')
  ) {
    return 'bike';
  }
  
  // Swimming
  if (
    normalized.includes('swimming') || 
    normalized === 'swim' ||
    normalized === '46' || // Swimming enum value
    normalized.includes('poolswimming') ||
    normalized.includes('openwaterswimming')
  ) {
    return 'swim';
  }
  
  // Rowing
  if (
    normalized.includes('rowing') || 
    normalized === 'row' ||
    normalized === '17' || // Rowing enum value
    normalized.includes('indoorrowing')
  ) {
    return 'rowing';
  }
  
  // Elliptical
  if (
    normalized.includes('elliptical') ||
    normalized === '16' // Elliptical enum value
  ) {
    return 'elliptical';
  }
  
  // Yoga and mind-body activities
  if (
    normalized.includes('yoga') ||
    normalized === '57' // Yoga enum value
  ) {
    return 'yoga';
  }
  
  // Pilates
  if (
    normalized.includes('pilates') ||
    normalized === '59' // Pilates enum value
  ) {
    return 'pilates';
  }
  
  // Tai Chi
  if (
    normalized.includes('taichi') ||
    normalized.includes('tai chi') ||
    normalized === '60' // Tai Chi enum value
  ) {
    return 'taiChi';
  }
  
  // Stretching and flexibility
  if (
    normalized.includes('stretching') ||
    normalized.includes('flexibility') ||
    normalized === '61' || // Flexibility enum value
    normalized.includes('preparationandrecovery') ||
    normalized === '62' || // PreparationAndRecovery enum value
    normalized.includes('cooldown') ||
    normalized === '63' || // Cooldown enum value
    normalized.includes('warmup') ||
    normalized.includes('warm-up') ||
    normalized.includes('recovery')
  ) {
    return 'stretching';
  }
  
  // Meditation and mindfulness
  if (
    normalized.includes('meditation') ||
    normalized.includes('mindfulness') ||
    normalized.includes('breathing') ||
    normalized.includes('mindandbody') ||
    normalized === '64' || // MindAndBody enum value
    normalized.includes('mindful')
  ) {
    return 'meditation';
  }
  
  // HIIT
  if (
    normalized.includes('hiit') || 
    normalized.includes('highintensity') ||
    normalized === '58' // HIIT enum value
  ) {
    return 'hiit';
  }
  
  // Stairs
  if (
    normalized.includes('stair') || 
    normalized.includes('stairclimbing') ||
    normalized === '53' // Stairs enum value
  ) {
    return 'stairMaster';
  }
  
  // Incline walk
  if (
    normalized.includes('incline') && normalized.includes('walk') ||
    normalized.includes('uphill')
  ) {
    return 'inclineWalk';
  }
  
  // Strength training variations - check AFTER walking (since 52 can be either)
  if (
    normalized.includes('strength') ||
    normalized.includes('traditionalstrengthtraining') ||
    normalized.includes('weightlifting') ||
    normalized.includes('weightlifting') ||
    normalized.includes('resistance') ||
    normalized.includes('bodybuilding') ||
    normalized.includes('crossfit') ||
    normalized.includes('functionalstrengthtraining')
  ) {
    return 'weightLifting';
  }
  
  // Default fallback - but log for debugging
  console.warn('[WorkoutMapper] Unknown HealthKit workout type:', healthKitType, 'normalized:', normalized);
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
  const ACTIVITY_PILATES = 88;
  const ACTIVITY_TAI_CHI = 89;
  const ACTIVITY_FLEXIBILITY = 90;
  
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
    case ACTIVITY_PILATES:
      return 'pilates';
    case ACTIVITY_TAI_CHI:
      return 'taiChi';
    case ACTIVITY_FLEXIBILITY:
      return 'stretching';
    case ACTIVITY_HIIT:
      return 'hiit';
    case ACTIVITY_STRENGTH_TRAINING:
      return 'weightLifting';
    case ACTIVITY_WALKING:
      // Regular walking - map to 'walking' type for active rest
      return 'walking';
    default:
      return 'weightLifting';
  }
}
