import { doc, onSnapshot, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { upsertMyPublicUser } from './publicUsers';
import { upsertGoal } from './mmrGoals';
import { DEFAULT_TZ, yyyyMmDdInTz } from '../mmr/time';

/** Add N days to a YYYY-MM-DD string (noon anchor avoids DST edge cases). */
function addDaysToYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  height: number | null;
  age: number | null;
  weightCurrent: number | null;
  weightGoal: number | null;
  weightTargetDate: string | null; // YYYY-MM-DD
  /** Display-units preference (weight is always STORED in lb regardless). */
  units?: 'imperial' | 'metric' | null;
  // User-level goals (persist across groups)
  dailyCalorieGoal?: number | null;
  workoutsPerWeek?: number | null;
  logCaloriesDaysPerWeek?: number | null;
  logWeightDaysPerWeek?: number | null;
};

export function subscribeMyProfile(
  uid: string,
  onChange: (profile: UserProfile | null) => void,
  onError?: (err: unknown) => void,
) {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      const data = snap.data() as any;
      onChange({
        uid,
        email: data.email ?? null,
        displayName: data.displayName ?? null,
        photoURL: data.photoURL ?? null,
        height: data.height ?? null,
        age: data.age ?? null,
        weightCurrent: data.weightCurrent ?? null,
        weightGoal: data.weightGoal ?? null,
        weightTargetDate: data.weightTargetDate ?? null,
        units: data.units === 'metric' ? 'metric' : data.units === 'imperial' ? 'imperial' : null,
        dailyCalorieGoal: typeof data.dailyCalorieGoal === 'number' ? data.dailyCalorieGoal : null,
        workoutsPerWeek: typeof data.workoutsPerWeek === 'number' ? data.workoutsPerWeek : null,
        logCaloriesDaysPerWeek: typeof data.logCaloriesDaysPerWeek === 'number' ? data.logCaloriesDaysPerWeek : null,
        logWeightDaysPerWeek: typeof data.logWeightDaysPerWeek === 'number' ? data.logWeightDaysPerWeek : null,
      });
    },
    onError,
  );
}

export async function updateMyProfile(params: {
  uid: string;
  displayName?: string | null;
  photoURL?: string | null;
  height?: number | null;
  age?: number | null;
  weightCurrent?: number | null;
  weightGoal?: number | null;
  weightTargetDate?: string | null; // YYYY-MM-DD
  dailyCalorieGoal?: number | null;
  workoutsPerWeek?: number | null;
  logCaloriesDaysPerWeek?: number | null;
  logWeightDaysPerWeek?: number | null;
}) {
  // Important: treat `undefined` as "no change". Only explicit `null` clears a field.
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (params.displayName !== undefined) patch.displayName = params.displayName;
  if (params.photoURL !== undefined) patch.photoURL = params.photoURL;
  if (params.height !== undefined) patch.height = params.height;
  if (params.age !== undefined) patch.age = params.age;
  if (params.weightCurrent !== undefined) patch.weightCurrent = params.weightCurrent;
  if (params.weightGoal !== undefined) patch.weightGoal = params.weightGoal;
  if (params.weightTargetDate !== undefined) patch.weightTargetDate = params.weightTargetDate;
  if (params.dailyCalorieGoal !== undefined) patch.dailyCalorieGoal = params.dailyCalorieGoal;
  if (params.workoutsPerWeek !== undefined) patch.workoutsPerWeek = params.workoutsPerWeek;
  if (params.logCaloriesDaysPerWeek !== undefined) patch.logCaloriesDaysPerWeek = params.logCaloriesDaysPerWeek;
  if (params.logWeightDaysPerWeek !== undefined) patch.logWeightDaysPerWeek = params.logWeightDaysPerWeek;

  await setDoc(doc(db, 'users', params.uid), patch, { merge: true });

  // Keep a restricted “public” copy for group members to read without duplicating per-group.
  const publicPatch: Record<string, unknown> = { uid: params.uid };
  if (params.displayName !== undefined) publicPatch.displayName = params.displayName;
  if (params.photoURL !== undefined) publicPatch.photoURL = params.photoURL;
  if (params.height !== undefined) publicPatch.height = params.height;
  if (params.age !== undefined) publicPatch.age = params.age;
  if (params.weightCurrent !== undefined) publicPatch.weightCurrent = params.weightCurrent;
  if (params.weightGoal !== undefined) publicPatch.weightGoal = params.weightGoal;
  if (params.dailyCalorieGoal !== undefined) publicPatch.dailyCalorieGoal = params.dailyCalorieGoal;
  if (params.workoutsPerWeek !== undefined) publicPatch.workoutsPerWeek = params.workoutsPerWeek;
  if (params.logCaloriesDaysPerWeek !== undefined) publicPatch.logCaloriesDaysPerWeek = params.logCaloriesDaysPerWeek;
  if (params.logWeightDaysPerWeek !== undefined) publicPatch.logWeightDaysPerWeek = params.logWeightDaysPerWeek;

  await upsertMyPublicUser(params.uid, publicPatch);

  // Optional: if user explicitly set/cleared a weight target date or goal weight, sync it into the MMR weight timeline goal.
  // This keeps "Edit profile" as the simplest place to define a weight timeline.
  if (params.weightGoal !== undefined || params.weightTargetDate !== undefined) {
    const snap = await getDoc(doc(db, 'users', params.uid));
    const u = snap.exists() ? ((snap.data() as any) ?? {}) : {};
    const weightGoal = u.weightGoal as number | null | undefined;

    // Start of timeline: lock in start date + start weight when first enabled.
    const today = yyyyMmDdInTz(new Date(), DEFAULT_TZ);
    const startDate = (u.weightGoalStartDate as string | null | undefined) ?? today;
    const startWeight = (u.weightGoalStartWeight as number | null | undefined) ?? (u.weightCurrent as number | null | undefined);

    // Need a goal + a start weight to build a timeline; otherwise pause.
    if (!weightGoal || !startWeight || startWeight <= 0) {
      await Promise.all([
        upsertGoal(params.uid, 'weightLoss', { type: 'weightLoss', status: 'paused' }),
        upsertGoal(params.uid, 'weightGain', { type: 'weightGain', status: 'paused' }),
      ]);
      return;
    }

    // Default the target end date to 12 weeks out from the start when the user
    // hasn't picked one (start date already defaults to today, above).
    const targetDate = ((u.weightTargetDate as string | null | undefined) ?? null) || addDaysToYmd(startDate, 84);

    // Persist locked timeline anchors + the defaulted target date if missing.
    const anchorsPatch: Record<string, unknown> = {};
    if (u.weightGoalStartDate == null) anchorsPatch.weightGoalStartDate = startDate;
    if (u.weightGoalStartWeight == null) anchorsPatch.weightGoalStartWeight = startWeight;
    if (u.weightTargetDate == null) anchorsPatch.weightTargetDate = targetDate;
    if (Object.keys(anchorsPatch).length) {
      await setDoc(doc(db, 'users', params.uid), anchorsPatch, { merge: true });
    }

    const isLoss = weightGoal < startWeight;
    const activeId = isLoss ? 'weightLoss' : 'weightGain';
    const inactiveId = isLoss ? 'weightGain' : 'weightLoss';

    await upsertGoal(params.uid, activeId, {
      type: activeId,
      status: 'active',
      startWeight,
      goalWeight: weightGoal,
      startDate,
      targetEndDate: targetDate,
    });
    await upsertGoal(params.uid, inactiveId, { type: inactiveId, status: 'paused' });
  }
}

export type PublicMemberProfile = {
  displayName: string | null;
  photoURL?: string | null;
  height: number | null;
  age: number | null;
  weightCurrent: number | null;
  weightGoal: number | null;
};

export async function syncMyMemberProfileToAllGroups(uid: string) {
  // Back-compat shim: previously this function denormalized user profile into every group.
  // We now keep a restricted universal `publicUsers/{uid}` doc instead.
  const userSnap = await getDoc(doc(db, 'users', uid));
  const data = (userSnap.exists() ? (userSnap.data() as any) : {}) as any;
  // Important: do NOT write nulls for missing fields — that can unintentionally wipe profile info.
  // Only propagate fields that exist on the source doc. (Explicit `null` remains supported.)
  const patch: Record<string, unknown> = { uid };
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
  await upsertMyPublicUser(uid, patch);
}


