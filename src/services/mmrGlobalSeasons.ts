import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { RULES_VERSION } from '../mmr/constants';

export type GlobalSeason = {
  seasonId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  rulesVersion: string;
  createdBy?: string;
};

function quarterRangeFromSeasonId(seasonId: string): { startDate: string; endDate: string } | null {
  const m = /^(\d{4})(Q[1-4])$/.exec(seasonId.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const q = m[2];
  if (!Number.isFinite(y)) return null;
  if (q === 'Q1') return { startDate: `${y}-01-01`, endDate: `${y}-03-31` };
  if (q === 'Q2') return { startDate: `${y}-04-01`, endDate: `${y}-06-30` };
  if (q === 'Q3') return { startDate: `${y}-07-01`, endDate: `${y}-09-30` };
  if (q === 'Q4') return { startDate: `${y}-10-01`, endDate: `${y}-12-31` };
  return null;
}

export function subscribeGlobalSeason(seasonId: string, onChange: (s: GlobalSeason | null) => void) {
  return onSnapshot(
    doc(db, 'globalSeasons', seasonId),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      const d = snap.data() as any;
      onChange({
        seasonId,
        startDate: String(d?.startDate ?? ''),
        endDate: String(d?.endDate ?? ''),
        rulesVersion: String(d?.rulesVersion ?? ''),
        createdBy: d?.createdBy ? String(d.createdBy) : undefined,
      });
    },
    () => onChange(null),
  );
}

export async function ensureGlobalSeasonDoc(uid: string, seasonId: string) {
  const range = quarterRangeFromSeasonId(seasonId);
  if (!range) return;
  const ref = doc(db, 'globalSeasons', seasonId);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(
    ref,
    {
      seasonId,
      startDate: range.startDate,
      endDate: range.endDate,
      rulesVersion: RULES_VERSION,
      createdBy: uid,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

