import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export type HealthSettings = {
  syncWorkouts: boolean;
  syncCalories: boolean;
  syncWeight: boolean;
  lastSyncAt?: unknown; // Firestore Timestamp
  healthKitAuthorized?: boolean;
  googleFitAuthorized?: boolean;
};

const DEFAULT_SETTINGS: HealthSettings = {
  syncWorkouts: false,
  syncCalories: false,
  syncWeight: false,
};

/**
 * Subscribe to user's health settings
 */
export function subscribeHealthSettings(
  uid: string,
  onChange: (settings: HealthSettings | null) => void,
  onError?: (err: unknown) => void,
) {
  return onSnapshot(
    doc(db, 'users', uid, 'healthSettings', 'settings'),
    (snap) => {
      if (!snap.exists()) {
        onChange(DEFAULT_SETTINGS);
        return;
      }
      const data = snap.data() as any;
      onChange({
        syncWorkouts: data.syncWorkouts ?? false,
        syncCalories: data.syncCalories ?? false,
        syncWeight: data.syncWeight ?? false,
        lastSyncAt: data.lastSyncAt ?? null,
        healthKitAuthorized: data.healthKitAuthorized ?? false,
        googleFitAuthorized: data.googleFitAuthorized ?? false,
      });
    },
    onError,
  );
}

/**
 * Update user's health settings
 */
export async function updateHealthSettings(
  uid: string,
  settings: Partial<HealthSettings>,
): Promise<void> {
  const patch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (settings.syncWorkouts !== undefined) patch.syncWorkouts = settings.syncWorkouts;
  if (settings.syncCalories !== undefined) patch.syncCalories = settings.syncCalories;
  if (settings.syncWeight !== undefined) patch.syncWeight = settings.syncWeight;
  if (settings.lastSyncAt !== undefined) patch.lastSyncAt = settings.lastSyncAt;
  if (settings.healthKitAuthorized !== undefined) patch.healthKitAuthorized = settings.healthKitAuthorized;
  if (settings.googleFitAuthorized !== undefined) patch.googleFitAuthorized = settings.googleFitAuthorized;

  await setDoc(doc(db, 'users', uid, 'healthSettings', 'settings'), patch, { merge: true });
}
