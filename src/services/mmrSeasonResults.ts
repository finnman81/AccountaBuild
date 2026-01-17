import { collection, documentId, limit, onSnapshot, orderBy, query } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import type { Tier } from '../mmr/types';

export type SeasonResult = {
  id: string; // seasonId
  seasonId: string;
  endedAtMs: number | null;
  final: { tier: Tier; division?: 1 | 2 | 3 | 4 | null; mmr: number; mp: number } | null;
};

function toMillisMaybe(ts: any): number | null {
  try {
    return typeof ts?.toMillis === 'function' ? ts.toMillis() : null;
  } catch {
    return null;
  }
}

export function subscribeMySeasonResults(uid: string, onChange: (items: SeasonResult[]) => void) {
  const ref = query(collection(db, 'users', uid, 'seasonResults'), orderBy(documentId(), 'desc'), limit(20));
  return onSnapshot(
    ref,
    (snap) => {
      const items: SeasonResult[] = snap.docs
        .map((d) => {
          const data = d.data() as any;
          const seasonId = String(data?.seasonId ?? d.id).trim();
          const endedAtMs = toMillisMaybe(data?.endedAt);
          const f = data?.final ?? null;
          if (!seasonId) return null;
          const tier = String(f?.tier ?? '').trim() as Tier;
          const division = f?.division ?? null;
          const mmr = typeof f?.mmr === 'number' ? Number(f.mmr) : null;
          const mp = typeof f?.mp === 'number' ? Number(f.mp) : typeof f?.lp === 'number' ? Number(f.lp) : null; // Backward compat

          return {
            id: d.id,
            seasonId,
            endedAtMs,
            final:
              tier && mmr != null && mp != null
                ? {
                    tier,
                    division: division === 1 || division === 2 || division === 3 || division === 4 ? division : null,
                    mmr,
                    mp,
                  }
                : null,
          };
        })
        .filter(Boolean) as SeasonResult[];
      onChange(items);
    },
    () => {
      onChange([]);
    },
  );
}

