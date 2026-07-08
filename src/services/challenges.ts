import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { weekIdForDate, type GroupChallenge } from '../mmr/challenge';

// Re-export the pure math + types so callers have a single import site.
export { weekIdForDate, challengeWeekIds, challengeProgress } from '../mmr/challenge';
export type { GroupChallenge, ChallengePhase, ChallengeProgress } from '../mmr/challenge';

/** Create or replace a group's challenge (owner/admin only, enforced by rules). */
export async function setGroupChallenge(params: {
  groupId: string;
  uid: string;
  name: string;
  startDate: string; // YYYY-MM-DD chosen by the owner
  durationWeeks: number;
}): Promise<void> {
  const startWeekId = weekIdForDate(params.startDate);
  const challenge: GroupChallenge = {
    name: params.name.trim() || 'Challenge',
    startWeekId,
    durationWeeks: Math.max(1, Math.min(52, Math.round(params.durationWeeks))),
    status: 'active',
    createdBy: params.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await updateDoc(doc(db, 'groups', params.groupId), { challenge, updatedAt: serverTimestamp() });
}

/** End a challenge early (keeps it visible as a completed round). */
export async function endGroupChallenge(groupId: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), {
    'challenge.status': 'ended',
    'challenge.updatedAt': serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Clear a challenge entirely. */
export async function clearGroupChallenge(groupId: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), { challenge: null, updatedAt: serverTimestamp() });
}

/** Live subscription to a group's challenge (null when none set). */
export function subscribeGroupChallenge(
  groupId: string,
  onChange: (challenge: GroupChallenge | null) => void,
  onError?: (err: unknown) => void,
) {
  return onSnapshot(
    doc(db, 'groups', groupId),
    (snap) => {
      const c = snap.exists() ? ((snap.data() as any)?.challenge ?? null) : null;
      if (!c || typeof c.startWeekId !== 'string' || typeof c.durationWeeks !== 'number') {
        onChange(null);
        return;
      }
      onChange(c as GroupChallenge);
    },
    onError,
  );
}
