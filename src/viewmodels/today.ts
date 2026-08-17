import type { GroupLog, LogType } from '../services/logs';
import type { PublicUser } from '../services/publicUsers';
import type { Tier } from '../mmr/types';
import { formatMinutesHM, formatWeightForUnits, friendlyNameFromDisplayName, type Units } from '../utils/formatters';
import { isHibernating } from '../services/hibernation';

export type ChecklistType = 'calories' | 'workout' | 'weight';
export type Division = 1 | 2 | 3 | 4;

export type TodayLogEntry = {
  logId: string;
  type: ChecklistType;
  date: string;
  loggedAtMs: number | null;
  valueLine: string;
  payload: any;
  /** FP this log earned when saved (stamped by the FP toast); absent = unknown. */
  fpDelta: number | null;
};
export type ChecklistItem = {
  type: ChecklistType;
  title: string;
  logged: boolean;
  loggedAtMs: number | null;
  valueLine: string;
  /** The raw log entries behind this row (for edit/delete). */
  entries: TodayLogEntry[];
};
export type TodayChecklist = { items: ChecklistItem[]; doneCount: number; total: number };

export type TeamMemberToday = {
  uid: string;
  name: string;
  photoURL: string | null;
  status: 'logged' | 'notLogged';
  streakLeader: boolean;
  atRisk: boolean;
  streakDays: number;
  valueLine: string;
};
export type TeamToday = { members: TeamMemberToday[]; loggedCount: number; total: number };

export type LeaderboardPreviewRow = {
  /** FP earned this week (weekly mode only; null in all-time mode). */
  weekDelta?: number | null;
  rank: number;
  isTied: boolean;
  uid: string;
  name: string;
  tier: Tier | null;
  division: Division | null;
  mmr: number | null;
  isMe: boolean;
};

const TIERS: Tier[] = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Challenger'];
function asTier(x: unknown): Tier | null {
  const s = String(x ?? '').trim();
  return (TIERS as string[]).includes(s) ? (s as Tier) : null;
}

const WORKOUT_LABELS: Record<string, string> = {
  weightLifting: 'Lift',
  running: 'Run',
  jogging: 'Jog',
  ruck: 'Ruck',
  swim: 'Swim',
  bike: 'Bike',
  stairMaster: 'Stairs',
  inclineWalk: 'Incline walk',
  rowing: 'Row',
  elliptical: 'Elliptical',
  hiit: 'HIIT',
  yoga: 'Yoga',
  stretching: 'Stretch',
  meditation: 'Meditation',
  pilates: 'Pilates',
  taiChi: 'Tai chi',
  tennis: 'Tennis',
  walking: 'Walk',
  other: 'Activity',
};
function prettyWorkout(type: unknown): string {
  const s = String(type ?? '').trim();
  return WORKOUT_LABELS[s] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Workout');
}

function logTsMs(l: GroupLog): number | null {
  const ts: any = l.ts;
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
  return null;
}

function fmtLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The current user's Calories/Workout/Weight checklist for today. */
export function buildTodayChecklist(params: {
  logs: GroupLog[];
  myUid: string;
  today: string;
  dailyCalorieGoal?: number | null;
  /** Viewer's display-units preference (weight is always stored in lb). */
  units?: Units;
}): TodayChecklist {
  const mine = params.logs.filter((l) => l.uid === params.myUid && l.date === params.today);

  const entryValueLine = (type: ChecklistType, l: GroupLog): string => {
    const p = l.payload as any;
    if (type === 'calories') {
      const meal = String(p?.meal ?? '').trim();
      const mealLabel = meal && meal !== 'all' ? ` · ${meal.charAt(0).toUpperCase()}${meal.slice(1)}` : '';
      return `${(Number(p?.calories) || 0).toLocaleString()} kcal${mealLabel}`;
    }
    if (type === 'workout') return `${prettyWorkout(p?.workoutType)} · ${formatMinutesHM(Number(p?.durationMinutes) || 0)}`;
    return formatWeightForUnits(Number(p?.weight), params.units);
  };

  const build = (type: ChecklistType, title: string): ChecklistItem => {
    const ofType = mine.filter((l) => l.type === type);
    const entries: TodayLogEntry[] = ofType
      .map((l) => ({ logId: l.id, type, date: l.date, loggedAtMs: logTsMs(l), valueLine: entryValueLine(type, l), payload: l.payload, fpDelta: typeof (l as any).fpDelta === 'number' ? (l as any).fpDelta : null }))
      .sort((a, b) => (b.loggedAtMs ?? 0) - (a.loggedAtMs ?? 0));
    if (ofType.length === 0) return { type, title, logged: false, loggedAtMs: null, valueLine: 'Not logged yet', entries: [] };

    const loggedAtMs = ofType.reduce<number | null>((max, l) => {
      const ms = logTsMs(l);
      return ms != null && (max == null || ms > max) ? ms : max;
    }, null);

    let valueLine = '';
    if (type === 'calories') {
      const total = ofType.reduce((s, l) => s + (Number((l.payload as any)?.calories) || 0), 0);
      valueLine = params.dailyCalorieGoal
        ? `${total.toLocaleString()} / ${params.dailyCalorieGoal.toLocaleString()} kcal`
        : `${total.toLocaleString()} kcal`;
    } else if (type === 'workout') {
      const mins = ofType.reduce((s, l) => s + (Number((l.payload as any)?.durationMinutes) || 0), 0);
      valueLine = `${prettyWorkout((ofType[0].payload as any)?.workoutType)} · ${formatMinutesHM(mins)}`;
    } else {
      const latest = ofType.reduce((a, b) => ((logTsMs(b) ?? 0) >= (logTsMs(a) ?? 0) ? b : a));
      valueLine = formatWeightForUnits(Number((latest.payload as any)?.weight), params.units);
    }
    return { type, title, logged: true, loggedAtMs, valueLine, entries };
  };

  const items = [build('calories', 'Calories'), build('workout', 'Workout'), build('weight', 'Weight')];
  return { items, doneCount: items.filter((i) => i.logged).length, total: items.length };
}

/** Continuous day-streak per uid, walking backward from `today`. */
export function computeStreakDays(logs: GroupLog[], allowedTypes: Set<LogType>, today: string): Record<string, number> {
  const datesByUid: Record<string, Set<string>> = {};
  for (const l of logs) {
    if (!l?.uid || !l?.date || !allowedTypes.has(l.type)) continue;
    (datesByUid[l.uid] ??= new Set<string>()).add(l.date);
  }
  const out: Record<string, number> = {};
  const todayDate = new Date(`${today}T00:00:00`);
  if (Number.isNaN(todayDate.valueOf())) return out;
  for (const [uid, set] of Object.entries(datesByUid)) {
    let streak = 0;
    const cur = new Date(todayDate);
    let guard = 366;
    while (guard-- > 0 && set.has(fmtLocal(cur))) {
      streak += 1;
      cur.setDate(cur.getDate() - 1);
    }
    out[uid] = streak;
  }
  return out;
}

/**
 * Pace-aware streak (days): a day COUNTS toward the streak only when the user
 * actually logged something relevant that day. A day with no log doesn't break
 * the streak as long as that day's weekly goal was still REACHABLE
 * (`satisfiedThroughDay + daysLeftInWeek >= target`) — it just doesn't add to
 * it. So skipping a mid-week day is fine (5 workouts/week, no workout Tuesday =
 * streak preserved), but zero activity never MANUFACTURES a streak: a user who
 * hasn't logged at all is 0, and a week that closes under target breaks the
 * chain (its Sunday fails the reachability test). Weeks are Mon–Sun. Falls back
 * to the plain consecutive-logged-day streak when no weekly targets are set.
 *
 * streakRule 'workout' → only workout logs/goal matter.
 * streakRule 'any'     → any tracked category's log counts a day, and the day
 *                        survives if ANY tracked goal is still on pace.
 */
/** A self-reported streak mirror older than this is ignored (owner hasn't opened the app). */
export const STREAK_MIRROR_FRESH_MS = 48 * 60 * 60 * 1000;

/**
 * max(window, fresh mirror): the windowed group feed can only UNDERCOUNT a
 * streak (missing old logs), never overcount, so preferring a larger fresh
 * mirror is always safe. Written by services/streakMirror.ts.
 */
export function bestStreak(windowStreak: number, mirror?: number | null, mirrorUpdatedAtMs?: number | null): number {
  if (
    typeof mirror === 'number' &&
    mirror > windowStreak &&
    typeof mirrorUpdatedAtMs === 'number' &&
    Date.now() - mirrorUpdatedAtMs < STREAK_MIRROR_FRESH_MS
  ) {
    return Math.round(mirror);
  }
  return windowStreak;
}

export function computeGoalStreak(params: {
  logs: GroupLog[];
  uid: string;
  today: string;
  streakRule: 'workout' | 'any';
  targets: { workout: number; calories: number; weight: number };
}): number {
  const { uid, today, streakRule, targets } = params;
  const w = new Set<string>();
  const c = new Set<string>();
  const g = new Set<string>();
  const anyLog = new Set<string>();
  const anyTypes: Set<string> = streakRule === 'any' ? new Set(['calories', 'workout', 'weight', 'photo']) : new Set(['workout']);
  for (const l of params.logs) {
    if (l?.uid !== uid || !l?.date) continue;
    if (l.type === 'workout') w.add(l.date);
    else if (l.type === 'calories') c.add(l.date);
    else if (l.type === 'weight') g.add(l.date);
    if (anyTypes.has(l.type)) anyLog.add(l.date);
  }

  const cats: Array<{ dates: Set<string>; target: number }> = [];
  if (targets.workout > 0) cats.push({ dates: w, target: Math.round(targets.workout) });
  if (streakRule === 'any') {
    if (targets.calories > 0) cats.push({ dates: c, target: Math.round(targets.calories) });
    if (targets.weight > 0) cats.push({ dates: g, target: Math.round(targets.weight) });
  }

  const todayDate = new Date(`${today}T00:00:00`);
  if (Number.isNaN(todayDate.valueOf())) return 0;

  // No usable weekly targets → legacy "logged every day" streak.
  if (cats.length === 0) {
    let streak = 0;
    const cur = new Date(todayDate);
    let guard = 366;
    while (guard-- > 0 && anyLog.has(fmtLocal(cur))) { streak += 1; cur.setDate(cur.getDate() - 1); }
    return streak;
  }

  const mondayOf = (dt: Date) => {
    const m = new Date(dt);
    const day = (dt.getDay() + 6) % 7; // Mon=0
    m.setDate(dt.getDate() - day);
    m.setHours(0, 0, 0, 0);
    return m;
  };

  // The set of dates that COUNT as active days (logged in a tracked category).
  const loggedDates = new Set<string>();
  for (const cat of cats) for (const d of cat.dates) loggedDates.add(d);

  let streak = 0;
  const cur = new Date(todayDate);
  let guard = 400;
  while (guard-- > 0) {
    const dstr = fmtLocal(cur);

    if (loggedDates.has(dstr)) {
      // Actually logged that day → counts.
      streak += 1;
      cur.setDate(cur.getDate() - 1);
      continue;
    }

    // No log that day: the streak survives (without counting) only if the
    // weekly goal was still reachable as of that day.
    const mon = mondayOf(cur);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const daysLeftAfter = Math.max(0, Math.round((sun.getTime() - cur.getTime()) / 86400000));
    const monStr = fmtLocal(mon);
    const onPace = (cat: { dates: Set<string>; target: number }) => {
      let done = 0;
      for (const d of cat.dates) if (d >= monStr && d <= dstr) done += 1;
      return done + daysLeftAfter >= cat.target;
    };
    const good = streakRule === 'any' ? cats.some(onPace) : cats.every(onPace);
    if (!good) break;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

/** Team Today rail: per-visible-member logged status, streak leader, and at-risk. */
export function buildTeamToday(params: {
  memberUids: string[];
  publicUsers: Record<string, PublicUser>;
  canSee: Set<string>;
  myUid: string;
  logs: GroupLog[];
  today: string;
  streakRule: 'workout' | 'any';
  /** True once past the local at-risk cutoff (6 PM). */
  pastCutoff: boolean;
  /** Current ISO week — hibernating members drop out of the rail entirely. */
  currentWeekId?: string;
}): TeamToday {
  // A member who's away for weeks isn't "not logged today", they're absent.
  // Counting them would drag "6/8 logged" down every day of their trip and
  // quietly make the whole group look worse for someone else's deployment.
  const allowed = params.memberUids
    .filter((u) => u === params.myUid || params.canSee.has(u))
    .filter((u) => !(params.currentWeekId && isHibernating(params.publicUsers[u] as any, params.currentWeekId)));
  const allowedTypes: Set<LogType> =
    params.streakRule === 'any' ? new Set<LogType>(['calories', 'workout', 'weight', 'photo']) : new Set<LogType>(['workout']);

  const loggedTodayByUid = new Set<string>();
  for (const l of params.logs) {
    if (l.date === params.today && allowedTypes.has(l.type)) loggedTodayByUid.add(l.uid);
  }

  // Pace-aware streak per member, scored against each member's own weekly goals.
  // The windowed feed TRUNCATES streaks longer than its lookback (~2 weeks at
  // current group volume), so blend in each member's self-reported mirror —
  // max() is safe because the window can only ever undercount (streakMirror.ts).
  const streaks: Record<string, number> = {};
  for (const uid of allowed) {
    const p = params.publicUsers[uid];
    const windowStreak = computeGoalStreak({
      logs: params.logs,
      uid,
      today: params.today,
      streakRule: params.streakRule,
      targets: {
        workout: Number(p?.workoutsPerWeek ?? 0),
        calories: Number(p?.logCaloriesDaysPerWeek ?? 0),
        weight: Number(p?.logWeightDaysPerWeek ?? 0),
      },
    });
    streaks[uid] = bestStreak(windowStreak, p?.streakDaysPublic, p?.streakDaysUpdatedAtMs);
  }
  let leaderUid: string | null = null;
  let leaderStreak = 0;
  for (const uid of allowed) {
    const s = streaks[uid] ?? 0;
    if (s > leaderStreak) {
      leaderStreak = s;
      leaderUid = uid;
    }
  }

  const members: TeamMemberToday[] = allowed.map((uid) => {
    const p = params.publicUsers[uid];
    const logged = loggedTodayByUid.has(uid);
    const streakDays = streaks[uid] ?? 0;
    const streakLeader = uid === leaderUid && leaderStreak > 0;
    const atRisk = !logged && params.pastCutoff;
    const valueLine = streakDays > 0 ? `${streakDays}d streak` : atRisk ? 'at risk' : '';
    return {
      uid,
      name: friendlyNameFromDisplayName(p?.displayName ?? null, uid),
      photoURL: p?.photoURL ?? null,
      status: logged ? 'logged' : 'notLogged',
      streakLeader,
      atRisk,
      streakDays,
      valueLine,
    };
  });

  members.sort((a, b) => {
    if (a.uid === params.myUid) return -1;
    if (b.uid === params.myUid) return 1;
    if (a.status !== b.status) return a.status === 'logged' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { members, loggedCount: members.filter((m) => m.status === 'logged').length, total: members.length };
}

/** Top-N leaderboard preview by global MMR, visible members only. */
export function buildLeaderboardPreview(params: {
  memberUids: string[];
  publicUsers: Record<string, PublicUser>;
  canSee: Set<string>;
  myUid: string;
  limit?: number;
  /**
   * Current-week FP earned per uid (weeklyPublic deltas). When provided the
   * preview ranks by THIS WEEK's race — a flow everyone re-enters at 0 each
   * Monday — instead of the all-time ladder, which buries late joiners under
   * tenure. Members without a scored doc yet count as 0, not hidden.
   */
  weekDeltas?: Record<string, number>;
}): LeaderboardPreviewRow[] {
  const weekly = params.weekDeltas != null;
  const allowed = params.memberUids.filter((u) => u === params.myUid || params.canSee.has(u));
  const rows = allowed
    .filter((uid) => params.publicUsers[uid])
    .map((uid) => {
      const p = params.publicUsers[uid];
      return {
        uid,
        name: friendlyNameFromDisplayName(p?.displayName ?? null, uid),
        tier: asTier(p?.rankTierPublic),
        division: (typeof p?.rankDivisionPublic === 'number' ? p.rankDivisionPublic : null) as Division | null,
        mmr: typeof p?.mmrPublic === 'number' ? p.mmrPublic : null,
        weekDelta: weekly ? Math.round(params.weekDeltas![uid] ?? 0) : null,
        isMe: uid === params.myUid,
      };
    });
  // Standard competition ranking (1224): equal score shares a rank, computed
  // against the full field so a tie at the visible edge (e.g. #3) is still
  // correct even though its tied partner may fall just outside the slice.
  const keyOf = (r: { mmr: number | null; weekDelta: number | null }) => (weekly ? (r.weekDelta ?? 0) : (r.mmr ?? -1));
  rows.sort((a, b) => keyOf(b) - keyOf(a) || a.name.localeCompare(b.name));
  const ranks: number[] = rows.map((r, i) => (i > 0 && keyOf(r) === keyOf(rows[i - 1]) ? -1 : i + 1));
  for (let i = 0; i < ranks.length; i += 1) if (ranks[i] === -1) ranks[i] = ranks[i - 1]!;
  return rows.slice(0, params.limit ?? 3).map((r, i) => ({
    rank: ranks[i]!,
    isTied: (i > 0 && ranks[i] === ranks[i - 1]) || (i < ranks.length - 1 && ranks[i] === ranks[i + 1]),
    ...r,
  }));
}
