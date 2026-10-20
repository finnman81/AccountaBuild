import React, { createContext, useEffect, useMemo, useState } from 'react';
import {
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { auth, db, firebaseInitError, isFirebaseConfigured } from '../firebase/firebase';
import { syncMyMemberProfileToAllGroups } from '../services/profile';
import { STARTING_MMR, STARTING_TIER, STARTING_DIVISION } from '../mmr/constants';
import { getHydrated, setHydrated } from '../services/hydrationCache';
import { captureBootState, flushSessionLoss, noteAuthState, noteExplicitLogout } from '../services/sessionDiag';

void captureBootState();

export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue>({} as AuthContextValue);

function toAuthUser(user: FirebaseUser): AuthUser {
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}

/**
 * Last signed-in user, cached so the app can paint BEFORE Firebase Auth
 * finishes restoring. Sentry (10/19): on every launch Auth ran a token
 * refresh (~420ms) and then an account lookup (~380ms) back to back, and the
 * whole app waited behind them: Home mounted ~1.2s in, and the cached screen
 * data couldn't show because there was no user yet. Firestore queues its own
 * requests until Auth is ready, so painting early is safe; if Auth comes back
 * signed out, the app drops to Login a moment later.
 */
const LAST_USER_KEY = 'auth:lastUser';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getHydrated<AuthUser>(LAST_USER_KEY) ?? null);
  const [isLoading, setIsLoading] = useState(() => !getHydrated<AuthUser>(LAST_USER_KEY));
  const [didSyncMemberProfile, setDidSyncMemberProfile] = useState(false);

  useEffect(() => {
    console.log('[Auth Debug] Setting up auth state listener...');
    console.log('[Auth Debug] Firebase configured:', isFirebaseConfigured());
    console.log('[Auth Debug] Firebase init error:', firebaseInitError);
    console.log('[Auth Debug] Auth instance:', !!auth);
    
    if (!isFirebaseConfigured() || firebaseInitError || !auth) {
      console.warn('[Auth Debug] ⚠️ Skipping auth listener - Firebase not ready');
      setIsLoading(false);
      setUser(null);
      return;
    }

    console.log('[Auth Debug] ✅ Setting up onAuthStateChanged listener');
    
    let firstState = true;
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firstState || firebaseUser) void noteAuthState(firebaseUser?.uid ?? null);
      firstState = false;
      if (firebaseUser) void flushSessionLoss(firebaseUser.uid);
      console.log('[Auth Debug] 🔔 Auth state changed:', {
        hasUser: !!firebaseUser,
        uid: firebaseUser?.uid,
        email: firebaseUser?.email,
        timestamp: new Date().toISOString(),
      });
      
      const next = firebaseUser ? toAuthUser(firebaseUser) : null;
      setHydrated(LAST_USER_KEY, next);
      // Keep the cached object when nothing changed: effects keyed on `user`
      // would otherwise all re-run when Auth confirms the same person.
      setUser((prev) =>
        prev && next && prev.uid === next.uid && prev.email === next.email && prev.displayName === next.displayName ? prev : next,
      );
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  // Best-effort: keep the user's public member profile synced into all groups.
  // This is needed because Firestore rules only allow reading /users/{uid} for yourself,
  // so other members rely on groups/{groupId}/members/{uid}.displayName, etc.
  useEffect(() => {
    if (!user?.uid) {
      setDidSyncMemberProfile(false);
      return;
    }
    if (didSyncMemberProfile) return;
    setDidSyncMemberProfile(true);
    void syncMyMemberProfileToAllGroups(user.uid);
  }, [didSyncMemberProfile, user?.uid]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login: async (email: string, password: string) => {
        if (!auth) {
          throw new Error('Firebase is not initialized.');
        }
        console.log('[Auth Debug] 🔐 Attempting login for:', email.trim());
        await signInWithEmailAndPassword(auth, email.trim(), password);
        console.log('[Auth Debug] ✅ Login successful');
      },
      register: async (displayName: string, email: string, password: string) => {
        if (!auth || !db) {
          throw new Error('Firebase is not initialized.');
        }
        const credential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );

        await updateProfile(credential.user, { displayName: displayName.trim() });

        // Starting-rank seed (Silver IV) FIRST: rules allow rank keys only when
        // CREATING the doc. Best-effort: if something already created the doc,
        // this is rejected and the scorer's defaults (the same values) apply.
        await setDoc(
          doc(db, 'users', credential.user.uid),
          {
            height: null,
            age: null,
            weightCurrent: null,
            weightGoal: null,
            mmr: STARTING_MMR,
            rankTier: STARTING_TIER,
            rankDivision: STARTING_DIVISION,
            mp: 0,
            prevMmr: STARTING_MMR,
            prevRankTier: STARTING_TIER,
            prevRankDivision: STARTING_DIVISION,
          },
          { merge: true },
        ).catch(() => {});

        // Then the profile basics, in their own write, which always lands. They used to share one
        // write with the starting-rank seed; when anything (the heartbeat,
        // onboarding) created the user doc a moment earlier, that write became
        // an UPDATE touching rules-locked rank keys and was rejected whole, so
        // createdAt and email never landed (5 accounts by 2026-10-12; the
        // scorer then penalized the week before they signed up).
        await setDoc(
          doc(db, 'users', credential.user.uid),
          {
            email: credential.user.email,
            displayName: displayName.trim(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        // Mirror the starting rank into the public profile so the leaderboard
        // shows the new member at Silver IV right away.
        await setDoc(
          doc(db, 'publicUsers', credential.user.uid),
          {
            uid: credential.user.uid,
            displayName: displayName.trim(),
            mmrPublic: STARTING_MMR,
            rankTierPublic: STARTING_TIER,
            rankDivisionPublic: STARTING_DIVISION,
            mpPublic: 0,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ).catch(() => {});

        // If they join groups later, the login-time sync will populate group member profiles.
      },
      resetPassword: async (email: string) => {
        if (!auth) {
          throw new Error('Firebase is not initialized.');
        }
        await sendPasswordResetEmail(auth, email.trim());
      },
      logout: async () => {
        if (!auth) {
          throw new Error('Firebase is not initialized.');
        }
        console.log('[Auth Debug] 🚪 Logging out user');
        noteExplicitLogout();
        setHydrated(LAST_USER_KEY, null);
        await signOut(auth);
        console.log('[Auth Debug] ✅ Logout complete');
      },
    }),
    [isLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


