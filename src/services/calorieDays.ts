import { collection, doc, documentId, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { isValidYYYYMMDD } from '../utils/dates';

export async function setCalorieDay(params: { uid: string; date: string; met: boolean }) {
  const date = params.date.trim();
  if (!isValidYYYYMMDD(date)) throw new Error('Invalid date');
  await setDoc(
    doc(db, 'users', params.uid, 'calorieDays', date),
    { met: params.met, source: 'self_reported', ts: serverTimestamp() },
    { merge: true },
  );
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function subscribeCalorieDays(
  uid: string,
  dates: string[],
  onChange: (map: Record<string, { met: boolean }>) => void,
) {
  const uniq = Array.from(new Set(dates.map((d) => d.trim()).filter(Boolean)));
  if (uniq.length === 0) {
    onChange({});
    return () => {};
  }

  let latest: Record<string, { met: boolean }> = {};
  const unsubs: Array<() => void> = [];
  const emit = () => onChange({ ...latest });

  for (const batch of chunk(uniq, 10)) {
    const ref = query(collection(db, 'users', uid, 'calorieDays'), where(documentId(), 'in', batch));
    const unsub = onSnapshot(ref, (snap) => {
      for (const d of snap.docs) {
        latest[d.id] = { met: Boolean((d.data() as any)?.met) };
      }
      emit();
    });
    unsubs.push(unsub);
  }

  return () => unsubs.forEach((u) => u());
}

