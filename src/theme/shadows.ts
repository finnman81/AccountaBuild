import { Platform, ViewStyle } from 'react-native';

/**
 * Shadow tokens ("Midnight Blue"). Keep shadows purposeful.
 */

// Subtle card shadow (kept name `shadow` for back-compat).
export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  ...(Platform.OS === 'android' && { elevation: 2 }),
} as const;

// Primary CTA glow: 0 8px 22px rgba(62,139,255,0.35).
export const primaryButtonShadow = {
  shadowColor: '#3E8BFF',
  shadowOpacity: 0.35,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 8 },
  ...(Platform.OS === 'android' && { elevation: 8 }),
} as const;

/**
 * Colored glow used behind the rank emblem: 0 10px 26px <tierColor@0.3>.
 */
export function emblemShadow(tierColor: string): ViewStyle {
  return {
    shadowColor: tierColor,
    shadowOpacity: 0.3,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 10 },
    ...(Platform.OS === 'android' && { elevation: 10 }),
  };
}
