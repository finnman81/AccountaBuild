import { useContext, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

import { AuthContext } from '../../store/AuthContext';
import { subscribeMyMmrState } from '../../services/mmrState';
import { detectRankChange, rankKey, rankOrdinal, type RankRef } from '../../viewmodels/rankChange';
import type { Tier } from '../../mmr/types';

function parseKey(key: string): RankRef | null {
  const i = key.lastIndexOf('-');
  if (i < 0) return null;
  const tier = key.slice(0, i) as Tier;
  const div = Number(key.slice(i + 1));
  return { tier, division: div > 0 ? div : null };
}

/**
 * Watches my MMR rank and fires the Rank-up celebration on a genuine promotion.
 *
 * The stored baseline is a HIGH-WATER MARK — it only ever moves up. MMR state can
 * briefly emit a default (e.g. Iron) before the real value loads on a screen
 * refresh; without the high-water rule that transient dip would be recorded and
 * the real rank would then look like a fresh promotion on every refresh. By never
 * lowering the baseline (and only firing when current strictly exceeds it), a
 * transient dip is a no-op and we only celebrate real climbs above the peak.
 *
 * A short settle debounce further ignores mid-transition emissions. Demotions are
 * never auto-shown. First observation per device seeds silently.
 */
export default function RankChangeWatcher() {
  const { user } = useContext(AuthContext);
  const nav = useNavigation<any>();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    const storageKey = `rank:lastSeen:${user.uid}`;

    const evaluate = (state: { rankTier: Tier; rankDivision?: 1 | 2 | 3 | 4; mmr: number }) => {
      const current: RankRef = { tier: state.rankTier, division: state.rankDivision ?? null };
      AsyncStorage.getItem(storageKey)
        .then(async (seen) => {
          const prev = seen ? parseKey(seen) : null;
          // Seed silently on first observation.
          if (!prev) {
            await AsyncStorage.setItem(storageKey, rankKey(current));
            return;
          }
          // Only ever advance the baseline upward (high-water mark) — this makes
          // transient dips harmless and prevents repeat false promotions.
          if (rankOrdinal(current) <= rankOrdinal(prev)) return;
          const change = detectRankChange(prev, current);
          await AsyncStorage.setItem(storageKey, rankKey(current));
          if (change === 'promotion') {
            nav.navigate('RankUp', { tier: current.tier, division: current.division, kind: 'promotion', mmr: state.mmr });
          }
        })
        .catch(() => {});
    };

    return subscribeMyMmrState(user.uid, (state) => {
      if (!state?.rankTier) return;
      // Debounce so we act on the settled value, not a mid-write transient.
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => evaluate(state), 1200);
    });
  }, [user?.uid]);

  return null;
}
