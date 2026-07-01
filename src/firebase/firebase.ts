import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import * as FirebaseAuthModule from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// `getReactNativePersistence` was removed from `firebase/auth` in Firebase JS
// SDK v11+ (confirmed absent at runtime in 12.8). Access it defensively so this
// compiles; when it is missing (the current case) native auth falls back to
// in-memory persistence below.
// KNOWN ISSUE (Phase 2/3): native session persistence is therefore inactive —
// users are signed out on app restart. Restoring it requires the Firebase v12
// React Native persistence approach.
const getReactNativePersistence: ((storage: unknown) => any) | undefined =
  (FirebaseAuthModule as any).getReactNativePersistence;

type FirebaseConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

const env = process.env as Record<string, string | undefined>;
const manifestExtra =
  (Constants.manifest as { extra?: Record<string, string | undefined> } | null | undefined)?.extra ??
  {};
const extra = (Constants.expoConfig?.extra ?? manifestExtra ?? {}) as Record<string, string | undefined>;

const firebaseConfig: FirebaseConfig = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY ?? extra.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? extra.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? extra.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? extra.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? extra.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID ?? extra.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.storageBucket &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId,
  );
}

// Initialize Firebase with error handling to prevent startup crashes
let firebaseApp: ReturnType<typeof getApp> | null = null;
let firebaseInitError: Error | null = null;

try {
  if (getApps().length > 0) {
    firebaseApp = getApp();
  } else if (isFirebaseConfigured()) {
    firebaseApp = initializeApp(firebaseConfig);
  } else {
    firebaseInitError = new Error('Firebase configuration is incomplete');
  }
} catch (error) {
  firebaseInitError = error as Error;
}

export { firebaseInitError };
export { firebaseApp };

// Firebase Auth persistence:
// - Web: default browser persistence via getAuth().
// - Native: AsyncStorage-backed persistence (keeps users signed in across restarts).
// Handle case where auth might already be initialized (e.g., hot reload).
let authInstance: ReturnType<typeof getAuth> | null = null;
let dbInstance: ReturnType<typeof getFirestore> | null = null;
let storageInstance: ReturnType<typeof getStorage> | null = null;

function getNativePersistence() {
  console.log('[Firebase Auth Debug] Attempting to load React Native persistence...');
  console.log('[Firebase Auth Debug] Platform:', Platform.OS);
  console.log('[Firebase Auth Debug] App ownership:', Constants.appOwnership);
  
  try {
    // In Firebase v9+, getReactNativePersistence is available directly from 'firebase/auth'
    if (!getReactNativePersistence) {
      console.warn('[Firebase Auth Debug] getReactNativePersistence not available');
      return null;
    }
    
    const persistence = getReactNativePersistence(AsyncStorage);
    console.log('[Firebase Auth Debug] ✅ Persistence loaded successfully:', !!persistence);
    return persistence;
  } catch (error) {
    console.error('[Firebase Auth Debug] ❌ Persistence load failed:', error);
    console.warn('[Firebase Auth Debug] Falling back to in-memory auth');
    return null;
  }
}

if (firebaseApp && isFirebaseConfigured() && !firebaseInitError) {
  if (Platform.OS === 'web') {
    console.log('[Firebase Auth Debug] Web platform - using default browser persistence');
    authInstance = getAuth(firebaseApp);
  } else {
    console.log('[Firebase Auth Debug] Native platform - initializing auth with persistence');
    
    const persistence = getNativePersistence();
    if (persistence) {
      try {
        console.log('[Firebase Auth Debug] ✅ Initializing auth WITH persistence');
        authInstance = initializeAuth(firebaseApp, { persistence });
        console.log('[Firebase Auth Debug] ✅ Auth initialized with persistence');
      } catch (error: any) {
        // Auth already initialized (e.g., during hot reload or app restart)
        if (error?.code === 'auth/already-initialized') {
          console.log('[Firebase Auth Debug] Auth already initialized, using existing instance (should have persistence)');
          // Use the existing instance - it should already have persistence if initialized correctly
          authInstance = getAuth(firebaseApp);
        } else {
          console.error('[Firebase Auth Debug] ❌ Auth initialization error:', error);
          firebaseInitError = error as Error;
        }
      }
    } else {
      console.warn('[Firebase Auth Debug] ⚠️ Could not load persistence, initializing without persistence');
      try {
        authInstance = initializeAuth(firebaseApp);
      } catch (error: any) {
        if (error?.code === 'auth/already-initialized') {
          authInstance = getAuth(firebaseApp);
        } else {
          console.error('[Firebase Auth Debug] ❌ Auth initialization error:', error);
          firebaseInitError = error as Error;
        }
      }
    }
    
    console.log('[Firebase Auth Debug] Final auth instance:', !!authInstance);
  }
  if (!firebaseInitError) {
    dbInstance = getFirestore(firebaseApp);
    storageInstance = getStorage(firebaseApp);
  }
}

// These are typed as non-null for ergonomics: the app gates all Firestore/Auth
// usage behind the bootstrap above and renders FirebaseConfigErrorScreen when
// Firebase is unconfigured, so by the time any service touches these they are
// initialized. `firebaseInitError` / `isFirebaseConfigured()` remain the runtime
// source of truth for the unconfigured case.
export const auth = authInstance as NonNullable<typeof authInstance>;
export const db = dbInstance as NonNullable<typeof dbInstance>;
export const storage = storageInstance as NonNullable<typeof storageInstance>;


