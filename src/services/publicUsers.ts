import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import { db } from '../firebase/firebase';

export type PublicUser = {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  height: number | null;
  age: number | null;
  weightCurrent: number | null;
  weightGoal: number | null;
  // User-level goals (persist across groups)
  dailyCalorieGoal?: number | null;
  workoutsPerWeek?: number | null;
  logCaloriesDaysPerWeek?: number | null;
  logWeightDaysPerWeek?: number | null;
  // Global MMR (public mirror)
  mmrPublic?: number | null;
  rankTierPublic?: string | null;
  rankDivisionPublic?: number | null;
  mpPublic?: number | null;
  prevMmrPublic?: number | null;
  /** Whether teammates are allowed to nudge this user (mirrors the setting). */
  allowNudges?: boolean;
  /** Self-computed accurate goal streak (see services/streakMirror.ts). */
  streakDaysPublic?: number | null;
  /** Plain ms number, NOT a Timestamp — must survive the hydration cache's JSON. */
  streakDaysUpdatedAtMs?: number | null;
  /** ISO week the user has declared as a vacation week (null when none). */
  vacationWeekId?: string | null;
  /** Booked vacation RANGE (advance booking, 2026-08-21). */
  vacationFromWeekId?: string | null;
  vacationUntilWeekId?: string | null;
  /** Hibernation range mirror (server-written) — drives the pod + 😴 badge. */
  hibernatingFromWeekId?: string | null;
  hibernatingUntilWeekId?: string | null;
  /** Compact earned-badge mirror (newest first) for teammate profiles. */
  badgesPublic?: Array<{ id: string; type: string; label: string; seasonId?: string }>;
};

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Shareable weekly FP summary (publicUsers/{uid}/weeklyPublic/{weekId}). */
export type WeeklyPublic = {
  weekId: string;
  seasonId?: string;
  mmrAfter: number;
  deltaMMR: number;
  tier?: string | null;
  division?: number | null;
  completedWeek?: boolean;
  workoutsDone?: number;
};

/** A teammate's FP history, ascending by week (doc ids are YYYY-WNN). */
export function subscribeWeeklyPublic(
  uid: string,
  max: number,
  onChange: (weeks: WeeklyPublic[]) => void,
  onError?: (err: unknown) => void,
) {
  // Same failed-precondition trap as mmrWeekly (see note there): desc
  // document-id ordering has no automatic index. weekId field sorts the same.
  const ref = query(collection(db, 'publicUsers', uid, 'weeklyPublic'), orderBy('weekId', 'desc'), limit(max));
  return onSnapshot(
    ref,
    (snap) => {
      const rows = snap.docs
        .map((d) => {
          const data = d.data() as any;
          const mmrAfter = Number(data?.mmrAfter);
          if (!Number.isFinite(mmrAfter)) return null;
          return {
            weekId: d.id,
            seasonId: data?.seasonId ?? undefined,
            mmrAfter,
            deltaMMR: Number(data?.deltaMMR) || 0,
            tier: data?.tier ?? null,
            division: data?.division ?? null,
            completedWeek: Boolean(data?.completedWeek),
            workoutsDone: Number(data?.workoutsDone) || 0,
          } as WeeklyPublic;
        })
        .filter(Boolean) as WeeklyPublic[];
      onChange(rows.reverse());
    },
    (err) => onError?.(err),
  );
}

export async function upsertMyPublicUser(uid: string, data: Partial<PublicUser>) {
  // Important: treat `undefined` as "no change". Only explicit `null` clears a field.
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (data.displayName !== undefined) patch.displayName = data.displayName;
  if (data.photoURL !== undefined) patch.photoURL = data.photoURL;
  if (data.height !== undefined) patch.height = data.height;
  if (data.age !== undefined) patch.age = data.age;
  if (data.weightCurrent !== undefined) patch.weightCurrent = data.weightCurrent;
  if (data.weightGoal !== undefined) patch.weightGoal = data.weightGoal;
  if (data.dailyCalorieGoal !== undefined) patch.dailyCalorieGoal = data.dailyCalorieGoal;
  if (data.workoutsPerWeek !== undefined) patch.workoutsPerWeek = data.workoutsPerWeek;
  if (data.logCaloriesDaysPerWeek !== undefined) patch.logCaloriesDaysPerWeek = data.logCaloriesDaysPerWeek;
  if (data.logWeightDaysPerWeek !== undefined) patch.logWeightDaysPerWeek = data.logWeightDaysPerWeek;
  if (data.allowNudges !== undefined) patch.allowNudges = data.allowNudges;

  await setDoc(doc(db, 'publicUsers', uid), patch, { merge: true });
}

export function subscribePublicUsers(uids: string[], onChange: (map: Record<string, PublicUser>) => void) {
  const uniq = Array.from(new Set(uids.map((u) => u.trim()).filter(Boolean)));
  if (uniq.length === 0) {
    onChange({});
    return () => {};
  }

  let latest: Record<string, PublicUser> = {};
  const unsubs: Array<() => void> = [];

  const emit = () => onChange({ ...latest });

  for (const batch of chunk(uniq, 10)) {
    const ref = query(collection(db, 'publicUsers'), where(documentId(), 'in', batch));
    const unsub = onSnapshot(
      ref,
      (snap) => {
      // Update only docs within this batch.
      for (const id of batch) {
        if (!snap.docs.some((d) => d.id === id)) {
          // Keep old if not returned (permission/doesn't exist) – but don't fabricate.
          continue;
        }
      }
      for (const d of snap.docs) {
        const data = d.data() as any;
        latest[d.id] = {
          uid: d.id,
          displayName: data?.displayName ?? null,
          photoURL: data?.photoURL ?? null,
          height: data?.height ?? null,
          age: data?.age ?? null,
          weightCurrent: data?.weightCurrent ?? null,
          weightGoal: data?.weightGoal ?? null,
          dailyCalorieGoal: typeof data?.dailyCalorieGoal === 'number' ? data.dailyCalorieGoal : null,
          workoutsPerWeek: typeof data?.workoutsPerWeek === 'number' ? data.workoutsPerWeek : null,
          logCaloriesDaysPerWeek: typeof data?.logCaloriesDaysPerWeek === 'number' ? data.logCaloriesDaysPerWeek : null,
          logWeightDaysPerWeek: typeof data?.logWeightDaysPerWeek === 'number' ? data.logWeightDaysPerWeek : null,
          mmrPublic: typeof data?.mmrPublic === 'number' ? data.mmrPublic : null,
          rankTierPublic: data?.rankTierPublic ?? null,
          rankDivisionPublic: typeof data?.rankDivisionPublic === 'number' ? data.rankDivisionPublic : null,
          mpPublic: typeof data?.mpPublic === 'number' ? data.mpPublic : typeof data?.lpPublic === 'number' ? data.lpPublic : null, // Backward compat
          prevMmrPublic: typeof data?.prevMmrPublic === 'number' ? data.prevMmrPublic : null,
          allowNudges: data?.allowNudges === true,
          streakDaysPublic: typeof data?.streakDaysPublic === 'number' ? data.streakDaysPublic : null,
          streakDaysUpdatedAtMs: typeof data?.streakDaysUpdatedAtMs === 'number' ? data.streakDaysUpdatedAtMs : null,
          // NOTE: this mapper is a whitelist — a field absent here never
          // reaches the UI no matter what the doc says. vacationWeekId was
          // declared on the type and read by the leaderboard but never copied,
          // so the 🏖️ badge had been dead since it shipped; hibernation hit the
          // identical trap on day one (2026-08-17).
          vacationWeekId: typeof data?.vacationWeekId === 'string' ? data.vacationWeekId : null,
          vacationFromWeekId: typeof data?.vacationFromWeekId === 'string' ? data.vacationFromWeekId : null,
          vacationUntilWeekId: typeof data?.vacationUntilWeekId === 'string' ? data.vacationUntilWeekId : null,
          hibernatingFromWeekId: typeof data?.hibernatingFromWeekId === 'string' ? data.hibernatingFromWeekId : null,
          hibernatingUntilWeekId: typeof data?.hibernatingUntilWeekId === 'string' ? data.hibernatingUntilWeekId : null,
          badgesPublic: Array.isArray(data?.badgesPublic) ? data.badgesPublic : undefined,
        };
      }
      emit();
      },
      () => {
        // Safety net: if a batch contains any uid the viewer can't read yet, Firestore can throw
        // permission-denied for the whole query. We rely on the visibility index to prevent that,
        // but this keeps the app from crashing if it happens.
        emit();
      },
    );
    unsubs.push(unsub);
  }

  return () => unsubs.forEach((u) => u());
}


/**
 * One-shot: every group member's FP delta for a given week, from the public
 * weeklyPublic mirror. Members the viewer can't see (or with no scored week)
 * are skipped — used by the "Your Week" review's team card.
 */
export async function fetchGroupWeekDeltas(
  groupId: string,
  weekId: string,
): Promise<Array<{ uid: string; name: string; delta: number }>> {
  const members = await getDocs(collection(db, 'groups', groupId, 'members'));
  const rows = await Promise.all(
    members.docs.map(async (m) => {
      const uid = m.id;
      try {
        const [wk, pub] = await Promise.all([
          getDoc(doc(db, 'publicUsers', uid, 'weeklyPublic', weekId)),
          getDoc(doc(db, 'publicUsers', uid)),
        ]);
        if (!wk.exists()) return null;
        const delta = Math.round(Number((wk.data() as any)?.deltaMMR) || 0);
        const name = String((pub.data() as any)?.displayName ?? '').trim() || 'A teammate';
        return { uid, name, delta };
      } catch {
        return null; // not visible to this viewer — fine
      }
    }),
  );
  return (rows.filter(Boolean) as Array<{ uid: string; name: string; delta: number }>).sort((a, b) => b.delta - a.delta);
}
