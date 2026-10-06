import AsyncStorage from '@react-native-async-storage/async-storage';
import { arrayUnion, doc, setDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';

/**
 * Session-loss diagnostic (Regmong, Android, 2026-10-06: signed out every
 * morning; nothing in our code signs anyone out).
 *
 * Device-side because a signed-out phone can't write to Firestore: the loss is
 * recorded locally when we notice it, then uploaded to
 * users/{uid}.sessionLosses on the next sign-in. Answers three questions:
 *  - did ALL local storage vanish (canary gone = OS/app data wiped), or only
 *    the Firebase login key?
 *  - when was the session last seen alive?
 *  - did the background health task run between then and the loss, and did
 *    it still see a signed-in user?
 * Remove once the cause is found.
 */
const CANARY = 'diag:canary';
const LAST_UID = 'diag:lastUid';
const LAST_ALIVE = 'diag:lastAliveAt';
const EXPLICIT_LOGOUT = 'diag:explicitLogout';
const LAST_BG = 'diag:lastBg';
const PENDING = 'diag:pendingLoss';

type BootState = { canaryAt: string | null; authKey: boolean; keyCount: number };

let boot: Promise<BootState> | null = null;

/** Snapshot storage BEFORE Firebase restores (call at module load). */
export function captureBootState(): Promise<BootState> {
  if (!boot) {
    boot = (async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const canaryAt = await AsyncStorage.getItem(CANARY);
        if (!canaryAt) await AsyncStorage.setItem(CANARY, new Date().toISOString());
        return { canaryAt, authKey: keys.some((k) => k.startsWith('firebase:authUser')), keyCount: keys.length };
      } catch {
        return { canaryAt: null, authKey: false, keyCount: -1 };
      }
    })();
  }
  return boot;
}

/** First auth state of this launch. */
export async function noteAuthState(uid: string | null): Promise<void> {
  try {
    const b = await captureBootState();
    if (uid) {
      await AsyncStorage.multiSet([[LAST_UID, uid], [LAST_ALIVE, new Date().toISOString()]]);
      await AsyncStorage.removeItem(EXPLICIT_LOGOUT);
      return;
    }
    const [[, lastUid], [, lastAlive], [, explicit], [, lastBg]] = await AsyncStorage.multiGet([
      LAST_UID, LAST_ALIVE, EXPLICIT_LOGOUT, LAST_BG,
    ]);
    if (explicit) return;
    // No lastUid either means a fresh install OR a full wipe; the canary tells
    // which, but with nothing to attribute it to we can only record it on the
    // next sign-in via the canary age.
    await AsyncStorage.setItem(PENDING, JSON.stringify({
      detectedAt: new Date().toISOString(),
      lastUid: lastUid ?? null,
      lastAliveAt: lastAlive ?? null,
      canaryAtBoot: b.canaryAt,
      authKeyAtBoot: b.authKey,
      keyCountAtBoot: b.keyCount,
      lastBg: lastBg ? JSON.parse(lastBg) : null,
    }));
  } catch {
    /* diagnostics never break auth */
  }
}

/** Keep "last seen alive" fresh while the app is in use. */
export function noteAlive(): void {
  void AsyncStorage.setItem(LAST_ALIVE, new Date().toISOString()).catch(() => {});
}

export function noteExplicitLogout(): void {
  void AsyncStorage.setItem(EXPLICIT_LOGOUT, '1').catch(() => {});
}

/** Background task wake: did it see a signed-in user? */
export function noteBackgroundWake(hadUser: boolean): void {
  void AsyncStorage.setItem(LAST_BG, JSON.stringify({ at: new Date().toISOString(), hadUser })).catch(() => {});
}

/** After sign-in: upload any pending loss record. */
export async function flushSessionLoss(uid: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING);
    if (!raw) return;
    const rec = JSON.parse(raw);
    await setDoc(doc(db, 'users', uid), { sessionLosses: arrayUnion({ ...rec, signedInAt: new Date().toISOString() }) }, { merge: true });
    await AsyncStorage.removeItem(PENDING);
  } catch {
    /* retry next launch */
  }
}
