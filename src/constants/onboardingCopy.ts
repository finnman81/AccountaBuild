/**
 * Configurable copy for onboarding screens
 * Update these values as needed, especially the research stat text
 */

export const onboardingCopy = {
  // Screen 1: Welcome screen ("Midnight Blue" revamp — design 01)
  welcome: {
    headline: "Fitness is a\nteam sport.",
    subtext: "AccountaBuild keeps you honest — log daily, climb the ranks, and never let your crew down.",
    credibilityLine: "Log in seconds. Rank up weekly.",
    cta: "Get started",
    ctaSubtext: "Takes ~60 seconds",
    valueRows: [
      { icon: 'clock-fast', tint: 'primary', title: 'Log in seconds', subtitle: 'Calories, workouts, weight — one tap each' },
      { icon: 'account-group', tint: 'success', title: 'Your crew sees you', subtitle: 'Everyone knows who showed up today' },
      { icon: 'diamond-stone', tint: 'gold', title: 'Climb the ranks', subtitle: 'Seasonal Fitness Points from Iron to Challenger' },
    ] as const,
  },

  // Screen 2: "What are you training for?" — intent picker (design 02).
  // Each intent seeds sensible default goals; detailed tuning lives in Edit Profile.
  goalsIntent: {
    headline: "What are you\ntraining for?",
    subtext: "This sets your default goals — you can change it anytime.",
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
    subtext: "Every week you hit your goals, you earn Fitness Points (FP) and move up the ladder — from Iron all the way to Challenger.",
    cta: "Got it",
    rows: [
      { icon: 'calendar-check', tint: 'primary', title: 'Win your week', subtitle: 'Hit your weekly goals to earn rank points' },
      { icon: 'arm-flex-outline', tint: 'gold', title: 'Harder goals, faster climb', subtitle: 'Tougher targets are worth more — difficulty multiplies your gains' },
      { icon: 'shield-half-full', tint: 'success', title: 'Consistency protects you', subtitle: 'Streaks build shields; missed weeks cost rank' },
    ] as const,
  },

  // Screen 2: Basic Info
  basicInfo: {
    headline: "Basic info",
    subtext: "This helps set realistic targets.",
  },

  // Recommended targets — computed from intent + basic info, user can tweak.
  recommended: {
    headline: "Your recommended targets",
    subtextPersonalized: "Based on your stats and goal — tweak anything before you lock it in.",
    subtextFallback: "Solid starting points for your goal — tweak anything before you lock it in.",
    cta: "Looks good",
    note: "You can change these anytime in Goals. Harder targets earn more FP.",
  },
  
  // Screen 3: Accountability
  accountability: {
    headline: "Accountability improves consistency",
    subtext: "A system built around shared goals and accountability.",
    primaryStat: "People are up to 65% more likely to reach a goal when they commit to someone else.",
    statHighlight: "65% more likely",
    citation: "American Society of Training & Development",
    supportingLine: "Group-based accountability improves exercise adherence and long-term consistency.",
    productTieIn: "AccountaBuild is designed around this principle.",
  },
  
  // Screen 4: Goals
  goals: {
    headline: "Set your goals",
    subtext: "These power your dashboard.",
  },
  
  // Screen 5: Finish
  finish: {
    headline: "You're set.",
    subtext: "Let's start building consistency.",
  },
};
