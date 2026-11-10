import type { TextStyle } from 'react-native';

/**
 * Font families. Each loaded file is ONE weight, so a weight is picked by
 * family name, never by `fontWeight` (a custom family plus fontWeight gives
 * the system font on iOS and fake bold on Android).
 *
 * Body text is Inter. Numbers, ranks, screen titles and buttons use the
 * display face (Barlow Condensed).
 */
export const inter = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export const display = {
  semibold: 'BarlowCondensed_600SemiBold',
  bold: 'BarlowCondensed_700Bold',
  extrabold: 'BarlowCondensed_800ExtraBold',
} as const;

function interFor(weight: TextStyle['fontWeight']): string {
  const n = weight === 'bold' ? 700 : weight === 'normal' || weight == null ? 400 : Number(weight) || 400;
  if (n >= 800) return inter.extrabold;
  if (n >= 700) return inter.bold;
  if (n >= 600) return inter.semibold;
  if (n >= 500) return inter.medium;
  return inter.regular;
}

const OURS = /^(Inter_|BarlowCondensed_)/;

/**
 * The font override for a flattened text style, or null to leave it alone.
 *
 * - One of our families is already named: drop the weight.
 * - Another family (monospace): leave it.
 * - No family: map the weight to an Inter file. A Paper `variant` with no
 *   weight of its own keeps the theme's font.
 */
export function resolveFont(flat: TextStyle | undefined, hasVariant = false): TextStyle | null {
  const family = flat?.fontFamily;
  if (family) return OURS.test(family) ? { fontWeight: 'normal' } : null;
  if (hasVariant && flat?.fontWeight == null) return null;
  return { fontFamily: interFor(flat?.fontWeight), fontWeight: 'normal' };
}
