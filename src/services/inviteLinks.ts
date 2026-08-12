import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';

/**
 * Invite links: https://app.munitor.ai/join/ABC123 (universal link) and
 * accountabuild://join/ABC123 (custom scheme). Both roads end here.
 *
 * The code is stashed (memory + disk) rather than navigated immediately
 * because the tap can land anywhere in the lifecycle: signed out, mid-
 * onboarding, or cold start before the nav container exists. Whichever join
 * UI mounts next consumes it — JoinGroupScreen for members, the onboarding
 * group step for brand-new users who installed from the App Store (where iOS
 * drops the link context, so the landing page tells them the code survives
 * in their share thread).
 */

const STORAGE_KEY = 'pendingJoinCode';

/** Extract a normalized 6-char join code from an invite URL, else null. */
export function parseJoinCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /(?:app\.munitor\.ai|accountabuild:\/{0,2})\/?join\/([A-Za-z0-9]{6})(?:[/?#]|$)/.exec(url);
  return m ? m[1].toUpperCase() : null;
}

let pendingInMemory: string | null = null;

export async function setPendingJoinCode(code: string): Promise<void> {
  pendingInMemory = code;
  await AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
}

/** Read-and-clear. Disk fallback covers a cold start that killed the JS heap. */
export async function consumePendingJoinCode(): Promise<string | null> {
  const code = pendingInMemory ?? (await AsyncStorage.getItem(STORAGE_KEY).catch(() => null));
  pendingInMemory = null;
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  return code || null;
}

export type JoinPreview = { groupId: string; name: string };

/**
 * What the confirm step shows before anyone joins anything. joinCodes docs
 * are get-only for signed-in users (no listing), and they already carry the
 * group name — no server round-trip beyond the one doc.
 */
export async function fetchJoinPreview(joinCode: string): Promise<JoinPreview | null> {
  const code = joinCode.trim().toUpperCase();
  if (code.length !== 6) return null;
  try {
    const snap = await getDoc(doc(db, 'joinCodes', code));
    if (!snap.exists()) return null;
    const data = snap.data() as { groupId?: string; name?: string };
    if (!data.groupId) return null;
    return { groupId: data.groupId, name: (data.name ?? '').trim() || 'this group' };
  } catch {
    return null;
  }
}
