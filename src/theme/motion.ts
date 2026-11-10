import { Easing } from 'react-native';

/**
 * One motion language for the app. Before this there were 16 durations, 7
 * easings and 3 spring tensions across the screens, which is why no two
 * things moved alike. Pick from here; don't invent a number.
 *
 *   instant   press feedback
 *   fast      small state changes, fades out
 *   base      fades in, toasts arriving
 *   slow      toasts leaving, sheets
 *   count     numbers counting, bars and rings filling
 *   celebrate big moments (streak ring, bursts)
 */
export const duration = {
  instant: 100,
  fast: 180,
  base: 260,
  slow: 420,
  count: 600,
  celebrate: 900,
} as const;

export const easing = {
  /** Moves and layout. */
  standard: Easing.bezier(0.2, 0, 0, 1),
  /** Things arriving, numbers counting. */
  enter: Easing.out(Easing.cubic),
  /** Things leaving. */
  exit: Easing.in(Easing.cubic),
  /** Slow breathing loops. */
  breathe: Easing.inOut(Easing.quad),
} as const;

/** RN Animated.spring configs (friction/tension). */
export const spring = {
  /** Press feedback: quick, no wobble. */
  press: { friction: 9, tension: 300 },
  /** Emblems and cards popping in. */
  pop: { friction: 6, tension: 80 },
} as const;

/** How long a toast stays fully visible. */
export const toastHold = 1600;

/** Scale of a pressed control. */
export const pressScale = 0.97;
