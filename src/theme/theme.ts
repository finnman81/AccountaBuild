import { MD3DarkTheme, configureFonts } from 'react-native-paper';
import { colors as themeColors } from './colors';

// Use theme tokens for core colors, maintain react-native-paper compatibility
const colors = {
  primary: themeColors.primary,
  secondary: '#E05A5A', // muted red (kept for backward compat)
  background: themeColors.background,
  surface: themeColors.surface,
  surfaceVariant: themeColors.surface2,
  outline: themeColors.divider,
  onPrimary: '#0B1020',
  onSecondary: '#1A0B0B',
  onBackground: themeColors.textPrimary,
  onSurface: themeColors.textPrimary,
  // Additional react-native-paper required colors
  onSurfaceVariant: themeColors.textSecondary,
  outlineVariant: themeColors.divider,
  backdrop: 'rgba(0, 0, 0, 0.5)',
  secondaryContainer: themeColors.surface2,
  onSecondaryContainer: themeColors.textPrimary,
};

const fontConfig = {
  fontFamily: 'Inter_400Regular',
  fontWeight: 'normal',
};

export const appTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...colors,
  },
  fonts: configureFonts({
    config: {
      ...MD3DarkTheme.fonts,
      bodyLarge: { ...MD3DarkTheme.fonts.bodyLarge, fontFamily: 'Inter_400Regular' },
      bodyMedium: { ...MD3DarkTheme.fonts.bodyMedium, fontFamily: 'Inter_400Regular' },
      bodySmall: { ...MD3DarkTheme.fonts.bodySmall, fontFamily: 'Inter_400Regular' },
      labelLarge: { ...MD3DarkTheme.fonts.labelLarge, fontFamily: 'Inter_500Medium' },
      labelMedium: { ...MD3DarkTheme.fonts.labelMedium, fontFamily: 'Inter_500Medium' },
      labelSmall: { ...MD3DarkTheme.fonts.labelSmall, fontFamily: 'Inter_500Medium' },
      titleLarge: { ...MD3DarkTheme.fonts.titleLarge, fontFamily: 'Inter_600SemiBold' },
      titleMedium: { ...MD3DarkTheme.fonts.titleMedium, fontFamily: 'Inter_600SemiBold' },
      titleSmall: { ...MD3DarkTheme.fonts.titleSmall, fontFamily: 'Inter_600SemiBold' },
      headlineSmall: { ...MD3DarkTheme.fonts.headlineSmall, fontFamily: 'Inter_600SemiBold' },
      headlineMedium: { ...MD3DarkTheme.fonts.headlineMedium, fontFamily: 'Inter_600SemiBold' },
      headlineLarge: { ...MD3DarkTheme.fonts.headlineLarge, fontFamily: 'Inter_600SemiBold' },
    },
  }),
};


