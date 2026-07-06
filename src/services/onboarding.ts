import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { CURRENT_ONBOARDING_VERSION, type OnboardingData } from '../hooks/useOnboardingStatus';

export async function checkOnboardingStatus(uid: string): Promise<boolean> {
  if (!db) throw new Error('Firebase is not initialized');

  const userDoc = await getDoc(doc(db, 'users', uid));
  if (!userDoc.exists()) return false;

  const data = userDoc.data();
  const onboarding = (data.onboarding as OnboardingData | undefined) ?? { completed: false };
  const seenCurrentVersion = (onboarding.version ?? 1) >= CURRENT_ONBOARDING_VERSION;
  return onboarding.completed === true && seenCurrentVersion;
}

export async function updateOnboardingStep(uid: string, step: number): Promise<void> {
  if (!db) throw new Error('Firebase is not initialized');
  
  const userRef = doc(db, 'users', uid);
  const userDoc = await getDoc(userRef);
  const existingData = userDoc.exists() ? userDoc.data() : {};
  const existingOnboarding: Partial<OnboardingData> = (existingData.onboarding as Partial<OnboardingData> | undefined) ?? {};

  await setDoc(
    userRef,
    {
      onboarding: {
        ...existingOnboarding,
        lastStep: step,
        startedAt: existingOnboarding.startedAt ?? serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function completeOnboarding(uid: string): Promise<void> {
  if (!db) throw new Error('Firebase is not initialized');
  
  const userRef = doc(db, 'users', uid);
  const userDoc = await getDoc(userRef);
  const existingData = userDoc.exists() ? userDoc.data() : {};
  const existingOnboarding = (existingData.onboarding as OnboardingData | undefined) ?? {};
  
  await setDoc(
    userRef,
    {
      onboarding: {
        ...existingOnboarding,
        completed: true,
        completedAt: serverTimestamp(),
        version: CURRENT_ONBOARDING_VERSION,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getOnboardingData(uid: string): Promise<OnboardingData | null> {
  if (!db) throw new Error('Firebase is not initialized');
  
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (!userDoc.exists()) return null;
  
  const data = userDoc.data();
  return (data.onboarding as OnboardingData | undefined) ?? null;
}
