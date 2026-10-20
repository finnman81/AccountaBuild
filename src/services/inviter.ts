import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, updateDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';

/**
 * Inviter credit. joinGroupByCode stashes the joined group; Today asks "Who
 * got you here?" once; the answer lands on the member doc as `invitedBy`
 * (settable once, never yourself: firestore.rules), and the creditInviter
 * Cloud Function rewards the inviter.
 */
const key = (uid: string) => `askInviter:${uid}`;

export async function markInviterAsk(uid: string, groupId: string): Promise<void> {
  await AsyncStorage.setItem(key(uid), groupId).catch(() => {});
}

export async function getInviterAsk(uid: string): Promise<string | null> {
  return AsyncStorage.getItem(key(uid)).catch(() => null);
}

export async function clearInviterAsk(uid: string): Promise<void> {
  await AsyncStorage.removeItem(key(uid)).catch(() => {});
}

export async function setMyInviter(groupId: string, uid: string, inviterUid: string): Promise<void> {
  if (!inviterUid || inviterUid === uid) return;
  await updateDoc(doc(db, 'groups', groupId, 'members', uid), { invitedBy: inviterUid });
}
