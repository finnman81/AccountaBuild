/**
 * Typography scale and variants ("Midnight Blue").
 *
 * The original five variants (title/body/label/numberLg/numberMd) are preserved for
 * AppText and existing screens; the rest are the revamp scale. Numbers should always
 * carry `fontVariant: ['tabular-nums']` (see numeric variants below).
 */

const tabularNums = ['tabular-nums'] as const;

export const typography = {
  // --- original variants (kept for back-compat) ---
  title: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
  },
  label: {
    fontSize: 12,
    fontWeight: '400' as const,
  },
  numberLg: {
    fontSize: 32,
    fontWeight: '700' as const,
    fontVariant: tabularNums,
  },
  numberMd: {
    fontSize: 22,
    fontWeight: '600' as const,
    fontVariant: tabularNums,
  },

  // --- Midnight Blue scale ---
  pageTitle: {
    fontSize: 26,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  rowSubtitle: {
    fontSize: 12,
    fontWeight: '400' as const,
  },
  statBig: {
    fontSize: 32,
    fontWeight: '700' as const,
    fontVariant: tabularNums,
  },
  heroNumeral: {
    fontSize: 74,
    fontWeight: '800' as const,
    letterSpacing: -2,
    fontVariant: tabularNums,
  },
} as const;
