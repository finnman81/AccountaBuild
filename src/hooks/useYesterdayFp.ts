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
 *
 * BOTH SNAPSHOTS MUST BE IN THE SAME WEEK, or the number is nonsense. FP is a
 * cumulative total carrying a LIVE weekly delta, so a Sunday→Monday diff spans
 * the week close: it subtracts last week's final settlement from this week's
 * barely-started provisional. Prod 2026-08-11 read "Yesterday: -2 FP" for a day
 * with a workout, 930 kcal and a weigh-in logged — the same rollover handed a
 * teammate a bogus +118. Callers show the week-to-date figure instead on the
 * days this returns null.
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
        const yData = ySnap.exists() ? (ySnap.data() as any) : null;
        const bData = bSnap.exists() ? (bSnap.data() as any) : null;
        const y = yData ? Number(yData.mmr) : NaN;
        const b = bData ? Number(bData.mmr) : NaN;
        const sameWeek = !!yData?.weekId && yData.weekId === bData?.weekId;
        if (!cancelled) {
          setDelta(sameWeek && Number.isFinite(y) && Number.isFinite(b) ? Math.round(y - b) : null);
        }
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
