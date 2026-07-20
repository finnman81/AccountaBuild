/**
 * Lightweight JS crash/error reporting (pre-Sentry stopgap, and a permanent
 * complement to it): fatal + first-of-a-kind JS errors are written to the
 * `clientErrors` Firestore collection (create-only for clients; read via
 * admin/console). Because a FATAL error usually kills the app before a
 * network write can flush, every report is ALSO queued in AsyncStorage and
 * uploaded on the next launch (flushPendingErrors).
 *
 * Native crashes (the process dying before JS runs) are invisible here by
 * nature — that's what Sentry covers once the post-build-hold build ships.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { db } from '../firebase/firebase';

const PENDING_KEY = 'pendingClientErrors';
const MAX_PER_SESSION = 5;
const MAX_PENDING = 10;

let currentUid: string | null = null;
let reportedThisSession = 0;
const seenThisSession = new Set<string>();

export function setErrorReporterUser(uid: string | null) {
  currentUid = uid;
}

type ErrorRecord = {
  uid: string | null;
  message: string;
  stack: string;
  isFatal: boolean;
  platform: string;
  osVersion: string;
  appVersion: string | null;
  updateId: string | null;
  atMs: number;
};

function buildRecord(error: unknown, isFatal: boolean): ErrorRecord {
  let updateId: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    updateId = require('expo-updates').updateId ?? null;
  } catch {
    /* dev client / older build */
  }
  const err = error as { message?: unknown; stack?: unknown } | null;
  return {
    uid: currentUid,
    message: String(err?.message ?? error).slice(0, 500),
    stack: String(err?.stack ?? '').slice(0, 4000),
    isFatal,
    platform: Platform.OS,
    osVersion: String(Platform.Version ?? ''),
    appVersion: (Constants.expoConfig?.version as string | undefined) ?? null,
    updateId,
    atMs: Date.now(),
  };
}

async function upload(rec: ErrorRecord) {
  await addDoc(collection(db, 'clientErrors'), {
    ...rec,
    createdAt: serverTimestamp(),
  });
}

function report(error: unknown, isFatal: boolean) {
  if (reportedThisSession >= MAX_PER_SESSION) return;
  const rec = buildRecord(error, isFatal);
  const key = rec.message.slice(0, 120);
  if (seenThisSession.has(key)) return;
  seenThisSession.add(key);
  reportedThisSession += 1;

  // Queue first (survives a fatal teardown), then try the live write.
  void AsyncStorage.getItem(PENDING_KEY)
    .then((raw) => {
      const arr: ErrorRecord[] = raw ? JSON.parse(raw) : [];
      arr.push(rec);
      return AsyncStorage.setItem(PENDING_KEY, JSON.stringify(arr.slice(-MAX_PENDING)));
    })
    .catch(() => {});
  upload(rec)
    .then(() =>
      // Live write landed — drop it from the pending queue so the next
      // launch doesn't double-report it.
      AsyncStorage.getItem(PENDING_KEY).then((raw) => {
        const arr: ErrorRecord[] = raw ? JSON.parse(raw) : [];
        return AsyncStorage.setItem(PENDING_KEY, JSON.stringify(arr.filter((r) => r.atMs !== rec.atMs)));
      }),
    )
    .catch(() => {});
}

/** Install the global handler. Call once, as early as possible (App.tsx). */
export function installErrorReporter() {
  const eu = (global as any).ErrorUtils;
  if (!eu?.setGlobalHandler) return;
  const prev = eu.getGlobalHandler?.();
  eu.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    try {
      report(error, !!isFatal);
    } catch {
      /* reporting must never make a crash worse */
    }
    if (typeof prev === 'function') prev(error, isFatal);
  });
}

/**
 * Non-fatal diagnostic breadcrumb → clientErrors (create-only for clients).
 * For remotely debugging flows we can't reproduce locally (no dev device on
 * hand). Cheap, but don't leave high-frequency call sites behind.
 */
export function reportDebug(tag: string, data: Record<string, unknown>) {
  try {
    const rec = buildRecord({ message: `[debug] ${tag}`, stack: JSON.stringify(data).slice(0, 3500) }, false);
    void upload(rec).catch(() => {});
  } catch {
    /* never throw into app code */
  }
}

/** Upload errors queued by a previous (possibly crashed) session. */
export async function flushPendingErrors() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return;
    const arr: ErrorRecord[] = JSON.parse(raw);
    if (!arr.length) return;
    await AsyncStorage.removeItem(PENDING_KEY);
    for (const rec of arr.slice(-MAX_PENDING)) {
      await upload(rec).catch(() => {});
    }
  } catch {
    /* best-effort */
  }
}
