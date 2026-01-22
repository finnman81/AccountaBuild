import { bandForMMR, bandBelowFor, demotionThresholdForBand } from './ranks';

export type DemotionRisk = {
  level: 'none' | 'watch' | 'danger';
  message: string;
};

export function demotionRisk(params: {
  mmr: number;
  consecutiveMissedWeeks: number;
  tierShieldWeeksRemaining: number;
  missedLastWeek: boolean;
  weekProgress?: number; // 0-1, where 1 = end of week (optional, defaults to showing immediately)
  weekCompletion?: number; // 0-1, current completion % (optional)
}): DemotionRisk {
  const { 
    mmr, 
    consecutiveMissedWeeks, 
    tierShieldWeeksRemaining, 
    missedLastWeek,
    weekProgress = 1, // Default to end of week (always show) for backward compatibility
    weekCompletion = 1, // Default to 100% (no warning) for backward compatibility
  } = params;

  // Always show warnings for missed weeks (these are critical)
  if (missedLastWeek) {
    return { level: 'danger', message: 'Missed last week. Log this week to avoid further penalty and demotion risk.' };
  }
  if (consecutiveMissedWeeks >= 2) {
    return { level: 'danger', message: 'You have missed 2+ weeks. Your demotion shield is gone until you complete a week.' };
  }
  if (consecutiveMissedWeeks === 1) {
    return { level: 'watch', message: 'You missed last week. Complete this week to stabilize your rank.' };
  }

  const band = bandForMMR(mmr);
  const threshold = demotionThresholdForBand(band);
  const dist = Math.round(mmr - threshold);

  // Within this window, show a warning.
  // But only if: (1) later in the week (Thursday+), AND (2) user hasn't hit any targets yet
  const window = 80;
  if (dist <= window) {
    // Only show warning later in the week (60% = ~Thursday) if user has 0% completion
    const isLaterInWeek = weekProgress >= 0.6; // Thursday or later
    const hasNoProgress = weekCompletion === 0;
    
    // If it's early in the week OR user has made progress, don't show the warning
    if (!isLaterInWeek || !hasNoProgress) {
      return { level: 'none', message: '' };
    }

    const below = bandBelowFor(band);
    const isTierBoundary = below ? below.tier !== band.tier : false;
    const shieldNote = isTierBoundary && tierShieldWeeksRemaining > 0 ? ` (Tier shield: ${tierShieldWeeksRemaining}w)` : '';
    const msg = dist <= 0 ? `Demotion risk now${shieldNote}.` : `Close to demotion (${dist} MMR buffer)${shieldNote}.`;
    return { level: dist <= 0 ? 'danger' : 'watch', message: msg };
  }

  return { level: 'none', message: '' };
}

