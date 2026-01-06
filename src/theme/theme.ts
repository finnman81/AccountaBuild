import { MD3DarkTheme, configureFonts } from 'react-native-paper';

// Dark charcoal base + electric blue primary + muted red secondary
const colors = {
  primary: '#3B82F6', // electric-ish blue
  secondary: '#E05A5A', // muted red
  background: '#121212', // charcoal
  surface: '#1A1A1A',
  surfaceVariant: '#242424',
  outline: '#3A3A3A',
  onPrimary: '#0B1020',
  onSecondary: '#1A0B0B',
  onBackground: '#E8E8E8',
  onSurface: '#E8E8E8',
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


