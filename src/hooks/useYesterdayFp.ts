import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';

function dayOffsetYYYYMMDD(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * FP earned yesterday: day-over-day delta from the server-written
 * users/{uid}/fpDaily ledger (updateMmrScheduled snapshots FP every 6h; the
 * last write of a day ≈ that day's closing value). Returns null until the
 * ledger has both snapshots (first ~2 days after a user appears, or if the
 * scheduled compute hasn't run yet).
 */
export function useYesterdayFp(uid?: string | null): number | null {
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    if (!uid) {
      setDelta(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [ySnap, bSnap] = await Promise.all([
          getDoc(doc(db, 'users', uid, 'fpDaily', dayOffsetYYYYMMDD(-1))),
          getDoc(doc(db, 'users', uid, 'fpDaily', dayOffsetYYYYMMDD(-2))),
        ]);
        const y = ySnap.exists() ? Number((ySnap.data() as any)?.mmr) : NaN;
        const b = bSnap.exists() ? Number((bSnap.data() as any)?.mmr) : NaN;
        if (!cancelled) setDelta(Number.isFinite(y) && Number.isFinite(b) ? Math.round(y - b) : null);
      } catch {
        if (!cancelled) setDelta(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return delta;
}
