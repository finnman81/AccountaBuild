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
  if (!code || code.length !== 6) {
    throw new Error('Join code must be 6 characters');
  }
  const joinRef = doc(db, 'joinCodes', code);
  const joinSnap = await getDoc(joinRef);

  if (!joinSnap.exists()) {
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

  // Note: We don't check if the group exists here because Firestore rules require
  // membership to read group documents. If the join code exists, the group exists
  // (join codes are cleaned up when groups are deleted). The membership creation
  // will fail gracefully if the group was deleted.

  // Check if user is already a member
  const memberRef = doc(db, 'groups', groupId, 'members', params.uid);
  const memberSnap = await getDoc(memberRef);
  const isAlreadyMember = memberSnap.exists();

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
            // Also self-heal if an admin removed us: our own membership doc is
            // gone but the pointer under users/{uid}/groups lingers. Drop it so
            // the group disappears from our list.
            try {
              const meSnap = await getDoc(doc(db, 'groups', g.groupId, 'members', uid));
              if (!meSnap.exists()) {
                await deleteDoc(doc(db, 'users', uid, 'groups', g.groupId));
                return null;
              }
            } catch {
              // Ignore (permissions/network); keep showing the group for now.
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

export type GroupMember = { uid: string; role: 'admin' | 'member'; joinedAt?: unknown };

/** Live list of a group's members (from groups/{groupId}/members). */
export function subscribeGroupMembers(
  groupId: string,
  onChange: (members: GroupMember[]) => void,
  onError?: (err: unknown) => void,
) {
  return onSnapshot(
    collection(db, 'groups', groupId, 'members'),
    (snap) => {
      const members = snap.docs.map((d) => {
        const data = d.data() as any;
        return { uid: data?.uid ?? d.id, role: (data?.role as 'admin' | 'member') ?? 'member', joinedAt: data?.joinedAt ?? null };
      });
      onChange(members);
    },
    onError,
  );
}

/** Promote/demote a member (admin-only, enforced by rules). */
export async function setMemberRole(params: { groupId: string; memberUid: string; role: 'admin' | 'member' }) {
  await updateDoc(doc(db, 'groups', params.groupId, 'members', params.memberUid), {
    role: params.role,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Admin removes another member. Deletes the group-scoped membership doc and
 * decrements memberCount. The removed user's own users/{uid}/groups pointer
 * self-heals on their next groups read (see subscribeMyGroups), since rules
 * don't let one user write another's user-scoped docs.
 */
export async function removeMemberAsAdmin(params: { groupId: string; memberUid: string }) {
  await deleteDoc(doc(db, 'groups', params.groupId, 'members', params.memberUid));
  await updateDoc(doc(db, 'groups', params.groupId), {
    memberCount: increment(-1),
    lastActivityAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).catch(() => {
    // memberCount is best-effort; the membership delete is what matters.
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



/**
 * Canonical invite message shared to a native Share sheet from the group screens.
 * Keep the copy here so both entry points (GroupInfo, GroupList) stay in sync.
 */
export function buildInviteMessage(groupName: string | null | undefined, joinCode: string): string {
  const name = (groupName && groupName.trim()) || 'my group';
  // The link opens the app straight to the join screen when installed, and a
  // landing page (code + App Store button) when not. The code stays in the
  // text too: after a fresh install iOS drops the link context, and this
  // message is where the recipient finds it again.
  return `Join "${name}" on AccountaBuild. We hold each other to it: workouts, calories, weekly goals.\nhttps://app.munitor.ai/join/${joinCode}\nCode: ${joinCode}`;
}
