import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, updateDoc, doc } from 'firebase/firestore';

import { db } from '../firebase/firebase';

export type GroupIssue = {
  id: string;
  uid: string;
  text: string;
  resolved: boolean;
  createdAt: unknown;
  resolvedAt?: unknown;
  resolvedBy?: string;
};

export function subscribeGroupIssues(groupId: string, onChange: (issues: GroupIssue[]) => void) {
  const ref = query(collection(db, 'groups', groupId, 'issues'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    ref,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<GroupIssue, 'id'>),
      }));
      onChange(items);
    },
    (err) => {
      console.error('subscribeGroupIssues error:', err);
      onChange([]);
    },
  );
}

export async function addGroupIssue(params: { groupId: string; uid: string; text: string }) {
  const { groupId, uid, text } = params;
  if (!text.trim()) throw new Error('Issue text cannot be empty');
  await addDoc(collection(db, 'groups', groupId, 'issues'), {
    uid,
    text: text.trim(),
    resolved: false,
    createdAt: serverTimestamp(),
  });
}

export async function toggleIssueResolved(params: {
  groupId: string;
  issueId: string;
  resolved: boolean;
  resolvedBy: string;
}) {
  const { groupId, issueId, resolved, resolvedBy } = params;
  const ref = doc(db, 'groups', groupId, 'issues', issueId);
  await updateDoc(ref, {
    resolved,
    resolvedBy: resolved ? resolvedBy : null,
    resolvedAt: resolved ? serverTimestamp() : null,
  });
}
