import { Platform } from 'react-native';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth, inMemoryPersistence, setPersistence } from 'firebase/auth';
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
// - Native: use in-memory persistence for now (Expo managed, no native-only deps).
//   This keeps us unblocked and cross-platform; we can swap to secure persistence later.
export const auth = Platform.OS === 'web' ? getAuth(firebaseApp) : initializeAuth(firebaseApp);
if (Platform.OS !== 'web') {
  void setPersistence(auth, inMemoryPersistence);
}
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);


