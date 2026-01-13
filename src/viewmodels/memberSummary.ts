import { friendlyNameFromDisplayName } from '../utils/formatters';
import type { GroupLog, WorkoutType } from '../services/logs';
import type { UserGoals } from '../services/goals';

export type MemberLike = {
  uid: string;
  displayName?: string | null;
  photoURL?: string | null;
};

export type MemberSummary = {
  uid: string;
  name: string;
  photoURL: string | null;
  caloriesLoggedToday: number;
  caloriesRemaining: number | null;
  workoutMinutesToday: number;
  workoutMinutesThisWeek: number;
  workoutTypesToday: string[];
  lastWeight: number | null;
  weightDelta: number | null; // vs previous weigh-in
  lastUpdatedAtMs: number | null;
  loggedToday: boolean; // per spec: calories OR workout
};

function toMillis(ts: any | null): number | null {
  if (!ts) return null;
  try {
    if (typeof ts?.toMillis === 'function') return ts.toMillis();
  } catch {}
  if (ts instanceof Date) return ts.getTime();
  return null;
}

export function buildMemberSummaries(params: {
  members: MemberLike[];
  goals: UserGoals[];
  logs: GroupLog[];
  todayYYYYMMDD: string;
  weekStart: Date;
  workoutLabel: (t: WorkoutType | unknown) => string;
}): MemberSummary[] {
  const goalsByUid: Record<string, UserGoals> = {};
  for (const g of params.goals) goalsByUid[g.uid] = g;

  const caloriesToday: Record<string, number> = {};
  const workoutMinsToday: Record<string, number> = {};
  const workoutMinsWeek: Record<string, number> = {};
  const workoutTypesToday: Record<string, Set<string>> = {};
  const lastUpdatedAtMs: Record<string, number> = {};

  // logs are newest-first in this screen; still safe to compute aggregates regardless
  for (const l of params.logs) {
    const isToday = l.date === params.todayYYYYMMDD;
    const ms = toMillis(l.ts ?? null);
    if (ms != null && isToday) lastUpdatedAtMs[l.uid] = Math.max(lastUpdatedAtMs[l.uid] ?? 0, ms);

    if (isToday && l.type === 'calories') {
      const c = Number((l.payload as any)?.calories);
      if (Number.isFinite(c) && c > 0) caloriesToday[l.uid] = (caloriesToday[l.uid] ?? 0) + c;
    }
    if (l.type === 'workout') {
      const mins = Number((l.payload as any)?.durationMinutes);
      if (Number.isFinite(mins) && mins > 0) {
        // Today
        if (isToday) workoutMinsToday[l.uid] = (workoutMinsToday[l.uid] ?? 0) + mins;
        // This week (Sunday 00:00 local → now)
        const d = new Date(`${l.date}T00:00:00`);
        if (!Number.isNaN(d.valueOf()) && d >= params.weekStart) {
          workoutMinsWeek[l.uid] = (workoutMinsWeek[l.uid] ?? 0) + mins;
        }
      }
      if (isToday) {
        const wt = (l.payload as any)?.workoutType;
        const label = params.workoutLabel(wt);
        workoutTypesToday[l.uid] = workoutTypesToday[l.uid] ?? new Set<string>();
        workoutTypesToday[l.uid].add(label);
      }
    }
  }

  // Last weight + previous weight: use newest-first logs; first two weights seen per uid.
  const lastWeightByUid: Record<string, number> = {};
  const prevWeightByUid: Record<string, number> = {};
  for (const l of params.logs) {
    if (l.type !== 'weight') continue;
    const w = Number((l.payload as any)?.weight);
    if (!Number.isFinite(w)) continue;
    if (lastWeightByUid[l.uid] == null) {
      lastWeightByUid[l.uid] = w;
      continue;
    }
    if (prevWeightByUid[l.uid] == null) {
      prevWeightByUid[l.uid] = w;
      continue;
    }
  }

  const out: MemberSummary[] = params.members.map((m) => {
    const name = friendlyNameFromDisplayName(m.displayName ?? null, m.uid);
    const goal = Number(goalsByUid[m.uid]?.dailyCalorieGoal ?? 0);
    const logged = Math.round(caloriesToday[m.uid] ?? 0);
    const remaining = Number.isFinite(goal) && goal > 0 ? Math.max(0, Math.round(goal - logged)) : null;
    const mins = Math.round(workoutMinsToday[m.uid] ?? 0);
    const minsWeek = Math.round(workoutMinsWeek[m.uid] ?? 0);
    const types = workoutTypesToday[m.uid] ? Array.from(workoutTypesToday[m.uid].values()).sort() : [];
    const loggedToday = logged > 0 || mins > 0;
    const lastW = lastWeightByUid[m.uid] ?? null;
    const prevW = prevWeightByUid[m.uid] ?? null;
    const weightDelta = lastW != null && prevW != null ? Math.round((lastW - prevW) * 10) / 10 : null;

    return {
      uid: m.uid,
      name,
      photoURL: (m.photoURL ?? '').trim() || null,
      caloriesLoggedToday: logged,
      caloriesRemaining: remaining,
      workoutMinutesToday: mins,
      workoutMinutesThisWeek: minsWeek,
      workoutTypesToday: types,
      lastWeight: lastW,
      weightDelta,
      lastUpdatedAtMs: lastUpdatedAtMs[m.uid] ?? null,
      loggedToday,
    };
  });

  return out;
}

export function sortMemberSummaries(list: MemberSummary[]) {
  const copy = [...list];
  copy.sort((a, b) => {
    if (a.loggedToday !== b.loggedToday) return a.loggedToday ? -1 : 1; // logged today first

    const ar = a.caloriesRemaining;
    const br = b.caloriesRemaining;
    if (ar != null && br != null && ar !== br) return ar - br;
    if (ar == null && br != null) return 1; // missing goal goes later
    if (ar != null && br == null) return -1;

    return a.name.localeCompare(b.name);
  });
  return copy;
}

