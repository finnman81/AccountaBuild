import { doc, onSnapshot } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import type { Tier } from '../mmr/types';

export type MmrState = {
  mmr: number;
  rankTier: Tier;
  rankDivision?: 1 | 2 | 3 | 4;
  mp: number;
  streakWeeks: number;
  streakFreezes: number;
  tierShieldWeeksRemaining: number;
  consecutiveMissedWeeks: number;
  currentSeasonId: string;
  lastWeekIdUpdated: string | null;
  rulesVersion: string;
};

export function subscribeMyMmrState(uid: string, onChange: (state: MmrState | null) => void) {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      const d = snap.data() as any;
      if (typeof d?.mmr !== 'number') {
        onChange(null);
        return;
      }
      onChange({
        mmr: Number(d.mmr),
        rankTier: (d.rankTier ?? 'Bronze') as Tier,
        rankDivision: d.rankDivision ?? undefined,
        mp: typeof d.mp === 'number' ? d.mp : typeof d.lp === 'number' ? d.lp : 0, // Backward compat: read 'lp' if 'mp' missing
        streakWeeks: typeof d.streakWeeks === 'number' ? d.streakWeeks : 0,
        streakFreezes: typeof d.streakFreezes === 'number' ? d.streakFreezes : 0,
        tierShieldWeeksRemaining: typeof d.tierShieldWeeksRemaining === 'number' ? d.tierShieldWeeksRemaining : 0,
        consecutiveMissedWeeks: typeof d.consecutiveMissedWeeks === 'number' ? d.consecutiveMissedWeeks : 0,
        currentSeasonId: String(d.currentSeasonId ?? ''),
        lastWeekIdUpdated: d.lastWeekIdUpdated ? String(d.lastWeekIdUpdated) : null,
        rulesVersion: String(d.rulesVersion ?? ''),
      });
    },
    () => onChange(null),
  );
}

