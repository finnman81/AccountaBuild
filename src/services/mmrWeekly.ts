import { collection, documentId, limit, onSnapshot, orderBy, query } from 'firebase/firestore';

import { db } from '../firebase/firebase';

export type MmrWeeklySummary = {
  weekId: string;
  seasonId?: string;
  updatedAtMs?: number | null;

  // Summary
  completedWeek: boolean;
  missedWeek: boolean;
  deltaMMR: number;
  deltaMP?: number | null;
  penalty: number;
  bonus: number;
  weekScore: number;
  streakMultiplier: number;
  mmrBefore: number;
  mmrAfter: number;

  rankBefore?: { tier: string; division?: 1 | 2 | 3 | 4 | null; mp?: number | null } | null;
  rankAfter?: { tier: string; division?: 1 | 2 | 3 | 4 | null; mp?: number | null } | null;
  promotion?: { from: any; to: any } | null;
  demotion?: { from: any; to: any } | null;
};

function toMillisMaybe(ts: any): number | null {
  try {
    return typeof ts?.toMillis === 'function' ? ts.toMillis() : null;
  } catch {
    return null;
  }
}

export function subscribeLatestMmrWeeklySummary(uid: string, onChange: (s: MmrWeeklySummary | null) => void) {
  const ref = query(collection(db, 'users', uid, 'weekly'), orderBy(documentId(), 'desc'), limit(1));
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.empty) {
        onChange(null);
        return;
      }
      const d = snap.docs[0]!.data() as any;
      onChange({
        weekId: String(d?.weekId ?? snap.docs[0]!.id),
        seasonId: d?.seasonId ? String(d.seasonId) : undefined,
        updatedAtMs: toMillisMaybe(d?.updatedAt),

        completedWeek: Boolean(d?.completedWeek),
        missedWeek: Boolean(d?.missedWeek),
        deltaMMR: typeof d?.deltaMMR === 'number' ? Number(d.deltaMMR) : 0,
        deltaMP: typeof d?.deltaMP === 'number' ? Number(d.deltaMP) : typeof d?.deltaLP === 'number' ? Number(d.deltaLP) : null, // Backward compat
        penalty: typeof d?.penalty === 'number' ? Number(d.penalty) : 0,
        bonus: typeof d?.bonus === 'number' ? Number(d.bonus) : 0,
        weekScore: typeof d?.weekScore === 'number' ? Number(d.weekScore) : 0,
        streakMultiplier: typeof d?.streakMultiplier === 'number' ? Number(d.streakMultiplier) : 1,
        mmrBefore: typeof d?.mmrBefore === 'number' ? Number(d.mmrBefore) : 0,
        mmrAfter: typeof d?.mmrAfter === 'number' ? Number(d.mmrAfter) : 0,

        rankBefore: (d?.rankBefore ?? null) as any,
        rankAfter: (d?.rankAfter ?? null) as any,
        promotion: (d?.promotion ?? null) as any,
        demotion: (d?.demotion ?? null) as any,
      });
    },
    () => onChange(null),
  );
}

export function subscribeMmrWeeklyHistory(uid: string, maxWeeks: number, onChange: (items: MmrWeeklySummary[]) => void) {
  const ref = query(collection(db, 'users', uid, 'weekly'), orderBy(documentId(), 'desc'), limit(Math.max(1, Math.min(104, maxWeeks))));
  return onSnapshot(
    ref,
    (snap) => {
      const items: MmrWeeklySummary[] = snap.docs.map((docSnap) => {
        const d = docSnap.data() as any;
        return {
          weekId: String(d?.weekId ?? docSnap.id),
          seasonId: d?.seasonId ? String(d.seasonId) : undefined,
          updatedAtMs: toMillisMaybe(d?.updatedAt),

          completedWeek: Boolean(d?.completedWeek),
          missedWeek: Boolean(d?.missedWeek),
          deltaMMR: typeof d?.deltaMMR === 'number' ? Number(d.deltaMMR) : 0,
          deltaMP: typeof d?.deltaMP === 'number' ? Number(d.deltaMP) : typeof d?.deltaLP === 'number' ? Number(d.deltaLP) : null, // Backward compat
          penalty: typeof d?.penalty === 'number' ? Number(d.penalty) : 0,
          bonus: typeof d?.bonus === 'number' ? Number(d.bonus) : 0,
          weekScore: typeof d?.weekScore === 'number' ? Number(d.weekScore) : 0,
          streakMultiplier: typeof d?.streakMultiplier === 'number' ? Number(d.streakMultiplier) : 1,
          mmrBefore: typeof d?.mmrBefore === 'number' ? Number(d.mmrBefore) : 0,
          mmrAfter: typeof d?.mmrAfter === 'number' ? Number(d.mmrAfter) : 0,

          rankBefore: (d?.rankBefore ?? null) as any,
          rankAfter: (d?.rankAfter ?? null) as any,
          promotion: (d?.promotion ?? null) as any,
          demotion: (d?.demotion ?? null) as any,
        };
      });
      onChange(items);
    },
    () => onChange([]),
  );
}

