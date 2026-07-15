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
import AsyncStorage from '@react-native-async-storage/async-storage';

import { auth, db, firebaseInitError, isFirebaseConfigured } from '../firebase/firebase';
import { syncMyMemberProfileToAllGroups } from '../services/profile';
import { STARTING_MMR, STARTING_TIER, STARTING_DIVISION } from '../mmr/constants';

// Debug: Check AsyncStorage for Firebase auth data
async function debugAsyncStorage() {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const firebaseKeys = allKeys.filter((k) => k.includes('firebase') || k.includes('auth'));
    console.log('[Auth Debug] AsyncStorage keys (Firebase-related):', firebaseKeys);
    
    if (firebaseKeys.length > 0) {
      const values = await AsyncStorage.multiGet(firebaseKeys);
      console.log('[Auth Debug] AsyncStorage values:', values.map(([k, v]) => [k, v?.substring(0, 50)]));
    } else {
      console.warn('[Auth Debug] ⚠️ No Firebase auth keys found in AsyncStorage');
    }
  } catch (error) {
    console.error('[Auth Debug] Error checking AsyncStorage:', error);
  }
}

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
    
    // Debug: Check AsyncStorage on mount
    void debugAsyncStorage();
    
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      console.log('[Auth Debug] 🔔 Auth state changed:', {
        hasUser: !!firebaseUser,
        uid: firebaseUser?.uid,
        email: firebaseUser?.email,
        timestamp: new Date().toISOString(),
      });
      
      // Debug: Check AsyncStorage after auth state change
      if (firebaseUser) {
        void debugAsyncStorage();
      }
      
      setUser(firebaseUser ? toAuthUser(firebaseUser) : null);
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

        // Create/update a basic user profile doc, seeded at the Silver IV
        // starting rank (prev* seeded equal so no phantom movement arrow shows).
        await setDoc(
          doc(db, 'users', credential.user.uid),
          {
            email: credential.user.email,
            displayName: displayName.trim(),
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
        );

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
        await signOut(auth);
        console.log('[Auth Debug] ✅ Logout complete');
      },
    }),
    [isLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


