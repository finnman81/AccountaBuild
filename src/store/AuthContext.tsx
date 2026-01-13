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

import { auth, db, isFirebaseConfigured } from '../firebase/firebase';
import { syncMyMemberProfileToAllGroups } from '../services/profile';

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
    if (!isFirebaseConfigured()) {
      setIsLoading(false);
      setUser(null);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
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
        await signInWithEmailAndPassword(auth, email.trim(), password);
      },
      register: async (displayName: string, email: string, password: string) => {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );

        await updateProfile(credential.user, { displayName: displayName.trim() });

        // Create/update a basic user profile doc.
        await setDoc(
          doc(db, 'users', credential.user.uid),
          {
            email: credential.user.email,
            displayName: displayName.trim(),
            height: null,
            age: null,
            weightCurrent: null,
            weightGoal: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        // If they join groups later, the login-time sync will populate group member profiles.
      },
      resetPassword: async (email: string) => {
        await sendPasswordResetEmail(auth, email.trim());
      },
      logout: async () => {
        await signOut(auth);
      },
    }),
    [isLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


