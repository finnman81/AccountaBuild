/**
 * Typography scale and variants
 */

export const typography = {
  title: {
    fontSize: 18,
    fontWeight: '600' as const, // semibold
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const, // regular
  },
  label: {
    fontSize: 12,
    fontWeight: '400' as const, // regular
  },
  numberLg: {
    fontSize: 32,
    fontWeight: '700' as const, // bold
  },
  numberMd: {
    fontSize: 22,
    fontWeight: '600' as const, // semibold
  },
} as const;
