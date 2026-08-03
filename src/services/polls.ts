import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';

/**
 * In-app polls, carried on the announcement pop-up (see WhatsNewModal).
 *
 * Deliberately NOT a survey SDK: those ship native modules (so every question
 * and every SDK bump needs a new build), cost a monthly fee, and route
 * health-adjacent data to a third party. This rides the announcement pipeline
 * we already have, so a new question is a pure Firestore write — no build, no
 * release, no vendor.
 *
 * Answers are write-only from the client (rules deny reads): a live tally
 * shown in the modal would bias later answers, and results are for admin
 * tooling anyway.
 */
export type PollOption = { id: string; label: string; emoji?: string };
export type Poll = {
  id: string;
  question?: string;
  options: PollOption[];
  /** Optional free-text prompt shown after answering ("tell me more"). */
  followUp?: string | null;
};

export function isValidPoll(p: any): p is Poll {
  return (
    !!p &&
    typeof p.id === 'string' &&
    Array.isArray(p.options) &&
    p.options.length >= 2 &&
    p.options.every((o: any) => o && typeof o.id === 'string' && typeof o.label === 'string')
  );
}

const answeredKey = (pollId: string, uid: string) => `pollAnswered:${pollId}:${uid}`;

/** Local record so the modal can show "answered" without a read permission. */
export async function getMyAnswer(pollId: string, uid: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(answeredKey(pollId, uid));
  } catch {
    return null;
  }
}

/**
 * Record an answer. Doc id is `{pollId}_{uid}` — the rules require that exact
 * shape, so one row per person is guaranteed by the id rather than a
 * read-then-write race. Re-answering updates the same row.
 */
export async function answerPoll(params: {
  pollId: string;
  uid: string;
  optionId: string;
  displayName?: string | null;
}): Promise<void> {
  const { pollId, uid, optionId } = params;
  await setDoc(
    doc(db, 'pollResponses', `${pollId}_${uid}`),
    {
      pollId,
      uid,
      optionId,
      // Denormalized so admin tooling doesn't need a join to read results.
      displayName: params.displayName ?? null,
      answeredAt: serverTimestamp(),
    },
    { merge: true },
  );
  await AsyncStorage.setItem(answeredKey(pollId, uid), optionId).catch(() => {});
}
