import type { Division, Tier } from './types';

export type Band = { tier: Tier; division?: Division; min: number; max: number };

// Source of truth bands (v1). Matches your spec.
export const BANDS: Band[] = [
  // Iron
  { tier: 'Iron', division: 4, min: 0, max: 249 },
  { tier: 'Iron', division: 3, min: 250, max: 499 },
  { tier: 'Iron', division: 2, min: 500, max: 749 },
  { tier: 'Iron', division: 1, min: 750, max: 999 },
  // Bronze
  { tier: 'Bronze', division: 4, min: 1000, max: 1199 },
  { tier: 'Bronze', division: 3, min: 1200, max: 1399 },
  { tier: 'Bronze', division: 2, min: 1400, max: 1599 },
  { tier: 'Bronze', division: 1, min: 1600, max: 1799 },
  // Silver
  { tier: 'Silver', division: 4, min: 1800, max: 1999 },
  { tier: 'Silver', division: 3, min: 2000, max: 2199 },
  { tier: 'Silver', division: 2, min: 2200, max: 2399 },
  { tier: 'Silver', division: 1, min: 2400, max: 2599 },
  // Gold
  { tier: 'Gold', division: 4, min: 2600, max: 2799 },
  { tier: 'Gold', division: 3, min: 2800, max: 2999 },
  { tier: 'Gold', division: 2, min: 3000, max: 3249 },
  { tier: 'Gold', division: 1, min: 3250, max: 3499 },
  // Platinum
  { tier: 'Platinum', division: 4, min: 3500, max: 3749 },
  { tier: 'Platinum', division: 3, min: 3750, max: 3999 },
  { tier: 'Platinum', division: 2, min: 4000, max: 4249 },
  { tier: 'Platinum', division: 1, min: 4250, max: 4499 },
  // Diamond
  { tier: 'Diamond', division: 4, min: 4500, max: 4849 },
  { tier: 'Diamond', division: 3, min: 4850, max: 5199 },
  { tier: 'Diamond', division: 2, min: 5200, max: 5499 },
  { tier: 'Diamond', division: 1, min: 5500, max: 5799 },
  // Master / Challenger
  { tier: 'Master', min: 5800, max: 6999 },
  { tier: 'Challenger', min: 7000, max: 999999 },
];

export function clamp(min: number, max: number, x: number) {
  return Math.max(min, Math.min(max, x));
}

export function bandForMMR(mmr: number): Band {
  const x = Math.max(0, Math.round(mmr));
  return BANDS.find((b) => x >= b.min && x <= b.max) ?? BANDS[0];
}

export function lpForMMR(mmr: number, band: Band): number {
  if (!band.division) return 0;
  const denom = Math.max(1, band.max - band.min);
  return clamp(0, 100, Math.round(100 * ((mmr - band.min) / denom)));
}

export const DIV_DEMOTE_BUFFER = 40;
export const TIER_DEMOTE_BUFFER = 120;

function bandIndex(b: Band) {
  return BANDS.findIndex((x) => x.tier === b.tier && x.division === b.division && x.min === b.min && x.max === b.max);
}

function isHigherOrEqual(a: Band, b: Band) {
  return bandIndex(a) >= bandIndex(b);
}

export function bandOrderIndex(b: Band) {
  return bandIndex(b);
}

export function isStrictlyHigher(a: Band, b: Band) {
  return bandIndex(a) > bandIndex(b);
}

function bandBelow(b: Band): Band | null {
  const idx = bandIndex(b);
  if (idx <= 0) return null;
  return BANDS[idx - 1] ?? null;
}

function tierFloorBand(tier: Tier): Band {
  // Lowest MMR band in a tier.
  // For division tiers, that's Division IV. For Master/Challenger (no divisions), it's the band itself.
  const divisionTier = BANDS.find((b) => b.tier === tier && b.division === 4);
  if (divisionTier) return divisionTier;
  return BANDS.find((b) => b.tier === tier && b.division == null) ?? bandForMMR(0);
}

export function bandBelowFor(b: Band): Band | null {
  return bandBelow(b);
}

export function demotionThresholdForBand(oldBand: Band): number {
  const below = bandBelow(oldBand);
  const tierDemotion = below ? below.tier !== oldBand.tier : false;
  const buffer = tierDemotion ? TIER_DEMOTE_BUFFER : DIV_DEMOTE_BUFFER;
  return oldBand.min - buffer;
}

export function applyRankWithDemotionRules(params: {
  oldBand: Band;
  newMMR: number;
  tierShieldWeeksRemaining: number;
}): { band: Band; lp: number } {
  const candidate = bandForMMR(params.newMMR);

  // Promotion / same-band: accept immediately.
  if (isHigherOrEqual(candidate, params.oldBand)) {
    return { band: candidate, lp: lpForMMR(params.newMMR, candidate) };
  }

  // Candidate is lower (demotion).
  const tierDemotion = candidate.tier !== params.oldBand.tier;
  if (tierDemotion && params.tierShieldWeeksRemaining > 0) {
    // Shield blocks tier demotion: stay in old tier floor (lowest division).
    const floored = tierFloorBand(params.oldBand.tier);
    return { band: floored, lp: lpForMMR(params.newMMR, floored) };
  }

  const threshold = demotionThresholdForBand(params.oldBand);
  if (params.newMMR > threshold) {
    // Hysteresis prevents demotion.
    return { band: params.oldBand, lp: lpForMMR(params.newMMR, params.oldBand) };
  }

  return { band: candidate, lp: lpForMMR(params.newMMR, candidate) };
}

