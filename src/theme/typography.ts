/**
 * Typography scale.
 *
 * Two faces (see fonts.ts): Inter for reading, the display face for numbers,
 * ranks, screen titles and buttons. Variants name a family, never a weight.
 * Numbers carry `fontVariant: ['tabular-nums']`.
 */
import type { FontVariant } from 'react-native';

import { display, inter } from './fonts';

const tabularNums: FontVariant[] = ['tabular-nums'];

export const typography = {
  // --- original variants (kept for back-compat) ---
  title: {
    fontSize: 18,
    fontFamily: inter.semibold,
  },
  body: {
    fontSize: 15,
    fontFamily: inter.regular,
  },
  label: {
    fontSize: 12,
    fontFamily: inter.regular,
  },
  numberLg: {
    fontSize: 38,
    fontFamily: display.extrabold,
    fontVariant: tabularNums,
  },
  numberMd: {
    fontSize: 26,
    fontFamily: display.bold,
    fontVariant: tabularNums,
  },

  // --- scale ---
  pageTitle: {
    fontSize: 32,
    fontFamily: display.extrabold,
    letterSpacing: 0.2,
    textTransform: 'uppercase' as const,
  },
  cardLabel: {
    fontSize: 13,
    fontFamily: inter.semibold,
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: inter.bold,
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: inter.semibold,
  },
  rowSubtitle: {
    fontSize: 12,
    fontFamily: inter.regular,
  },
  statBig: {
    fontSize: 38,
    fontFamily: display.extrabold,
    fontVariant: tabularNums,
  },
  heroNumeral: {
    fontSize: 84,
    fontFamily: display.extrabold,
    letterSpacing: -1,
    fontVariant: tabularNums,
  },

  // --- display face ---
  /** Screen greeting / big headline. */
  displayTitle: {
    fontSize: 44,
    lineHeight: 46,
    fontFamily: display.extrabold,
    textTransform: 'uppercase' as const,
  },
  /** Hero card title. */
  cardTitle: {
    fontSize: 24,
    lineHeight: 26,
    fontFamily: display.extrabold,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  /** Inline stat: "+186 FP", "5 OF 8 IN". */
  stat: {
    fontSize: 19,
    lineHeight: 22,
    fontFamily: display.bold,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
    fontVariant: tabularNums,
  },
  /** Chip label: "12 DAYS", "GOLD II". */
  chip: {
    fontSize: 15,
    lineHeight: 18,
    fontFamily: display.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    fontVariant: tabularNums,
  },
  /** Button label. */
  button: {
    fontSize: 18,
    lineHeight: 22,
    fontFamily: display.bold,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
} as const;
