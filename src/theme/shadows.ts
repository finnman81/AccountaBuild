import { Platform } from 'react-native';

/**
 * Subtle shadow definition
 * Avoid heavier shadows - keep it minimal
 */

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 8,
  shadowOffset: {
    width: 0,
    height: 2,
  },
  ...(Platform.OS === 'android' && {
    elevation: 2,
  }),
} as const;
