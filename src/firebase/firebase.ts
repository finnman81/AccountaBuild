import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

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

if (firebaseApp && isFirebaseConfigured() && !firebaseInitError) {
  if (Platform.OS === 'web') {
    authInstance = getAuth(firebaseApp);
  } else {
    try {
      authInstance = initializeAuth(firebaseApp);
    } catch (error: any) {
      // Auth already initialized (e.g., during hot reload), use existing instance
      if (error?.code === 'auth/already-initialized') {
        authInstance = getAuth(firebaseApp);
      } else {
        firebaseInitError = error as Error;
      }
    }
  }
  if (!firebaseInitError) {
    dbInstance = getFirestore(firebaseApp);
    storageInstance = getStorage(firebaseApp);
  }
}

export const auth = authInstance;
export const db = dbInstance;
export const storage = storageInstance;


