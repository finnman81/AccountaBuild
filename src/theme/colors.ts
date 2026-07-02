/**
 * "Midnight Blue" design system palette.
 *
 * All keys from the previous palette are preserved (existing screens import them),
 * with values shifted to the new system, plus new tokens for the revamp.
 */

import type { Tier } from '../mmr/types';

export const colors = {
  // Core surfaces
  background: '#0B0C10', // darkest base
  surface: '#14161D', // cards
  surface2: '#1D202A', // inner panels, inputs, inactive segments
  tabBar: '#101218',
  divider: 'rgba(255,255,255,0.06)', // hairline dividers
  borderCard: 'rgba(255,255,255,0.05)', // 1px card border
  dashedBorder: '#3A4152', // dashed/empty affordance border

  // Status pill backgrounds
  pillNoLog: '#1D202A',

  // Text
  textPrimary: '#F2F4F8',
  textSecondary: '#97A0B2',
  textMuted: '#626B7D',
  faint: '#3A4152', // faint/disabled text + inactive marks

  // Accent (single blue)
  primary: '#3E8BFF',
  primaryTint: 'rgba(62,139,255,0.14)', // tinted accent background
  primaryOnDark: '#7FB0FF', // lighter blue text on dark (e.g. "You" row)

  // Status colors
  success: '#33D573',
  successTint: 'rgba(51,213,115,0.15)',
  warning: '#F5A623',
  rankGold: '#E9B542', // rank/season gold (distinct from warning)
  danger: '#FF5D5D',
  dangerTint: 'rgba(255,93,93,0.14)',

  // Avatar ring / status colors (Team Today)
  ringLogged: '#3E8BFF', // blue
  ringNotLogged: '#2A2E38', // neutral gray
  ringStreakLeader: '#E9B542', // gold
  riskDot: '#FF5D5D', // red
} as const;

/**
 * Tier emblem gradient stops (135°). Iron is nearly flat; the rest are two-stop.
 * `numeral` is the dark tier-tinted color used for the division numeral (I–IV).
 */
export const tierColors: Record<Tier, { start: string; end: string; numeral: string }> = {
  Iron: { start: '#9A9A96', end: '#75756F', numeral: '#22221F' },
  Bronze: { start: '#D0A878', end: '#8F6B3E', numeral: '#2E1F0C' },
  Silver: { start: '#DFE5EE', end: '#9AA3B2', numeral: '#2A2F38' },
  Gold: { start: '#F2D879', end: '#C99B30', numeral: '#3D2C05' },
  Platinum: { start: '#8FE8D4', end: '#4DB3A0', numeral: '#0C2E28' },
  Diamond: { start: '#7FB8FF', end: '#3E6FD6', numeral: '#0A1E42' },
  Master: { start: '#C9A6FF', end: '#8B5CD6', numeral: '#22103F' },
  Challenger: { start: '#5EA3FF', end: '#2F6FD6', numeral: '#08183A' },
};
