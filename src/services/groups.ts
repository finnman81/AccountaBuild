import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '../firebase/firebase';

export type UserGroupListItem = {
  groupId: string;
  name: string;
  description: string | null;
  joinCode: string;
  role: 'admin' | 'member';
  // Optional group metadata (from groups/{groupId})
  logoUrl?: string | null;
  memberCount?: number | null;
  lastActivityAt?: unknown;
  // Optional per-user “last seen” timestamps for badges.
  chatLastSeenAt?: unknown;
  photosLastSeenAt?: unknown;
};

function normalizeJoinCode(code: string) {
  return code.trim().toUpperCase();
}

function generateJoinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoids ambiguous chars
  let out = '';
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function reserveJoinCode(params: {
  createdBy: string;
  groupId: string;
  name: string;
  description: string | null;
}) {
  // Try a few times to avoid collisions.
  for (let i = 0; i < 8; i += 1) {
    const joinCode = generateJoinCode();
    const ref = doc(db, 'joinCodes', joinCode);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;

    await setDoc(ref, {
      joinCode,
      groupId: params.groupId,
      name: params.name,
      description: params.description,
      createdBy: params.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return joinCode;
  }
  throw new Error('Failed to generate unique join code');
}

export async function ensureJoinCodeMapping(params: {
  joinCode: string;
  groupId: string;
  name: string;
  description: string | null;
  createdBy: string;
}) {
  const code = normalizeJoinCode(params.joinCode);
  const ref = doc(db, 'joinCodes', code);
  const existing = await getDoc(ref);
  if (existing.exists()) return;
  await setDoc(ref, {
    joinCode: code,
    groupId: params.groupId,
    name: params.name,
    description: params.description,
    createdBy: params.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function createGroup(params: {
  uid: string;
  displayName?: string | null;
  name: string;
  description?: string;
}): Promise<{ groupId: string; joinCode: string }> {
  const name = params.name.trim();
  const description = params.description?.trim() || null;

  const groupRef = await addDoc(collection(db, 'groups'), {
    name,
    description,
    joinCode: '__pending__',
    createdBy: params.uid,
    memberCount: 1,
    lastActivityAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const groupId = groupRef.id;
  const joinCode = await reserveJoinCode({
    createdBy: params.uid,
    groupId,
    name,
    description,
  });

  await setDoc(doc(db, 'groups', groupId), { joinCode }, { merge: true });

  // Write membership in two places:
  // 1) groups/{groupId}/members/{uid} for group-scoped reads
  // 2) users/{uid}/groups/{groupId} for efficient “my groups” listing
  await Promise.all([
    setDoc(doc(db, 'groups', groupId, 'members', params.uid), {
      uid: params.uid,
      role: 'admin',
      joinedAt: serverTimestamp(),
    }),
    setDoc(doc(db, 'users', params.uid, 'groups', groupId), {
      groupId,
      name,
      description,
      joinCode,
      role: 'admin',
      joinedAt: serverTimestamp(),
      chatLastSeenAt: serverTimestamp(),
      photosLastSeenAt: serverTimestamp(),
    }),
  ]);

  return { groupId, joinCode };
}

export async function joinGroupByCode(params: {
  uid: string;
  displayName?: string | null;
  joinCode: string;
}): Promise<{ groupId: string }> {
  const code = normalizeJoinCode(params.joinCode);
  const maskedCode = code.length >= 4 ? `${code.slice(0, 2)}...${code.slice(-2)}` : code;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/d78cd2b8-8a4c-4720-ac47-838b1499e885', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'debug-session',
      runId: 'pre-fix',
      hypothesisId: 'H1',
      location: 'services/groups.ts:154',
      message: 'joinGroupByCode entry',
      data: { joinCodeLen: code.length, maskedCode, hasDisplayName: !!params.displayName },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (!code || code.length !== 6) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d78cd2b8-8a4c-4720-ac47-838b1499e885', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'pre-fix',
        hypothesisId: 'H5',
        location: 'services/groups.ts:155',
        message: 'join code invalid length',
        data: { joinCodeLen: code.length, maskedCode },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw new Error('Join code must be 6 characters');
  }
  const joinRef = doc(db, 'joinCodes', code);
  const joinSnap = await getDoc(joinRef);
  
  if (!joinSnap.exists()) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d78cd2b8-8a4c-4720-ac47-838b1499e885', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'pre-fix',
        hypothesisId: 'H1',
        location: 'services/groups.ts:161',
        message: 'join code lookup missing',
        data: { maskedCode },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw new Error(
      `Join code "${code}" not found. The group admin may need to regenerate the join code. ` +
      `If you're the admin, try viewing the group details to backfill the join code mapping.`
    );
  }

  const join = joinSnap.data() as { groupId: string; name?: string; description?: string | null; joinCode?: string };
  const groupId = join.groupId;
  const name = join.name ?? 'Group';
  const description = join.description ?? null;
  const joinCodeFromDoc = join.joinCode ?? code;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/d78cd2b8-8a4c-4720-ac47-838b1499e885', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'debug-session',
      runId: 'pre-fix',
      hypothesisId: 'H1',
      location: 'services/groups.ts:168',
      message: 'join code lookup found',
      data: { maskedCode, groupId, joinCodeFromDoc: joinCodeFromDoc ? `${joinCodeFromDoc.slice(0, 2)}...${joinCodeFromDoc.slice(-2)}` : null },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  // Note: We don't check if the group exists here because Firestore rules require
  // membership to read group documents. If the join code exists, the group exists
  // (join codes are cleaned up when groups are deleted). The membership creation
  // will fail gracefully if the group was deleted.

  // Check if user is already a member
  const memberRef = doc(db, 'groups', groupId, 'members', params.uid);
  const memberSnap = await getDoc(memberRef);
  const isAlreadyMember = memberSnap.exists();
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/d78cd2b8-8a4c-4720-ac47-838b1499e885', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'debug-session',
      runId: 'pre-fix',
      hypothesisId: 'H2',
      location: 'services/groups.ts:182',
      message: 'member lookup result',
      data: { groupId, isAlreadyMember },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (isAlreadyMember) {
    // User is already a member, just update their user groups reference if needed
    await setDoc(
      doc(db, 'users', params.uid, 'groups', groupId),
      {
        groupId,
        name,
        description,
        joinCode: joinCodeFromDoc,
        role: memberSnap.data()?.role ?? 'member',
        joinedAt: memberSnap.data()?.joinedAt ?? serverTimestamp(),
        chatLastSeenAt: serverTimestamp(),
        photosLastSeenAt: serverTimestamp(),
      },
      { merge: true },
    );
    return { groupId };
  }

  // User is not a member, join them
  // Ensure user document exists first (in case it wasn't created during registration)
  try {
    const userRef = doc(db, 'users', params.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      // Create minimal user document if it doesn't exist
      await setDoc(
        userRef,
        {
          email: null, // Will be populated by auth sync
          displayName: params.displayName ?? null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }
  } catch (userDocError) {
    console.error('[Groups] Error ensuring user document exists:', userDocError);
    // Continue anyway - the write might still work
  }

  try {
    await Promise.all([
      setDoc(
        doc(db, 'groups', groupId, 'members', params.uid),
        { uid: params.uid, role: 'member', joinedAt: serverTimestamp() },
        { merge: true },
      ),
      updateDoc(doc(db, 'groups', groupId), { memberCount: increment(1), lastActivityAt: serverTimestamp(), updatedAt: serverTimestamp() }),
      setDoc(
        doc(db, 'users', params.uid, 'groups', groupId),
        {
          groupId,
          name,
          description,
          joinCode: joinCodeFromDoc,
          role: 'member',
          joinedAt: serverTimestamp(),
          chatLastSeenAt: serverTimestamp(),
          photosLastSeenAt: serverTimestamp(),
        },
        { merge: true },
      ),
    ]);
  } catch (joinError: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d78cd2b8-8a4c-4720-ac47-838b1499e885', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'pre-fix',
        hypothesisId: 'H3',
        location: 'services/groups.ts:249',
        message: 'join group write failed',
        data: { groupId, maskedCode, errorCode: joinError?.code || null, errorMessage: joinError?.message || String(joinError) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    console.error('[Groups] Error joining group:', {
      uid: params.uid,
      groupId,
      joinCode: code,
      error: joinError?.message || joinError,
      code: joinError?.code,
    });
    throw new Error(
      `Failed to join group: ${joinError?.message || 'Unknown error'}. ` +
      `If this persists, please check that your account was created properly.`
    );
  }

  return { groupId };
}

export async function deleteGroupAsCreator(params: { uid: string; groupId: string }) {
  const groupRef = doc(db, 'groups', params.groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) throw new Error('Group not found');
  const data = groupSnap.data() as any;
  if (data?.createdBy !== params.uid) throw new Error('Only the group creator can delete this group');

  // Best-effort cleanup: remove creator’s membership pointers.
  await Promise.allSettled([
    deleteDoc(doc(db, 'users', params.uid, 'groups', params.groupId)),
    deleteDoc(doc(db, 'groups', params.groupId, 'members', params.uid)),
  ]);

  // Delete join code mapping so nobody can join after deletion.
  const joinCode = String(data?.joinCode ?? '').trim();
  if (joinCode) {
    await Promise.allSettled([deleteDoc(doc(db, 'joinCodes', joinCode))]);
  }

  // Delete the group doc last (rules gate access to subcollections off group existence now).
  await deleteDoc(groupRef);
}

export function subscribeMyGroups(
  uid: string,
  onChange: (groups: UserGroupListItem[]) => void,
  onError?: (err: unknown) => void,
) {
  const ref = collection(db, 'users', uid, 'groups');
  return onSnapshot(
    ref,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as UserGroupListItem);

      // If a group doc was deleted but the user's membership doc remains,
      // hide it from the UI and delete the stale membership doc.
      void (async () => {
        const checked = await Promise.all(
          items.map(async (g) => {
            if (!g?.groupId) return null;
            const groupSnap = await getDoc(doc(db, 'groups', g.groupId));
            if (!groupSnap.exists()) {
              await deleteDoc(doc(db, 'users', uid, 'groups', g.groupId));
              return null;
            }
            const data = groupSnap.data() as any;
            // Backfill memberCount for older groups (so UI can show “X members”).
            let memberCount: number | null =
              typeof data?.memberCount === 'number' ? data.memberCount : null;
            if (memberCount == null) {
              try {
                const ms = await getDocs(collection(db, 'groups', g.groupId, 'members'));
                memberCount = ms.size;
                await updateDoc(doc(db, 'groups', g.groupId), {
                  memberCount,
                  updatedAt: serverTimestamp(),
                });
              } catch {
                // Ignore (permissions/network); UI will show placeholder until it can be computed.
              }
            }
            return {
              ...g,
              logoUrl: data?.logoUrl ?? null,
              memberCount,
              lastActivityAt: data?.lastActivityAt ?? data?.updatedAt ?? null,
            } as UserGroupListItem;
          }),
        );

        const kept = checked.filter(Boolean) as UserGroupListItem[];
        onChange(kept.sort((a, b) => a.name.localeCompare(b.name)));
      })().catch((err) => {
        // Fallback: show what we have; caller can surface an error if desired.
        onChange(items.sort((a, b) => a.name.localeCompare(b.name)));
        onError?.(err);
      });
    },
    onError,
  );
}

export function subscribeMyGroupMeta(
  uid: string,
  groupId: string,
  onChange: (meta: UserGroupListItem | null) => void,
  onError?: (err: unknown) => void,
) {
  return onSnapshot(
    doc(db, 'users', uid, 'groups', groupId),
    (snap) => onChange(snap.exists() ? (snap.data() as UserGroupListItem) : null),
    onError,
  );
}

export async function markGroupChatSeen(params: { uid: string; groupId: string }) {
  await setDoc(
    doc(db, 'users', params.uid, 'groups', params.groupId),
    { chatLastSeenAt: serverTimestamp() },
    { merge: true },
  );
}

export async function markGroupPhotosSeen(params: { uid: string; groupId: string }) {
  await setDoc(
    doc(db, 'users', params.uid, 'groups', params.groupId),
    { photosLastSeenAt: serverTimestamp() },
    { merge: true },
  );
}

export async function setGroupLogoUrl(params: { groupId: string; logoUrl: string | null }) {
  await updateDoc(doc(db, 'groups', params.groupId), {
    logoUrl: params.logoUrl ?? null,
    updatedAt: serverTimestamp(),
  });
}

export async function touchGroupActivity(groupId: string) {
  await updateDoc(doc(db, 'groups', groupId), { lastActivityAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function setGroupStreakRule(params: { groupId: string; streakRule: 'workout' | 'any' }) {
  await updateDoc(doc(db, 'groups', params.groupId), {
    streakRule: params.streakRule,
    updatedAt: serverTimestamp(),
  });
}

export async function leaveGroup(params: { uid: string; groupId: string }) {
  // Update group metadata first (while user is still a member, so rules allow it)
  await updateDoc(doc(db, 'groups', params.groupId), {
    memberCount: increment(-1),
    lastActivityAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Then remove membership from both locations
  await Promise.all([
    deleteDoc(doc(db, 'groups', params.groupId, 'members', params.uid)),
    deleteDoc(doc(db, 'users', params.uid, 'groups', params.groupId)),
  ]);
}


