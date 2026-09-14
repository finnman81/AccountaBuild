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

// A stashed code is only good for a day. Past that, the tap is old news and
// pre-filling it weeks later ("Join a group" showing a stranger's code) is a bug.
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

type Pending = { code: string; at: number };

let pendingInMemory: Pending | null = null;

export async function setPendingJoinCode(code: string): Promise<void> {
  pendingInMemory = { code, at: Date.now() };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pendingInMemory)).catch(() => {});
}

/** Drop any stashed code (sign-out, or a code that already reached a join UI). */
export async function clearPendingJoinCode(): Promise<void> {
  pendingInMemory = null;
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

function parseStored(raw: string | null): Pending | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Pending>;
    return typeof p.code === 'string' && typeof p.at === 'number' ? { code: p.code, at: p.at } : null;
  } catch {
    return null; // pre-expiry builds stored a bare code with no timestamp: treat as stale
  }
}

/** Read-and-clear. Disk fallback covers a cold start that killed the JS heap. */
export async function consumePendingJoinCode(): Promise<string | null> {
  const pending = pendingInMemory ?? parseStored(await AsyncStorage.getItem(STORAGE_KEY).catch(() => null));
  pendingInMemory = null;
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  if (!pending || Date.now() - pending.at > PENDING_TTL_MS) return null;
  return pending.code || null;
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
