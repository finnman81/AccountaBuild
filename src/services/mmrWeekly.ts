import { collection, documentId, limit, onSnapshot, orderBy, query } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { reportDebug } from './errorReporter';

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

  /**
   * Per-goal scoring snapshot for this week (written as `goalBreakdown` by
   * both scorers since 2026-07-19). Absent on weeks scored before that.
   */
  goals?: Array<{ id: string; A: number; D: number; score?: number; done?: number; target?: number }>;

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

    // `goalBreakdown` is the live field; `goals` is a legacy name that was
    // never actually written — kept as a fallback so nothing regresses.
    goals: (() => {
      const raw = Array.isArray(d?.goalBreakdown) ? d.goalBreakdown : Array.isArray(d?.goals) ? d.goals : null;
      if (!raw) return undefined;
      const mapped = raw
        .map((g: any) => ({
          id: String(g?.id ?? ''),
          A: Number(g?.A) || 0,
          D: Number(g?.D) || 0,
          score: typeof g?.score === 'number' ? Number(g.score) : undefined,
          done: typeof g?.done === 'number' ? Number(g.done) : undefined,
          target: typeof g?.target === 'number' ? Number(g.target) : undefined,
        }))
        .filter((g: any) => g.id);
      return mapped.length ? mapped : undefined;
    })(),

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
  let emits = 0;
  return onSnapshot(
    ref,
    (snap) => {
      // TEMP TRACE (2026-07-20): the weekly-report launcher saw an EMPTY
      // result on a device whose weekly docs exist server-side. Trace the
      // first few emissions (cache state included) to tell "empty from-cache
      // first snapshot" apart from a dying listener. Remove once diagnosed.
      if (emits < 3) {
        emits += 1;
        reportDebug('mmrWeeklyHistory snapshot', {
          emit: emits,
          size: snap.size,
          fromCache: snap.metadata.fromCache,
          hasPendingWrites: snap.metadata.hasPendingWrites,
        });
      }
      onChange(snap.docs.map((docSnap) => mapWeeklyDoc(docSnap.id, docSnap.data())));
    },
    (err) => {
      // TEMP TRACE: this error was silently swallowed into [] — the launcher
      // couldn't distinguish "no data" from "listener died".
      reportDebug('mmrWeeklyHistory ERROR', { code: (err as any)?.code ?? null, message: String((err as any)?.message ?? err).slice(0, 300) });
      onChange([]);
    },
  );
}
