import React from 'react';
import { TextStyle } from 'react-native';
import { Text, TextProps, useTheme } from 'react-native-paper';
import { typography } from '../../theme/typography';
import { colors } from '../../theme/colors';

type Variant = keyof typeof typography;
type Color = 'primary' | 'secondary' | 'muted' | 'default' | 'accent' | 'success' | 'gold' | 'danger';

type AppTextProps = Omit<TextProps<never>, 'variant'> & {
  variant?: Variant;
  color?: Color;
};

const COLOR_MAP: Record<Exclude<Color, 'default'>, string> = {
  primary: colors.textPrimary,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  accent: colors.primaryOnDark,
  success: colors.success,
  gold: colors.rankGold,
  danger: colors.danger,
};

/**
 * Themed Text. `variant` maps to any key of the Midnight Blue typography scale
 * (the full token object is spread, so letterSpacing / textTransform /
 * tabular-nums carry through). `color` covers the common semantic text colors;
 * anything else can still be overridden via `style`.
 */
export default function AppText({ variant = 'body', color = 'default', style, ...props }: AppTextProps) {
  const theme = useTheme();
  const typo = typography[variant];
  const textColor = color === 'default' ? theme.colors.onSurface : COLOR_MAP[color];

  return <Text {...props} style={[typo as TextStyle, { color: textColor }, style]} />;
}
