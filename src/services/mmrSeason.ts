import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import type { Tier } from '../mmr/types';
import { bandForMMR, mpForMMR, BANDS, type Band } from '../mmr/ranks';
import { DEFAULT_TZ, seasonIdFromDate } from '../mmr/time';

function findBandForRank(tier: Tier, division?: 1 | 2 | 3 | 4): Band {
  if (division) {
    const b = BANDS.find((x) => x.tier === tier && x.division === division);
    if (b) return b;
  }
  return BANDS.find((x) => x.tier === tier) ?? bandForMMR(0);
}

function bandMidpointMMR(b: Band) {
  // midpoint inside [min,max]
  return Math.round((b.min + b.max) / 2);
}

function resetTargetTierFromSpec(srcTier: Tier): Tier {
  // mmr.txt mapping (Section 9.3/9.4):
  // Iron→Iron, Bronze→Bronze
  // Silver→Bronze (drop 1)
  // Gold→Silver (drop 1)
  // Platinum→Silver (drop 2)
  // Diamond→Gold (drop 2)
  // Master→Platinum (drop 2)
  // Challenger→Diamond (drop 2)
  switch (srcTier) {
    case 'Iron':
      return 'Iron';
    case 'Bronze':
      return 'Bronze';
    case 'Silver':
      return 'Bronze';
    case 'Gold':
      return 'Silver';
    case 'Platinum':
      return 'Silver';
    case 'Diamond':
      return 'Gold';
    case 'Master':
      return 'Platinum';
    case 'Challenger':
      return 'Diamond';
    default:
      return srcTier;
  }
}

function resetTargetDivisionFromSpec(srcTier: Tier, srcDivision: 1 | 2 | 3 | 4 | null): 1 | 2 | 3 | 4 {
  // Preserve division index when possible. For tiers without divisions, follow defaults from mmr.txt.
  if (srcDivision) return srcDivision;
  if (srcTier === 'Master') return 2; // Master → Platinum II (default)
  if (srcTier === 'Challenger') return 1; // Challenger → Diamond I (default)
  return 1;
}

export async function ensureSeasonRollover(uid: string) {
  const currentSeasonId = seasonIdFromDate(new Date(), DEFAULT_TZ);

  await runTransaction(db, async (tx) => {
    const userRef = doc(db, 'users', uid);
    const publicRef = doc(db, 'publicUsers', uid);

    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) {
      // Create minimal season marker; MMR init happens elsewhere.
      tx.set(userRef, { currentSeasonId, updatedAt: serverTimestamp() }, { merge: true });
      return;
    }

    const u = userSnap.data() as any;
    const prevSeasonId = String(u?.currentSeasonId ?? '').trim();

    // First-time init.
    if (!prevSeasonId) {
      tx.set(userRef, { currentSeasonId, updatedAt: serverTimestamp() }, { merge: true });
      return;
    }

    if (prevSeasonId === currentSeasonId) return;

    // Avoid double-rolling if multiple clients open.
    const lastRolledTo = String(u?.lastSeasonRolledTo ?? '').trim();
    if (lastRolledTo === currentSeasonId) return;

    const mmrBefore = typeof u?.mmr === 'number' ? Number(u.mmr) : 1000;
    const bandBefore = bandForMMR(mmrBefore);
    const mpBefore = mpForMMR(mmrBefore, bandBefore);

    const finalTier = (u?.rankTier ?? bandBefore.tier) as Tier;
    const finalDivision = (u?.rankDivision ?? bandBefore.division ?? null) as 1 | 2 | 3 | 4 | null;

    const peak = (u?.seasonPeak?.seasonId === prevSeasonId ? u.seasonPeak : null) as
      | { seasonId: string; tier: Tier; division?: 1 | 2 | 3 | 4 | null; mmr: number }
      | null;
    const peakTier = (peak?.tier ?? finalTier) as Tier;
    const peakDivision = (peak?.division ?? finalDivision ?? null) as 1 | 2 | 3 | 4 | null;
    const peakMMR = typeof peak?.mmr === 'number' ? Number(peak.mmr) : mmrBefore;
    const peakBand = bandForMMR(peakMMR);
    const peakMP = mpForMMR(peakMMR, peakBand);

    // Award season badges (private)
    const seasonRankBadgeId = `${prevSeasonId}-rank`;
    tx.set(
      doc(db, 'users', uid, 'badges', seasonRankBadgeId),
      {
        type: 'seasonRank',
        seasonId: prevSeasonId,
        tier: finalTier,
        division: finalDivision,
        mmr: mmrBefore,
        mp: mpBefore,
        earnedAt: serverTimestamp(),
      },
      { merge: true },
    );

    const seasonPeakBadgeId = `${prevSeasonId}-peak`;
    tx.set(
      doc(db, 'users', uid, 'badges', seasonPeakBadgeId),
      {
        type: 'seasonPeak',
        seasonId: prevSeasonId,
        tier: peakTier,
        division: peakDivision,
        mmr: peakMMR,
        mp: peakMP,
        earnedAt: serverTimestamp(),
      },
      { merge: true },
    );

    // Also keep a compact season result record.
    tx.set(
      doc(db, 'users', uid, 'seasonResults', prevSeasonId),
      {
        seasonId: prevSeasonId,
        endedAt: serverTimestamp(),
        final: { tier: finalTier, division: finalDivision, mmr: mmrBefore, mp: mpBefore },
      },
      { merge: true },
    );

    // Legacy-spec aligned per-season summary doc
    tx.set(
      doc(db, 'users', uid, 'seasons', prevSeasonId),
      {
        seasonId: prevSeasonId,
        endedAt: serverTimestamp(),
        endMMR: mmrBefore,
        endRank: { tier: finalTier, division: finalDivision, mp: mpBefore },
        peakRank: { tier: peakTier, division: peakDivision, mmr: peakMMR, mp: peakMP },
        badgesEarned: [seasonRankBadgeId, seasonPeakBadgeId],
      },
      { merge: true },
    );

    // Soft reset mapping: follow mmr.txt mapping table.
    const srcTier = bandBefore.tier;
    const srcDiv = (bandBefore.division ?? null) as 1 | 2 | 3 | 4 | null;
    const targetTier = resetTargetTierFromSpec(srcTier);
    const targetDiv = resetTargetDivisionFromSpec(srcTier, srcDiv);
    const targetBand = findBandForRank(targetTier, targetDiv);
    const mmrAfterReset = bandMidpointMMR(targetBand);
    const bandAfterReset = bandForMMR(mmrAfterReset);
    const mpAfterReset = mpForMMR(mmrAfterReset, bandAfterReset);

    tx.set(
      userRef,
      {
        mmr: mmrAfterReset,
        rankTier: bandAfterReset.tier,
        rankDivision: bandAfterReset.division ?? null,
        mp: mpAfterReset,

        // Reset season-scoped counters
        streakWeeks: 0,
        tierShieldWeeksRemaining: 0, // Cleared on season reset (re-earned on tier promotion)
        consecutiveMissedWeeks: 0,

        // Initialize season peak for new season
        seasonPeak: {
          seasonId: currentSeasonId,
          tier: bandAfterReset.tier,
          division: bandAfterReset.division ?? null,
          mmr: mmrAfterReset,
        },

        currentSeasonId,
        lastSeasonRolledFrom: prevSeasonId,
        lastSeasonRolledTo: currentSeasonId,
        seasonRolledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    // Create/merge new season doc start snapshot
    tx.set(
      doc(db, 'users', uid, 'seasons', currentSeasonId),
      {
        seasonId: currentSeasonId,
        startedAt: serverTimestamp(),
        startMMR: mmrAfterReset,
        startRank: { tier: bandAfterReset.tier, division: bandAfterReset.division ?? null, mp: mpAfterReset },
        peakRank: { tier: bandAfterReset.tier, division: bandAfterReset.division ?? null, mmr: mmrAfterReset, mp: mpAfterReset },
        rulesVersion: String(u?.rulesVersion ?? 'v1'),
      },
      { merge: true },
    );

    tx.set(
      publicRef,
      {
        mmrPublic: mmrAfterReset,
        rankTierPublic: bandAfterReset.tier,
        rankDivisionPublic: bandAfterReset.division ?? null,
        mpPublic: mpAfterReset,
        seasonIdPublic: currentSeasonId,
        updatedAtPublic: serverTimestamp(),
      },
      { merge: true },
    );
  });
}

