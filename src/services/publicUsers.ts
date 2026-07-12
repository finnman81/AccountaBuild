import {
  collection,
  doc,
  documentId,
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
  const ref = query(collection(db, 'publicUsers', uid, 'weeklyPublic'), orderBy(documentId(), 'desc'), limit(max));
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

