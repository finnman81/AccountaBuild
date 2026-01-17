import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import type { Tier } from '../mmr/types';

export type EarnedBadge =
  | {
      id: string;
      type: 'seasonRank' | 'seasonPeak';
      seasonId: string;
      tier: Tier;
      division?: 1 | 2 | 3 | 4;
      earnedAtMs: number | null;
    }
  | {
      id: string;
      type: 'achievement';
      seasonId: string;
      achievementId: string;
      title: string;
      earnedAtMs: number | null;
    };

function toMillisMaybe(ts: any): number | null {
  try {
    return typeof ts?.toMillis === 'function' ? ts.toMillis() : null;
  } catch {
    return null;
  }
}

export function subscribeMyBadges(uid: string, onChange: (items: EarnedBadge[]) => void) {
  const ref = query(collection(db, 'users', uid, 'badges'), orderBy('earnedAt', 'desc'), limit(30));
  return onSnapshot(
    ref,
    (snap) => {
      const items: EarnedBadge[] = snap.docs
        .map((d) => {
          const data = d.data() as any;
          const type = String(data?.type ?? '').trim();
          const seasonId = String(data?.seasonId ?? '').trim();
          const earnedAtMs = toMillisMaybe(data?.earnedAt);

          if (type === 'seasonRank' || type === 'seasonPeak') {
            const tier = String(data?.tier ?? '').trim() as Tier;
            if (!seasonId || !tier) return null;
            const division = data?.division ?? undefined;
            return {
              id: d.id,
              type,
              seasonId,
              tier,
              division: division === 1 || division === 2 || division === 3 || division === 4 ? division : undefined,
              earnedAtMs,
            } as EarnedBadge;
          }

          if (type === 'achievement') {
            const achievementId = String(data?.achievementId ?? '').trim();
            const title = String(data?.title ?? '').trim();
            if (!seasonId || !achievementId || !title) return null;
            return { id: d.id, type: 'achievement', seasonId, achievementId, title, earnedAtMs } as EarnedBadge;
          }

          return null;
        })
        .filter(Boolean) as EarnedBadge[];
      onChange(items);
    },
    () => {
      // If rules aren't deployed yet, avoid uncaught snapshot errors.
      onChange([]);
    },
  );
}

