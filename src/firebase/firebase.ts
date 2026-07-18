import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import * as FirebaseAuthModule from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Native auth session persistence.
//
// `getReactNativePersistence` is exported from @firebase/auth's React Native
// build, but the `firebase` umbrella package's ./auth export map has no
// `react-native` condition — so depending on how Metro resolves it, the helper
// may or may not exist at runtime. When it's missing, auth silently fell back
// to IN-MEMORY persistence and every user was signed out whenever the OS
// killed the process (Android does this aggressively — reported in prod
// 2026-07-18). Restoring it: use the SDK helper when present, otherwise a
// local AsyncStorage-backed persistence implementing the same internal
// contract. Both are pure JS, so this ships over-the-air.
const sdkGetReactNativePersistence: ((storage: unknown) => any) | undefined =
  (FirebaseAuthModule as any).getReactNativePersistence;

/**
 * AsyncStorage-backed Firebase auth persistence (fallback).
 * Mirrors the SDK's internal `PersistenceInternal` contract: a `LOCAL`-type
 * store with async get/set/remove and no-op cross-tab listeners (irrelevant on
 * native). Values are JSON round-tripped exactly as the SDK's own RN
 * persistence does.
 */
function makeAsyncStoragePersistence() {
  return {
    type: 'LOCAL' as const,
    async _isAvailable() {
      try {
        await AsyncStorage.setItem('__ab_auth_probe', '1');
        await AsyncStorage.removeItem('__ab_auth_probe');
        return true;
      } catch {
        return false;
      }
    },
    async _set(key: string, value: unknown) {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    },
    async _get(key: string) {
      const raw = await AsyncStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    },
    async _remove(key: string) {
      await AsyncStorage.removeItem(key);
    },
    // Native has no multi-tab story; the SDK only requires these to exist.
    _addListener(_key: string, _listener: unknown) {},
    _removeListener(_key: string, _listener: unknown) {},
  };
}

/** Which persistence path actually ran — surfaced in the app-health heartbeat. */
export let authPersistenceMode: 'sdk' | 'asyncstorage' | 'memory' | 'web' = 'memory';

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
  // Prefer the SDK's own RN persistence when Metro resolved a build that has
  // it; otherwise use our AsyncStorage implementation. Either keeps the user
  // signed in across app restarts — the point is to never land on in-memory.
  try {
    if (sdkGetReactNativePersistence) {
      const persistence = sdkGetReactNativePersistence(AsyncStorage);
      if (persistence) {
        authPersistenceMode = 'sdk';
        return persistence;
      }
    }
  } catch (error) {
    console.warn('[Firebase Auth] SDK RN persistence failed, using AsyncStorage fallback', error);
  }

  try {
    const persistence = makeAsyncStoragePersistence();
    authPersistenceMode = 'asyncstorage';
    return persistence;
  } catch (error) {
    console.error('[Firebase Auth] AsyncStorage persistence unavailable; sessions will not survive restart', error);
    authPersistenceMode = 'memory';
    return null;
  }
}

if (firebaseApp && isFirebaseConfigured() && !firebaseInitError) {
  if (Platform.OS === 'web') {
    authPersistenceMode = 'web';
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


