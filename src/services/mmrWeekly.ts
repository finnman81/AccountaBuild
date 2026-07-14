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

  // Raw week totals (for recap/review surfaces)
  workoutsDone: number;
  minutesDone: number;
  calorieDaysHit: number;
  weighInsDone: number;
  streakAfter: number;

  /** Per-goal scoring snapshot (id + adherence + difficulty) for this week. */
  goals?: Array<{ id: string; A: number; D: number }>;

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

function mapWeeklyDoc(id: string, d: any): MmrWeeklySummary {
  return {
    weekId: String(d?.weekId ?? id),
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

    workoutsDone: typeof d?.workoutsDone === 'number' ? Number(d.workoutsDone) : 0,
    minutesDone: typeof d?.minutesDone === 'number' ? Number(d.minutesDone) : 0,
    calorieDaysHit: typeof d?.calorieDaysHit === 'number' ? Number(d.calorieDaysHit) : 0,
    weighInsDone: typeof d?.weighInsDone === 'number' ? Number(d.weighInsDone) : 0,
    streakAfter: typeof d?.streakAfter === 'number' ? Number(d.streakAfter) : 0,

    goals: Array.isArray(d?.goals)
      ? d.goals
          .map((g: any) => ({ id: String(g?.id ?? ''), A: Number(g?.A) || 0, D: Number(g?.D) || 0 }))
          .filter((g: any) => g.id)
      : undefined,

    rankBefore: (d?.rankBefore ?? null) as any,
    rankAfter: (d?.rankAfter ?? null) as any,
    promotion: (d?.promotion ?? null) as any,
    demotion: (d?.demotion ?? null) as any,
  };
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
      onChange(mapWeeklyDoc(snap.docs[0]!.id, snap.docs[0]!.data()));
    },
    () => onChange(null),
  );
}

export function subscribeMmrWeeklyHistory(uid: string, maxWeeks: number, onChange: (items: MmrWeeklySummary[]) => void) {
  const ref = query(collection(db, 'users', uid, 'weekly'), orderBy(documentId(), 'desc'), limit(Math.max(1, Math.min(104, maxWeeks))));
  return onSnapshot(
    ref,
    (snap) => {
      onChange(snap.docs.map((docSnap) => mapWeeklyDoc(docSnap.id, docSnap.data())));
    },
    () => onChange([]),
  );
}
