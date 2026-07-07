import type { GroupLog, LogType } from '../services/logs';
import type { PublicUser } from '../services/publicUsers';
import type { Tier } from '../mmr/types';
import { formatMinutesHM, formatWeightLb, friendlyNameFromDisplayName } from '../utils/formatters';

export type ChecklistType = 'calories' | 'workout' | 'weight';
export type Division = 1 | 2 | 3 | 4;

export type TodayLogEntry = {
  logId: string;
  type: ChecklistType;
  date: string;
  loggedAtMs: number | null;
  valueLine: string;
  payload: any;
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
  rank: number;
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
  walking: 'Walk',
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
    return formatWeightLb(Number(p?.weight));
  };

  const build = (type: ChecklistType, title: string): ChecklistItem => {
    const ofType = mine.filter((l) => l.type === type);
    const entries: TodayLogEntry[] = ofType
      .map((l) => ({ logId: l.id, type, date: l.date, loggedAtMs: logTsMs(l), valueLine: entryValueLine(type, l), payload: l.payload }))
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
      valueLine = formatWeightLb(Number((latest.payload as any)?.weight));
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
}): TeamToday {
  const allowed = params.memberUids.filter((u) => u === params.myUid || params.canSee.has(u));
  const allowedTypes: Set<LogType> =
    params.streakRule === 'any' ? new Set<LogType>(['calories', 'workout', 'weight', 'photo']) : new Set<LogType>(['workout']);

  const loggedTodayByUid = new Set<string>();
  for (const l of params.logs) {
    if (l.date === params.today && allowedTypes.has(l.type)) loggedTodayByUid.add(l.uid);
  }

  const streaks = computeStreakDays(params.logs, allowedTypes, params.today);
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
}): LeaderboardPreviewRow[] {
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
        isMe: uid === params.myUid,
      };
    });
  rows.sort((a, b) => (b.mmr ?? -1) - (a.mmr ?? -1) || a.name.localeCompare(b.name));
  return rows.slice(0, params.limit ?? 3).map((r, i) => ({ rank: i + 1, ...r }));
}
