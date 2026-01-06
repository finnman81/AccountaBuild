import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import { db } from '../firebase/firebase';

export type UserGroupListItem = {
  groupId: string;
  name: string;
  description: string | null;
  joinCode: string;
  role: 'admin' | 'member';
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
      displayName: params.displayName ?? null,
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
  const joinRef = doc(db, 'joinCodes', code);
  const joinSnap = await getDoc(joinRef);
  if (!joinSnap.exists()) throw new Error('Invalid join code');

  const join = joinSnap.data() as { groupId: string; name?: string; description?: string | null; joinCode?: string };
  const groupId = join.groupId;
  const name = join.name ?? 'Group';
  const description = join.description ?? null;

  await Promise.all([
    setDoc(
      doc(db, 'groups', groupId, 'members', params.uid),
      { uid: params.uid, displayName: params.displayName ?? null, role: 'member', joinedAt: serverTimestamp() },
      { merge: true },
    ),
    setDoc(
      doc(db, 'users', params.uid, 'groups', groupId),
      {
        groupId,
        name,
        description,
        joinCode: join.joinCode ?? code,
        role: 'member',
        joinedAt: serverTimestamp(),
      },
      { merge: true },
    ),
  ]);

  return { groupId };
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
      onChange(items.sort((a, b) => a.name.localeCompare(b.name)));
    },
    onError,
  );
}


