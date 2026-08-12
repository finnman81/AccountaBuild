/**
 * Configurable copy for onboarding screens
 * Update these values as needed, especially the research stat text
 */

export const onboardingCopy = {
  // Screen 1: Welcome screen ("Midnight Blue" revamp — design 01)
  welcome: {
    headline: "Nobody left\nbehind.",
    subtext: "Start a group. Hold each other to a higher standard.",
    credibilityLine: "Log in seconds. Rank up weekly.",
    cta: "Get started",
    ctaSubtext: "Two minutes to set up",
    valueRows: [
      { icon: 'clock-fast', tint: 'primary', title: 'Log it in seconds', subtitle: 'One tap each, or let Apple Health log it for you' },
      { icon: 'account-group', tint: 'success', title: 'No hiding', subtitle: "Everyone sees who showed up and who didn't" },
      { icon: 'diamond-stone', tint: 'gold', title: 'Earn your rank', subtitle: 'Fitness Points from Iron to Challenger' },
    ] as const,
  },

  // Screen 2: "What are you training for?" — intent picker (design 02).
  // Each intent seeds sensible default goals; detailed tuning lives in Edit Profile.
  goalsIntent: {
    headline: "What are you\ntraining for?",
    subtext: "This sets your starting goals.",
    cta: "Continue",
    options: [
      { key: 'lose_weight', title: 'Lose weight', subtitle: 'Calorie deficit + steady cardio', icon: 'heart-outline',
        defaults: { goalMode: 'cut', dailyCalorieGoal: 1800, workoutsPerWeek: 4 } },
      { key: 'build_muscle', title: 'Build muscle', subtitle: 'Progressive lifting + calorie surplus', icon: 'arm-flex-outline',
        defaults: { goalMode: 'bulk', dailyCalorieGoal: 2800, workoutsPerWeek: 5 } },
      { key: 'stay_consistent', title: 'Stay consistent', subtitle: 'Show up daily, protect the streak', icon: 'trending-up',
        defaults: { goalMode: 'maintenance', dailyCalorieGoal: 2200, workoutsPerWeek: 4 } },
      { key: 'train_event', title: 'Train for an event', subtitle: 'Race, meet, or competition prep', icon: 'target',
        defaults: { goalMode: 'maintenance', dailyCalorieGoal: 2400, workoutsPerWeek: 5 } },
    ] as const,
  },

  // MMR explainer — between the intent picker and Basic Info.
  mmrIntro: {
    headline: "Climb the ranks",
    subtext: "Hit your goals, earn Fitness Points, move up. Miss, and you slip.",
    cta: "Got it",
    rows: [
      { icon: 'calendar-check', tint: 'primary', title: 'Win your week', subtitle: 'Hit your weekly goals to earn FP' },
      { icon: 'arm-flex-outline', tint: 'gold', title: 'Harder goals, faster climb', subtitle: 'Tougher targets are worth more FP' },
      { icon: 'shield-half-full', tint: 'success', title: 'Consistency protects you', subtitle: 'Streaks build shields; missed weeks cost rank' },
    ] as const,
  },

  // Screen 2: Basic Info
  basicInfo: {
    headline: "Basic info",
    subtext: "Your targets get built from this.",
  },

  // Recommended targets — computed from intent + basic info, user can tweak.
  recommended: {
    headline: "Your starting targets",
    subtextPersonalized: "Built from your stats and goal. Adjust anything before you lock it in.",
    subtextFallback: "Solid starting points. Adjust anything before you lock it in.",
    cta: "Looks good",
    note: "Change these anytime in Goals. Harder targets earn more FP.",
  },
  
  // Screen 3: Accountability
  accountability: {
    headline: "Motivation fades.\nAccountability doesn't.",
    subtext: "Everyone's dangerous for two weeks in January. The ones still going in March answer to somebody else.",
    primaryStat: "People who sent weekly progress reports to a friend hit their goals at 76%. People who kept their goals private: 43%.",
    statHighlight: "76%",
    citation: "Dr. Gail Matthews, Dominican University of California",
    supportingLine: "Weekly progress, shared with people who expect it.",
    productTieIn: "",
  },
  
  // Screen 4: Goals
  goals: {
    headline: "Set your goals",
    subtext: "These power your dashboard.",
  },
  
  // Screen 5: Finish
  finish: {
    headline: "You're set.",
    subtext: "Goals locked. One thing left: the people who'll hold you to them.",
  },
};
