import { useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import type { Units } from '../utils/formatters';

/**
 * The signed-in user's display-units preference (imperial/metric), set during
 * onboarding. Weight is always STORED in lb everywhere in Firestore — this only
 * controls how it's DISPLAYED, and always reflects the current VIEWER's choice
 * (so a metric user sees teammates' weights in kg too, not just their own).
 * Defaults to 'imperial' while loading / if never set.
 */
export function useMyUnits(): Units {
  const { user } = useContext(AuthContext);
  const [units, setUnits] = useState<Units>('imperial');

  useEffect(() => {
    if (!user?.uid) {
      setUnits('imperial');
      return;
    }
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const raw = snap.exists() ? (snap.data() as any)?.units : null;
      setUnits(raw === 'metric' ? 'metric' : 'imperial');
    });
  }, [user?.uid]);

  return units;
}
