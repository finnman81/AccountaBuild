import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';

import { db } from '../firebase/firebase';

/** Recruit contest (server: functions/contest.js). Read-only on the client. */
export type Contest = {
  id: string;
  name: string;
  startYmd: string;
  endYmd: string;
  resultsYmd: string;
  qualifyDays: number;
  qualifyWindowDays: number;
  prizes?: { first?: string; drawing?: string };
  rulesUrl?: string;
  status?: 'draft' | 'live' | 'final';
};

export type Standing = { uid: string; name: string; photoURL: string | null; qualified: number; pending: number };

/** The active contest (config/app.activeContestId), or null. */
export function subscribeActiveContest(onChange: (c: Contest | null) => void): () => void {
  let inner: (() => void) | null = null;
  const outer = onSnapshot(
    doc(db, 'config', 'app'),
    (snap) => {
      inner?.();
      inner = null;
      const id = snap.exists() ? (snap.data() as any)?.activeContestId : null;
      if (!id) {
        onChange(null);
        return;
      }
      inner = onSnapshot(
        doc(db, 'contests', String(id)),
        (c) => onChange(c.exists() ? ({ id: c.id, ...(c.data() as any) } as Contest) : null),
        () => onChange(null),
      );
    },
    () => onChange(null),
  );
  return () => {
    inner?.();
    outer();
  };
}

export function subscribeContestTop(contestId: string, n: number, onChange: (rows: Standing[]) => void): () => void {
  const q = query(collection(db, 'contests', contestId, 'standings'), orderBy('qualified', 'desc'), orderBy('lastQualifiedAt', 'asc'), limit(n));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data() as Standing).filter((s) => s.qualified > 0 || s.pending > 0)),
    () => onChange([]),
  );
}

export function subscribeMyStanding(contestId: string, uid: string, onChange: (s: Standing | null) => void): () => void {
  return onSnapshot(
    doc(db, 'contests', contestId, 'standings', uid),
    (s) => onChange(s.exists() ? (s.data() as Standing) : null),
    () => onChange(null),
  );
}
