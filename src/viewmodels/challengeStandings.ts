import type { GroupLog } from '../services/logs';
import type { PublicUser } from '../services/publicUsers';
import { isoWeekIdInTz, isoWeekRangeInTz, DEFAULT_TZ } from '../mmr/time';
import { friendlyNameFromDisplayName } from '../utils/formatters';

export type ChallengeStandingRow = {
  rank: number;
  uid: string;
  name: string;
  photoURL: string | null;
  /** Total challenge points = sum of weekly compliance % across elapsed weeks. */
  points: number;
  /** Weeks hit ≥ 70% compliance. */
  weeksCompleted: number;
  /** Weeks elapsed so far (denominator). */
  weeksElapsed: number;
  /** Average weekly compliance across elapsed weeks (0–100). */
  avgCompliance: number;
  /** Compliance banked so far in the CURRENT (in-progress) week, or null when
   * the challenge's elapsed weeks are all closed. Lets the UI scope the live
   * week honestly ("62% banked this week") instead of grading it early. */
  bankedPct: number | null;
  isMe: boolean;
};

function weekFractionForMember(params: {
  uid: string;
  weekDates: string[];
  logs: GroupLog[];
  workoutsTarget: number;
  calorieDaysTarget: number;
  weightDaysTarget: number;
}): number {
  const inWeek = new Set(params.weekDates);
  let workouts = 0;
  const calDays = new Set<string>();
  const weightDays = new Set<string>();
  for (const l of params.logs) {
    if (l.uid !== params.uid || !inWeek.has(l.date)) continue;
    if (l.type === 'workout') workouts += 1;
    else if (l.type === 'calories') calDays.add(l.date);
    else if (l.type === 'weight') weightDays.add(l.date);
  }

  const fracs: number[] = [];
  if (params.workoutsTarget > 0) fracs.push(Math.min(1, workouts / params.workoutsTarget));
  if (params.calorieDaysTarget > 0) fracs.push(Math.min(1, calDays.size / params.calorieDaysTarget));
  if (params.weightDaysTarget > 0) fracs.push(Math.min(1, weightDays.size / params.weightDaysTarget));
  if (!fracs.length) return 0;
  return fracs.reduce((a, b) => a + b, 0) / fracs.length;
}

/**
 * Challenge standings: rank visible members by total compliance across the
 * ELAPSED challenge weeks (each member scored against their OWN goals, so
 * different fitness levels stay comparable). Reads group logs + public goal
 * fields — everything a member is already allowed to read.
 */
export function buildChallengeStandings(params: {
  elapsedWeekIds: string[];
  memberUids: string[];
  publicUsers: Record<string, PublicUser>;
  canSee: Set<string>;
  myUid: string;
  logs: GroupLog[];
  tz?: string;
}): ChallengeStandingRow[] {
  const tz = params.tz ?? DEFAULT_TZ;
  const weeks = params.elapsedWeekIds.map((w) => isoWeekRangeInTz(w, tz).dates);
  const currentWeekId = isoWeekIdInTz(new Date(), tz);
  const currentIdx = params.elapsedWeekIds.indexOf(currentWeekId);
  const allowed = params.memberUids.filter((u) => u === params.myUid || params.canSee.has(u));

  const rows = allowed.map((uid) => {
    const p = params.publicUsers[uid];
    const workoutsTarget = Math.max(0, Number(p?.workoutsPerWeek ?? 0));
    const calorieDaysTarget = Math.max(0, Number((p as any)?.logCaloriesDaysPerWeek ?? 0));
    const weightDaysTarget = Math.max(0, Number((p as any)?.logWeightDaysPerWeek ?? 0));

    let points = 0;
    let weeksCompleted = 0;
    let bankedPct: number | null = null;
    weeks.forEach((weekDates, i) => {
      const frac = weekFractionForMember({ uid, weekDates, logs: params.logs, workoutsTarget, calorieDaysTarget, weightDaysTarget });
      points += frac * 100;
      if (frac >= 0.7) weeksCompleted += 1;
      if (i === currentIdx) bankedPct = Math.round(frac * 100);
    });
    const weeksElapsed = weeks.length;
    const avgCompliance = weeksElapsed ? Math.round(points / weeksElapsed) : 0;

    return {
      uid,
      name: friendlyNameFromDisplayName(p?.displayName ?? null, uid),
      photoURL: p?.photoURL ?? null,
      points: Math.round(points),
      weeksCompleted,
      weeksElapsed,
      avgCompliance,
      bankedPct,
      isMe: uid === params.myUid,
    };
  });

  rows.sort((a, b) => b.points - a.points || b.weeksCompleted - a.weeksCompleted || a.name.localeCompare(b.name));
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}
