/**
 * MyFitnessPal-style dark color palette
 * Restrained palette with single blue accent
 */

export const colors = {
  // Core surfaces - proper luminance hierarchy
  background: '#0E0F13', // Darkest (base)
  surface: '#171A21', // Card: +6-8% lighter than background
  surface2: '#232835', // Inner panel: +12-15% lighter than background (was only 3-4% gap)
  divider: '#22252D',
  
  // Status pill backgrounds
  pillNoLog: '#1E2532', // Blue-gray tint for "No log" pill (Apple Health style)

  // Text
  textPrimary: '#F3F4F6',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',

  // Accent (single blue)
  primary: '#3B82F6',

  // Status colors
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',

  // Avatar ring colors (Team Today)
  ringLogged: '#3B82F6', // blue
  ringNotLogged: '#4B5563', // neutral gray
  ringStreakLeader: '#F59E0B', // gold
  riskDot: '#EF4444', // red
} as const;
