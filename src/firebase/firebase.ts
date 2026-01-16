import { Platform } from 'react-native';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

type FirebaseConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

const env = process.env as Record<string, string | undefined>;

const firebaseConfig: FirebaseConfig = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
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

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Firebase Auth persistence:
// - Web: default browser persistence via getAuth().
// - Native: AsyncStorage-backed persistence (keeps users signed in across restarts).
// Handle case where auth might already be initialized (e.g., hot reload).
let authInstance: ReturnType<typeof getAuth>;
if (Platform.OS === 'web') {
  authInstance = getAuth(firebaseApp);
} else {
  try {
    authInstance = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error: any) {
    // Auth already initialized (e.g., during hot reload), use existing instance
    if (error?.code === 'auth/already-initialized') {
      authInstance = getAuth(firebaseApp);
    } else {
      throw error;
    }
  }
}
export const auth = authInstance;
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);


