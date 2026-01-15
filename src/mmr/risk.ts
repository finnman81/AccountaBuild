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
}): DemotionRisk {
  const { mmr, consecutiveMissedWeeks, tierShieldWeeksRemaining, missedLastWeek } = params;

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
  const window = 80;
  if (dist <= window) {
    const below = bandBelowFor(band);
    const isTierBoundary = below ? below.tier !== band.tier : false;
    const shieldNote = isTierBoundary && tierShieldWeeksRemaining > 0 ? ` (Tier shield: ${tierShieldWeeksRemaining}w)` : '';
    const msg = dist <= 0 ? `Demotion risk now${shieldNote}.` : `Close to demotion (${dist} MMR buffer)${shieldNote}.`;
    return { level: dist <= 0 ? 'danger' : 'watch', message: msg };
  }

  return { level: 'none', message: '' };
}

