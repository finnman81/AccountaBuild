import { doc, getDoc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export async function checkUsernameAvailability(normalizedUsername: string): Promise<boolean> {
  if (!db) throw new Error('Firebase is not initialized');
  
  const usernameRef = doc(db, 'usernames', normalizedUsername);
  const usernameDoc = await getDoc(usernameRef);
  return !usernameDoc.exists();
}

export async function reserveUsername(uid: string, username: string): Promise<void> {
  if (!db) throw new Error('Firebase is not initialized');
  
  const normalized = normalizeUsername(username);
  const usernameRef = doc(db, 'usernames', normalized);
  const userRef = doc(db, 'users', uid);
  
  await runTransaction(db, async (transaction) => {
    // Check if username is already taken
    const usernameDoc = await transaction.get(usernameRef);
    if (usernameDoc.exists()) {
      throw new Error('Username is already taken');
    }
    
    // Reserve the username
    transaction.set(usernameRef, {
      uid,
      createdAt: serverTimestamp(),
    });
    
    // Update user document with username
    transaction.update(userRef, {
      username: normalized,
      updatedAt: serverTimestamp(),
    });
  });
}
