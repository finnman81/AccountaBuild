/**
 * Spacing scale - use only these values
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Default spacing values
 */
export const spacingDefaults = {
  screenPadding: spacing.base, // 16
  cardPadding: spacing.base, // 16
  sectionSpacing: spacing.xl, // 24
  cardGap: spacing.md, // 12
} as const;
