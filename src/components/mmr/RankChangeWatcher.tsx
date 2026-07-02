import { useContext, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

import { AuthContext } from '../../store/AuthContext';
import { subscribeMyMmrState } from '../../services/mmrState';
import { detectRankChange, rankKey, type RankRef } from '../../viewmodels/rankChange';
import type { Tier } from '../../mmr/types';

function parseKey(key: string): RankRef | null {
  const i = key.lastIndexOf('-');
  if (i < 0) return null;
  const tier = key.slice(0, i) as Tier;
  const div = Number(key.slice(i + 1));
  return { tier, division: div > 0 ? div : null };
}

/**
 * Watches my MMR rank and fires the Rank-up celebration when it changes since
 * last seen. Renders nothing. Only auto-shows PROMOTIONS — a demotion right after
 * a global MMR reset would be a false alarm, so the demotion screen exists but is
 * not auto-triggered here. First observation per device seeds the baseline
 * silently. Mounted inside the tab navigator so it can navigate.
 */
export default function RankChangeWatcher() {
  const { user } = useContext(AuthContext);
  const nav = useNavigation<any>();
  const busy = useRef(false);

  useEffect(() => {
    if (!user?.uid) return;
    const storageKey = `rank:lastSeen:${user.uid}`;

    return subscribeMyMmrState(user.uid, (state) => {
      if (!state?.rankTier || busy.current) return;
      const current: RankRef = { tier: state.rankTier, division: state.rankDivision ?? null };
      const currentKey = rankKey(current);

      busy.current = true;
      AsyncStorage.getItem(storageKey)
        .then((seen) => {
          if (!seen) return AsyncStorage.setItem(storageKey, currentKey); // seed silently
          if (seen === currentKey) return;
          const change = detectRankChange(parseKey(seen), current);
          return AsyncStorage.setItem(storageKey, currentKey).then(() => {
            if (change === 'promotion') {
              nav.navigate('RankUp', { tier: current.tier, division: current.division, kind: 'promotion', mmr: state.mmr });
            }
          });
        })
        .catch(() => {})
        .finally(() => {
          busy.current = false;
        });
    });
  }, [user?.uid]);

  return null;
}
