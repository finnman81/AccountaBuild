/**
 * Server-side season rollover — admin-SDK port of the client's (now removed)
 * src/services/mmrSeason.ts ensureSeasonRollover.
 *
 * WHY: rollover was client-only, so inactive users never soft-reset at the
 * quarter boundary (the TODO(season) in index.js). With scoring consolidated
 * server-side (2026-07-22), this runs in updateMmrScheduled for every user and
 * in the recomputeMyMmr callable, and the client no longer writes mmr at all.
 *
 * Soft-reset mapping (mmr.txt 9.3/9.4):
 *   Iron→Iron, Bronze→Bronze, Silver→Bronze, Gold→Silver,
 *   Platinum→Silver, Diamond→Gold, Master→Platinum, Challenger→Diamond
 */
const { FieldValue } = require('firebase-admin/firestore');
const core = require('./mmr-core');

function findBandForRank(tier, division) {
  if (division) {
    const b = core.BANDS.find((x) => x.tier === tier && x.division === division);
    if (b) return b;
  }
  return core.BANDS.find((x) => x.tier === tier) ?? core.bandForMMR(0);
}

function bandMidpointMMR(b) {
  return Math.round((b.min + b.max) / 2);
}

function resetTargetTierFromSpec(srcTier) {
  switch (srcTier) {
    case 'Iron': return 'Iron';
    case 'Bronze': return 'Bronze';
    case 'Silver': return 'Bronze';
    case 'Gold': return 'Silver';
    case 'Platinum': return 'Silver';
    case 'Diamond': return 'Gold';
    case 'Master': return 'Platinum';
    case 'Challenger': return 'Diamond';
    default: return srcTier;
  }
}

function resetTargetDivisionFromSpec(srcTier, srcDivision) {
  if (srcDivision) return srcDivision;
  if (srcTier === 'Master') return 2; // Master → Platinum II (default)
  if (srcTier === 'Challenger') return 1; // Challenger → Diamond I (default)
  return 1;
}

/**
 * Idempotent: no-op when the user is already in the current season (or has
 * already been rolled to it by a concurrent run — lastSeasonRolledTo guard).
 */
async function ensureSeasonRollover(db, uid, now = new Date()) {
  const currentSeasonId = core.seasonIdFromDate(now, core.DEFAULT_TZ);
  const userRef = db.collection('users').doc(uid);
  const publicRef = db.collection('publicUsers').doc(uid);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      tx.set(userRef, { currentSeasonId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return;
    }

    const u = userSnap.data() || {};
    const prevSeasonId = String(u?.currentSeasonId ?? '').trim();

    if (!prevSeasonId) {
      tx.set(userRef, { currentSeasonId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    if (prevSeasonId === currentSeasonId) return;
    if (String(u?.lastSeasonRolledTo ?? '').trim() === currentSeasonId) return;

    const mmrBefore = typeof u?.mmr === 'number' ? Number(u.mmr) : core.STARTING_MMR;
    const bandBefore = core.bandForMMR(mmrBefore);
    const mpBefore = core.mpForMMR(mmrBefore, bandBefore);

    const finalTier = u?.rankTier ?? bandBefore.tier;
    const finalDivision = u?.rankDivision ?? bandBefore.division ?? null;

    const peak = u?.seasonPeak?.seasonId === prevSeasonId ? u.seasonPeak : null;
    const peakTier = peak?.tier ?? finalTier;
    const peakDivision = peak?.division ?? finalDivision ?? null;
    const peakMMR = typeof peak?.mmr === 'number' ? Number(peak.mmr) : mmrBefore;
    const peakBand = core.bandForMMR(peakMMR);
    const peakMP = core.mpForMMR(peakMMR, peakBand);

    // Season badges (private) + compact result records.
    const seasonRankBadgeId = `${prevSeasonId}-rank`;
    tx.set(userRef.collection('badges').doc(seasonRankBadgeId), {
      type: 'seasonRank', seasonId: prevSeasonId, tier: finalTier, division: finalDivision,
      mmr: mmrBefore, mp: mpBefore, earnedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const seasonPeakBadgeId = `${prevSeasonId}-peak`;
    tx.set(userRef.collection('badges').doc(seasonPeakBadgeId), {
      type: 'seasonPeak', seasonId: prevSeasonId, tier: peakTier, division: peakDivision,
      mmr: peakMMR, mp: peakMP, earnedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    tx.set(userRef.collection('seasonResults').doc(prevSeasonId), {
      seasonId: prevSeasonId, endedAt: FieldValue.serverTimestamp(),
      final: { tier: finalTier, division: finalDivision, mmr: mmrBefore, mp: mpBefore },
    }, { merge: true });

    tx.set(userRef.collection('seasons').doc(prevSeasonId), {
      seasonId: prevSeasonId, endedAt: FieldValue.serverTimestamp(), endMMR: mmrBefore,
      endRank: { tier: finalTier, division: finalDivision, mp: mpBefore },
      peakRank: { tier: peakTier, division: peakDivision, mmr: peakMMR, mp: peakMP },
      badgesEarned: [seasonRankBadgeId, seasonPeakBadgeId],
    }, { merge: true });

    // Soft reset.
    const srcTier = bandBefore.tier;
    const srcDiv = bandBefore.division ?? null;
    const targetBand = findBandForRank(resetTargetTierFromSpec(srcTier), resetTargetDivisionFromSpec(srcTier, srcDiv));
    const mmrAfterReset = bandMidpointMMR(targetBand);
    const bandAfterReset = core.bandForMMR(mmrAfterReset);
    const mpAfterReset = core.mpForMMR(mmrAfterReset, bandAfterReset);

    tx.set(userRef, {
      mmr: mmrAfterReset,
      rankTier: bandAfterReset.tier,
      rankDivision: bandAfterReset.division ?? null,
      mp: mpAfterReset,
      streakWeeks: 0,
      tierShieldWeeksRemaining: 0,
      consecutiveMissedWeeks: 0,
      seasonPeak: { seasonId: currentSeasonId, tier: bandAfterReset.tier, division: bandAfterReset.division ?? null, mmr: mmrAfterReset },
      currentSeasonId,
      lastSeasonRolledFrom: prevSeasonId,
      lastSeasonRolledTo: currentSeasonId,
      seasonRolledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    tx.set(userRef.collection('seasons').doc(currentSeasonId), {
      seasonId: currentSeasonId, startedAt: FieldValue.serverTimestamp(), startMMR: mmrAfterReset,
      startRank: { tier: bandAfterReset.tier, division: bandAfterReset.division ?? null, mp: mpAfterReset },
      peakRank: { tier: bandAfterReset.tier, division: bandAfterReset.division ?? null, mmr: mmrAfterReset, mp: mpAfterReset },
      rulesVersion: String(u?.rulesVersion ?? 'v1'),
    }, { merge: true });

    tx.set(publicRef, {
      mmrPublic: mmrAfterReset,
      rankTierPublic: bandAfterReset.tier,
      rankDivisionPublic: bandAfterReset.division ?? null,
      mpPublic: mpAfterReset,
      seasonIdPublic: currentSeasonId,
      updatedAtPublic: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

module.exports = { ensureSeasonRollover, resetTargetTierFromSpec, resetTargetDivisionFromSpec };
