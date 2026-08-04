import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';

/**
 * Reporting + blocking — App Store Guideline 1.2 requires both for any app
 * with user-generated content (our chat, progress photos, and log notes).
 *
 * Reports are write-only by rule: a reporter can't check whether their report
 * landed, and a reported user can't discover who filed it. Blocks live under
 * the blocker's own doc, so nobody can enumerate who blocked them.
 */
export type ReportKind = 'message' | 'photo' | 'log' | 'user';

export async function reportContent(params: {
  reporterUid: string;
  targetUid: string;
  kind: ReportKind;
  reason: string;
  groupId?: string | null;
  contentId?: string | null;
  contentText?: string | null;
}): Promise<void> {
  await addDoc(collection(db, 'reports'), {
    reporterUid: params.reporterUid,
    targetUid: params.targetUid,
    kind: params.kind,
    reason: params.reason.slice(0, 500),
    groupId: params.groupId ?? null,
    contentId: params.contentId ?? null,
    // Snapshot the offending text: the author can edit or delete it, and a
    // report pointing at vanished content is unreviewable.
    contentText: params.contentText ? params.contentText.slice(0, 500) : null,
    createdAt: serverTimestamp(),
    status: 'open',
  });
}

export async function blockUser(myUid: string, blockedUid: string): Promise<void> {
  if (myUid === blockedUid) return;
  await setDoc(doc(db, 'users', myUid, 'blocks', blockedUid), {
    uid: blockedUid,
    blockedAt: serverTimestamp(),
  });
}

export async function unblockUser(myUid: string, blockedUid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', myUid, 'blocks', blockedUid));
}

/** Live set of uids this user has blocked. */
export function subscribeMyBlocks(uid: string, onChange: (blocked: Set<string>) => void) {
  return onSnapshot(
    collection(db, 'users', uid, 'blocks'),
    (snap) => onChange(new Set(snap.docs.map((d) => d.id))),
    () => onChange(new Set()),
  );
}
