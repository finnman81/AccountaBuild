import { WorkoutType } from '../logs';

/**
 * HealthKit Workout Activity Type numeric constants
 * Reference: https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype
 */
/**
 * HKWorkoutActivityType raw values, per Apple's documented enum.
 *
 * The previous table was hand-guessed and mostly WRONG, which is the main
 * reason 47% of the group's workouts landed as 'other' (105 of 224 since
 * 2026-08-01). The damaging entries: Rowing was 17 (that is EquestrianSports),
 * HIIT 58 (Barre), Stairs 53 (WaterFitness), Pilates 59 (CoreTraining), TaiChi
 * 60 (CrossCountrySkiing), Flexibility 61 (DownhillSkiing), MindAndBody 64
 * (JumpRope) — and TraditionalStrengthTraining was declared as 52, which is
 * WALKING, so every real strength workout (50) fell through unclassified.
 * Confirmed against live syncs: 5 logs arrived as type 50 and became 'other'.
 *
 * These are Apple's values. Do not "correct" one without checking the docs.
 */
const HK = {
  AmericanFootball: 1, Archery: 2, AustralianFootball: 3, Badminton: 4,
  Baseball: 5, Basketball: 6, Bowling: 7, Boxing: 8, Climbing: 9, Cricket: 10,
  CrossTraining: 11, Curling: 12, Cycling: 13, Elliptical: 16,
  EquestrianSports: 17, Fencing: 18, Fishing: 19,
  FunctionalStrengthTraining: 20, Golf: 21, Gymnastics: 22, Handball: 23,
  Hiking: 24, Hockey: 25, Hunting: 26, Lacrosse: 27, MartialArts: 28,
  MindAndBody: 29, PaddleSports: 31, Play: 32, PreparationAndRecovery: 33,
  Racquetball: 34, Rowing: 35, Rugby: 36, Running: 37, Sailing: 38,
  SkatingSports: 39, SnowSports: 40, Soccer: 41, Softball: 42, Squash: 43,
  StairClimbing: 44, SurfingSports: 45, Swimming: 46, TableTennis: 47,
  Tennis: 48, TrackAndField: 49, TraditionalStrengthTraining: 50,
  Volleyball: 51, Walking: 52, WaterFitness: 53, WaterPolo: 54,
  WaterSports: 55, Wrestling: 56, Yoga: 57, Barre: 58, CoreTraining: 59,
  CrossCountrySkiing: 60, DownhillSkiing: 61, Flexibility: 62,
  HighIntensityIntervalTraining: 63, JumpRope: 64, Kickboxing: 65, Pilates: 66,
  Snowboarding: 67, Stairs: 68, StepTraining: 69, WheelchairWalkPace: 70,
  WheelchairRunPace: 71, TaiChi: 72, MixedCardio: 73, HandCycling: 74,
  DiscSports: 75, FitnessGaming: 76, CardioDance: 77, SocialDance: 78,
  Pickleball: 79, Cooldown: 80, SwimBikeRun: 82, Transition: 83, Other: 3000,
} as const;

/**
 * HK activity type -> our WorkoutType. A sport with no equivalent in our
 * (deliberately short) list stays 'other' rather than being forced into a wrong
 * bucket — but it now arrives with hkActivityType recorded, so an 'other' can
 * be investigated instead of guessed at.
 */
const HK_TO_WORKOUT: Record<number, WorkoutType> = {
  [HK.Running]: 'running',
  [HK.WheelchairRunPace]: 'running',
  [HK.Walking]: 'walking',
  [HK.WheelchairWalkPace]: 'walking',
  [HK.Hiking]: 'walking',
  [HK.Cycling]: 'bike',
  [HK.HandCycling]: 'bike',
  [HK.Swimming]: 'swim',
  [HK.WaterFitness]: 'swim',
  [HK.Rowing]: 'rowing',
  [HK.Elliptical]: 'elliptical',
  [HK.StairClimbing]: 'stairMaster',
  [HK.Stairs]: 'stairMaster',
  [HK.StepTraining]: 'stairMaster',
  [HK.TraditionalStrengthTraining]: 'weightLifting',
  [HK.FunctionalStrengthTraining]: 'weightLifting',
  [HK.CoreTraining]: 'weightLifting',
  [HK.CrossTraining]: 'weightLifting',
  [HK.HighIntensityIntervalTraining]: 'hiit',
  [HK.JumpRope]: 'hiit',
  [HK.MixedCardio]: 'hiit',
  [HK.Kickboxing]: 'hiit',
  [HK.Boxing]: 'hiit',
  [HK.MartialArts]: 'hiit',
  [HK.CardioDance]: 'hiit',
  [HK.Yoga]: 'yoga',
  [HK.Pilates]: 'pilates',
  [HK.Barre]: 'pilates',
  [HK.TaiChi]: 'taiChi',
  [HK.MindAndBody]: 'meditation',
  [HK.Flexibility]: 'stretching',
  [HK.PreparationAndRecovery]: 'stretching',
  [HK.Cooldown]: 'stretching',
  [HK.Tennis]: 'tennis',
};

/**
 * Maps HealthKit workout types to app's WorkoutType enum
 * Handles both numeric enum values and string representations
 */
export function mapHealthKitWorkoutType(healthKitType: string | number | unknown): WorkoutType {
  // First, handle numeric enum values (HealthKit's primary format)
  const typeNum = typeof healthKitType === 'number' ? healthKitType : 
                  typeof healthKitType === 'string' && /^\d+$/.test(healthKitType) ? parseInt(healthKitType, 10) : null;
  
  if (typeNum !== null && Number.isFinite(typeNum)) {
    const mapped = HK_TO_WORKOUT[typeNum];
    if (mapped) return mapped;
    // Known-but-unmappable (a sport we have no bucket for) and genuinely
    // unknown both fall through to the string branch, then to 'other'.
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

  // Tennis (matched by name only — the numeric HK raw value collides with other
  // types in this hand-maintained enum, and the native libs pass a name string).
  if (normalized.includes('tennis')) {
    return 'tennis';
  }
  
  // Manual labor. HealthKit has no activity type for it, so WHOOP (and
  // anything else) writes it as "Other" (3000) — the numeric branch cannot
  // help. Matched by name only, and only when a source bothers to pass one.
  if (
    (normalized.includes('manual') && normalized.includes('labor')) ||
    normalized.includes('manuallabour') ||
    normalized.includes('manuallabor')
  ) {
    return 'manualLabor';
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
  
  // Unknown -> 'other', NEVER 'weightLifting'. Defaulting to a real activity
  // silently mislabels data: Apple Health "Other"/custom workouts (manual
  // labor, yard work) were all being recorded as weightlifting (prod, 7/20).
  console.warn('[WorkoutMapper] Unknown HealthKit workout type:', healthKitType, 'normalized:', normalized);
  return 'other';
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
      return 'other'; // see the HealthKit note above — never guess a real type
  }
}
